import { connect } from "cloudflare:sockets";

const SERVER_HOST = "endcity.net";
const SERVER_PORT = 25565;
const STATUS_PROTOCOL_VERSION = 767;
const MAX_HISTORY_POINTS = 5000;
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;

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

      return json(
        {
          ok: true,
          message: "Use /current, /history, /stats",
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
  const now = Date.now();
  const snapshot = await fetchCurrentSafe();
  const effectiveCount = snapshot.online ? snapshot.onlineCount : 0;
  await insertHistoryPoint(env, now, effectiveCount);
  const pruned = await pruneHistory(env, now - KEEP_MS);
  const statsWriteOk = await upsertAllTimeHighIfHigher(env, effectiveCount, now);
  const stats = await getStats(env);
  const totalPoints = await countHistoryPoints(env);

  return {
    ok: true,
    online: effectiveCount,
    points: totalPoints,
    allTimeHigh: stats.allTimeHigh || effectiveCount || 0,
    stale: false,
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

async function fetchCurrentSafe() {
  try {
    return await fetchCurrent();
  } catch {
    return {
      online: false,
      onlineCount: 0,
      maxCount: 0,
      players: [],
      version: "Unknown",
    };
  }
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

    const responsePacket = await readPacket(reader, 7000);
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
    return rows
      .map((r) => ({ t: Number(r.t), v: Number(r.v) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
      .reverse();
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
  const snapshot = await fetchCurrentSafe();
  return {
    online: snapshot.online,
    onlineCount: snapshot.onlineCount,
    maxCount: snapshot.maxCount,
    players: snapshot.players,
    version: snapshot.version,
    updatedAt: Date.now(),
  };
}

async function getCurrentLive(_env) {
  const now = Date.now();
  const snapshot = await fetchCurrentSafe();
  return {
    online: snapshot.online,
    onlineCount: snapshot.onlineCount,
    maxCount: snapshot.maxCount,
    players: snapshot.players,
    version: snapshot.version,
    stale: false,
    checkedAt: now,
    updatedAt: now,
  };
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
