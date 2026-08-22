import { connect } from "cloudflare:sockets";

const SERVER_HOST = "endcity.net";
const SERVER_PORT = 25565;
const STATUS_PROTOCOL_VERSION = 767;
const MAX_HISTORY_POINTS = 5000;
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;
const PING_ATTEMPTS = 3;
const PING_TIMEOUT_MS = 4000;
const OUTAGE_MARK_MS = 20 * 60 * 1000;
const LAST_GOOD_MAX_AGE_MS = 30 * 60 * 1000;
const DROPOUT_ZERO_MS = 30 * 60 * 1000;

/** KV key for shop economy JSON (same shape as data/shop-price-changes.json). */
const ECONOMY_KV_KEY = "shop_economy_snapshot_v1";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/current") {
        return json(await getCurrentLive(env));
      }

      if (url.pathname === "/history") {
        const history = await getHistory(env);
        const stats = await getStats(env);
        return json({
          history,
          allTimeHigh: stats.allTimeHigh || 0,
          allTimeHighAt: stats.allTimeHighAt || 0,
        });
      }

      if (url.pathname === "/stats") {
        return json(await getStats(env));
      }

      if (url.pathname === "/collect" && request.method === "POST") {
        const result = await collect(env);
        return json(result);
      }

      if (url.pathname === "/economy" || url.pathname === "/shop-price-changes.json") {
        if (request.method === "GET" || request.method === "HEAD") {
          return economyGet(env, request.method === "HEAD");
        }
        if (request.method === "PUT" || request.method === "POST") {
          return economyIngest(request, env);
        }
        return json({ ok: false, error: "method_not_allowed" }, 405);
      }

      return json(
        {
          ok: true,
          message: "Use /current, /history, /stats, /economy",
        },
        200
      );
    } catch (err) {
      return json(
        {
          ok: false,
          error: "worker_exception",
          message: err && err.message ? String(err.message) : "Unknown worker exception",
        },
        500
      );
    }
  },

  async scheduled(_event, env) {
    try {
      await collect(env);
    } catch (err) {
      console.error("scheduled collect failed", err);
    }
  },
};

async function collect(env) {
  if (!env || !env.PLAYERCOUNT_DB) {
    throw new Error("Missing PLAYERCOUNT_DB binding");
  }
  await ensureLastSnapshotTable(env);
  const now = Date.now();
  const snapshot = await fetchCurrentWithRetry();
  let wrote = false;
  let recordedCount = null;

  if (snapshot.online) {
    recordedCount = snapshot.onlineCount;
    wrote = await insertHistoryPoint(env, now, recordedCount);
    await saveLastSnapshot(env, snapshot, now);
  } else {
    const last = await getLastHistoryPoint(env);
    const confirmedOutage = last && (last.v === 0 || now - last.t >= OUTAGE_MARK_MS);
    if (confirmedOutage) {
      recordedCount = 0;
      wrote = await insertHistoryPoint(env, now, 0);
    }
  }

  const pruned = await pruneHistory(env, now - KEEP_MS);
  const statsWriteOk =
    recordedCount != null && recordedCount > 0
      ? await upsertAllTimeHighIfHigher(env, recordedCount, now)
      : true;
  const stats = await getStats(env);
  const totalPoints = await countHistoryPoints(env);

  return {
    ok: true,
    online: snapshot.online ? snapshot.onlineCount : recordedCount == null ? null : recordedCount,
    skippedUnreachable: !snapshot.online && recordedCount == null,
    wrote,
    points: totalPoints,
    allTimeHigh: stats.allTimeHigh || recordedCount || 0,
    stale: !snapshot.online,
    pruned,
    persistedStats: statsWriteOk,
  };
}

async function fetchCurrent() {
  const data = await pingMinecraftStatus(SERVER_HOST, SERVER_PORT);
  const players = data.players || {};
  return {
    online: true,
    onlineCount: Number(players.online) || 0,
    maxCount: Number(players.max) || 0,
    players: normalizePlayers(players.sample),
    version: (data.version && data.version.name) || "Unknown",
  };
}

function unreachableSnapshot() {
  return {
    online: false,
    onlineCount: 0,
    maxCount: 0,
    players: [],
    version: "Unknown",
  };
}

async function fetchCurrentWithRetry() {
  for (let attempt = 0; attempt < PING_ATTEMPTS; attempt += 1) {
    try {
      return await fetchCurrent();
    } catch {
      if (attempt < PING_ATTEMPTS - 1) {
        await sleep(200);
      }
    }
  }
  return unreachableSnapshot();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Failed Minecraft pings were stored as 0, which draws a barcode.
 * Drop short zero runs that sit between real counts.
 */
function dropDropoutZeros(points) {
  if (!Array.isArray(points) || !points.length) return [];
  const keep = points.map(() => true);
  let i = 0;
  while (i < points.length) {
    if (points[i].v > 0) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < points.length && points[i].v === 0) i += 1;
    const end = i - 1;
    const prev = start > 0 ? points[start - 1] : null;
    const next = end + 1 < points.length ? points[end + 1] : null;
    const runMs = points[end].t - points[start].t;
    const flanked =
      prev &&
      next &&
      prev.v > 0 &&
      next.v > 0 &&
      points[start].t - prev.t <= DROPOUT_ZERO_MS &&
      next.t - points[end].t <= DROPOUT_ZERO_MS &&
      runMs <= DROPOUT_ZERO_MS;
    const trailingShort =
      prev && prev.v > 0 && !next && points[end].t - prev.t <= DROPOUT_ZERO_MS;
    if (flanked || trailingShort) {
      for (let k = start; k <= end; k += 1) keep[k] = false;
    }
  }
  return points.filter((_, idx) => keep[idx]);
}

function normalizePlayers(list) {
  if (!Array.isArray(list)) return [];
  const names = list
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (!entry || typeof entry !== "object") return "";
      return String(
        entry.name_clean ||
          entry.name_raw ||
          entry.name ||
          entry.username ||
          entry.player ||
          entry.id ||
          ""
      ).trim();
    })
    .filter(Boolean);
  return [...new Set(names)];
}

async function pingMinecraftStatus(host, port) {
  const socket = connect({ hostname: host, port });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  try {
    const handshakeBody = concatBytes(
      encodeVarInt(0x00),
      encodeVarInt(STATUS_PROTOCOL_VERSION),
      encodeString(host),
      encodeUnsignedShort(port),
      encodeVarInt(0x01)
    );
    const handshakePacket = concatBytes(encodeVarInt(handshakeBody.length), handshakeBody);

    const requestBody = encodeVarInt(0x00);
    const requestPacket = concatBytes(encodeVarInt(requestBody.length), requestBody);

    await writer.write(handshakePacket);
    await writer.write(requestPacket);

    const responsePacket = await readPacket(reader, PING_TIMEOUT_MS);
    if (!responsePacket) throw new Error("No status response packet");

    const state = { offset: 0 };
    const packetId = decodeVarInt(responsePacket, state);
    if (packetId !== 0x00) throw new Error(`Unexpected packet id: ${packetId}`);
    const jsonText = decodeString(responsePacket, state);
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid status payload");
    return parsed;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    try {
      socket.close();
    } catch {
      // ignore
    }
  }
}

async function readPacket(reader, timeoutMs) {
  const chunks = [];
  let total = 0;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const chunkResult = await readWithTimeout(reader, remaining);
    if (!chunkResult) break;
    const { value, done } = chunkResult;
    if (done) break;

    if (value && value.length) {
      chunks.push(value);
      total += value.length;
      const merged = mergeChunks(chunks, total);
      const state = { offset: 0 };
      try {
        const packetLen = decodeVarInt(merged, state);
        if (merged.length - state.offset >= packetLen) {
          return merged.slice(state.offset, state.offset + packetLen);
        }
      } catch {
        // keep reading
      }
    }
  }
  return null;
}

async function readWithTimeout(reader, timeoutMs) {
  try {
    return await Promise.race([
      reader.read(),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

function mergeChunks(chunks, totalLen) {
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function encodeVarInt(value) {
  const out = [];
  let val = value >>> 0;
  do {
    let temp = val & 0x7f;
    val >>>= 7;
    if (val !== 0) temp |= 0x80;
    out.push(temp);
  } while (val !== 0);
  return new Uint8Array(out);
}

function decodeVarInt(bytes, state) {
  let numRead = 0;
  let result = 0;
  let read;
  do {
    if (state.offset >= bytes.length) throw new Error("VarInt out of bounds");
    read = bytes[state.offset++];
    const value = read & 0x7f;
    result |= value << (7 * numRead);
    numRead += 1;
    if (numRead > 5) throw new Error("VarInt too big");
  } while ((read & 0x80) !== 0);
  return result;
}

function encodeString(text) {
  const utf8 = new TextEncoder().encode(text);
  return concatBytes(encodeVarInt(utf8.length), utf8);
}

function decodeString(bytes, state) {
  const len = decodeVarInt(bytes, state);
  const end = state.offset + len;
  if (end > bytes.length) throw new Error("String out of bounds");
  const out = bytes.slice(state.offset, end);
  state.offset = end;
  return new TextDecoder().decode(out);
}

function encodeUnsignedShort(num) {
  return new Uint8Array([(num >> 8) & 0xff, num & 0xff]);
}

function concatBytes(...parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function getHistory(env) {
  if (!env || !env.PLAYERCOUNT_DB) return [];
  try {
    const rs = await env.PLAYERCOUNT_DB.prepare(
      "SELECT t, v FROM playercount_history ORDER BY t DESC LIMIT ?1"
    )
      .bind(MAX_HISTORY_POINTS)
      .all();
    const rows = Array.isArray(rs.results) ? rs.results : [];
    return dropDropoutZeros(
      rows
        .map((r) => ({ t: Number(r.t), v: Number(r.v) }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
        .reverse()
    );
  } catch {
    return [];
  }
}

async function getStats(env) {
  if (!env || !env.PLAYERCOUNT_DB) return { allTimeHigh: 0, allTimeHighAt: 0 };
  try {
    const row = await env.PLAYERCOUNT_DB.prepare(
      "SELECT all_time_high, all_time_high_at FROM playercount_stats WHERE id = 1"
    ).first();
    if (!row) return { allTimeHigh: 0, allTimeHighAt: 0 };
    return {
      allTimeHigh: Number(row.all_time_high) || 0,
      allTimeHighAt: Number(row.all_time_high_at) || 0,
    };
  } catch {
    return { allTimeHigh: 0, allTimeHighAt: 0 };
  }
}

async function getCurrent(env) {
  return getCurrentLive(env);
}

async function getCurrentLive(env) {
  const now = Date.now();
  const snapshot = await fetchCurrentWithRetry();
  if (snapshot.online) {
    return {
      online: true,
      onlineCount: snapshot.onlineCount,
      maxCount: snapshot.maxCount,
      players: snapshot.players,
      version: snapshot.version,
      stale: false,
      checkedAt: now,
      updatedAt: now,
    };
  }

  await ensureLastSnapshotTable(env);
  const cached = await getLastSnapshot(env);
  if (cached && now - cached.t <= LAST_GOOD_MAX_AGE_MS) {
    return {
      online: true,
      onlineCount: cached.onlineCount,
      maxCount: cached.maxCount,
      players: cached.players,
      version: cached.version,
      stale: true,
      checkedAt: now,
      updatedAt: cached.t,
    };
  }

  const last = await getLastHistoryPoint(env);
  if (last && last.v > 0 && now - last.t <= LAST_GOOD_MAX_AGE_MS) {
    return {
      online: true,
      onlineCount: last.v,
      maxCount: 0,
      players: [],
      version: "Unknown",
      stale: true,
      checkedAt: now,
      updatedAt: last.t,
    };
  }

  return {
    online: false,
    onlineCount: 0,
    maxCount: 0,
    players: [],
    version: "Unknown",
    stale: true,
    checkedAt: now,
    updatedAt: cached && cached.t ? cached.t : now,
  };
}

async function ensureLastSnapshotTable(env) {
  if (!env || !env.PLAYERCOUNT_DB) return;
  try {
    await env.PLAYERCOUNT_DB.prepare(
      `CREATE TABLE IF NOT EXISTS playercount_last (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        t INTEGER NOT NULL,
        online_count INTEGER NOT NULL,
        max_count INTEGER NOT NULL DEFAULT 0,
        version TEXT,
        players_json TEXT,
        online INTEGER NOT NULL DEFAULT 1
      )`
    ).run();
  } catch {
    // ignore
  }
}

async function saveLastSnapshot(env, snapshot, at) {
  if (!env || !env.PLAYERCOUNT_DB) return false;
  try {
    await env.PLAYERCOUNT_DB.prepare(
      `INSERT INTO playercount_last (id, t, online_count, max_count, version, players_json, online)
       VALUES (1, ?1, ?2, ?3, ?4, ?5, 1)
       ON CONFLICT(id) DO UPDATE SET
         t = excluded.t,
         online_count = excluded.online_count,
         max_count = excluded.max_count,
         version = excluded.version,
         players_json = excluded.players_json,
         online = 1`
    )
      .bind(
        Number(at),
        Number(snapshot.onlineCount) || 0,
        Number(snapshot.maxCount) || 0,
        String(snapshot.version || "Unknown"),
        JSON.stringify(Array.isArray(snapshot.players) ? snapshot.players : [])
      )
      .run();
    return true;
  } catch {
    return false;
  }
}

async function getLastSnapshot(env) {
  if (!env || !env.PLAYERCOUNT_DB) return null;
  try {
    const row = await env.PLAYERCOUNT_DB.prepare(
      "SELECT t, online_count, max_count, version, players_json FROM playercount_last WHERE id = 1"
    ).first();
    if (!row) return null;
    let players = [];
    try {
      const parsed = JSON.parse(row.players_json || "[]");
      if (Array.isArray(parsed)) players = parsed;
    } catch {
      players = [];
    }
    return {
      t: Number(row.t) || 0,
      onlineCount: Number(row.online_count) || 0,
      maxCount: Number(row.max_count) || 0,
      version: row.version || "Unknown",
      players,
    };
  } catch {
    return null;
  }
}

async function getLastHistoryPoint(env) {
  if (!env || !env.PLAYERCOUNT_DB) return null;
  try {
    const row = await env.PLAYERCOUNT_DB.prepare(
      "SELECT t, v FROM playercount_history ORDER BY t DESC LIMIT 1"
    ).first();
    if (!row) return null;
    const t = Number(row.t);
    const v = Number(row.v);
    if (!Number.isFinite(t) || !Number.isFinite(v)) return null;
    return { t, v };
  } catch {
    return null;
  }
}

async function insertHistoryPoint(env, t, v) {
  if (!env || !env.PLAYERCOUNT_DB) return false;
  try {
    await env.PLAYERCOUNT_DB.prepare(
      "INSERT INTO playercount_history (t, v) VALUES (?1, ?2)"
    )
      .bind(Number(t), Number(v))
      .run();
    return true;
  } catch {
    return false;
  }
}

async function pruneHistory(env, cutoffMs) {
  if (!env || !env.PLAYERCOUNT_DB) return 0;
  try {
    const rs = await env.PLAYERCOUNT_DB.prepare(
      "DELETE FROM playercount_history WHERE t < ?1"
    )
      .bind(Number(cutoffMs))
      .run();
    return Number(rs.meta && rs.meta.changes) || 0;
  } catch {
    return 0;
  }
}

async function upsertAllTimeHighIfHigher(env, value, at) {
  if (!env || !env.PLAYERCOUNT_DB) return false;
  try {
    await env.PLAYERCOUNT_DB.prepare(
      "INSERT OR IGNORE INTO playercount_stats (id, all_time_high, all_time_high_at) VALUES (1, 0, 0)"
    ).run();
    await env.PLAYERCOUNT_DB.prepare(
      `UPDATE playercount_stats
       SET all_time_high = ?1,
           all_time_high_at = ?2
       WHERE id = 1 AND ?1 > all_time_high`
    )
      .bind(Number(value), Number(at))
      .run();
    return true;
  } catch {
    return false;
  }
}

async function countHistoryPoints(env) {
  if (!env || !env.PLAYERCOUNT_DB) return 0;
  try {
    const row = await env.PLAYERCOUNT_DB.prepare(
      "SELECT COUNT(*) AS c FROM playercount_history"
    ).first();
    return Number(row && row.c) || 0;
  } catch {
    return 0;
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function corsJsonHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60",
    "access-control-allow-origin": "*",
  };
}

/**
 * Public read: latest shop snapshot written by your plugin (PUT /economy).
 */
async function economyGet(env, headOnly) {
  if (!env || !env.ECONOMY_KV) {
    return json(
      {
        ok: false,
        error: "economy_kv_not_configured",
        message: "Add a KV namespace binding ECONOMY_KV in wrangler.toml",
      },
      503
    );
  }
  const raw = await env.ECONOMY_KV.get(ECONOMY_KV_KEY);
  if (!raw) {
    return json({ ok: false, error: "no_economy_snapshot" }, 404);
  }
  if (headOnly) {
    return new Response(null, {
      status: 200,
      headers: corsJsonHeaders(),
    });
  }
  return new Response(raw, {
    status: 200,
    headers: corsJsonHeaders(),
  });
}

/**
 * Ingest from Minecraft plugin only. Set secret: wrangler secret put ECONOMY_INGEST_SECRET
 * Header: Authorization: Bearer <same secret>
 */
async function economyIngest(request, env) {
  if (!env || !env.ECONOMY_KV) {
    return json({ ok: false, error: "economy_kv_not_configured" }, 503);
  }
  const secret = env.ECONOMY_INGEST_SECRET;
  if (!secret || typeof secret !== "string") {
    return json(
      {
        ok: false,
        error: "economy_secret_not_configured",
        message: "Set ECONOMY_INGEST_SECRET with wrangler secret put ECONOMY_INGEST_SECRET",
      },
      503
    );
  }
  const auth = request.headers.get("Authorization") || "";
  const expected = "Bearer " + secret;
  if (auth !== expected) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const body = await request.text();
  if (!body || body.length > 2_000_000) {
    return json({ ok: false, error: "body_too_large_or_empty" }, 400);
  }
  try {
    JSON.parse(body);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  await env.ECONOMY_KV.put(ECONOMY_KV_KEY, body);
  return json({ ok: true, saved: true, bytes: body.length });
}
