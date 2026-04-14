import { connect } from "cloudflare:sockets";

const SERVER_HOST = "endcity.net";
const SERVER_PORT = 25565;
const STATUS_PROTOCOL_VERSION = 767;
const HISTORY_KEY = "history";
const STATS_KEY = "stats";
const CURRENT_KEY = "current";
const MAX_HISTORY_POINTS = 5000;
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;
const TRANSIENT_HOLD_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env) {
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
  },

  async scheduled(_event, env) {
    await collect(env);
  },
};

async function collect(env) {
  const now = Date.now();
  const lastCurrent = await getCachedCurrent(env);
  const snapshot = await fetchCurrent();
  const looksTransient =
    snapshot.online === false &&
    lastCurrent &&
    lastCurrent.online === true &&
    now - (Number(lastCurrent.updatedAt) || 0) <= TRANSIENT_HOLD_MS;

  const effectiveOnline = looksTransient ? true : snapshot.online;
  const effectiveCount = looksTransient
    ? Number(lastCurrent.onlineCount) || 0
    : snapshot.online
      ? snapshot.onlineCount
      : 0;
  const effectiveMax = looksTransient
    ? Number(lastCurrent.maxCount) || snapshot.maxCount || 0
    : snapshot.maxCount;
  const effectivePlayers = looksTransient
    ? Array.isArray(lastCurrent.players)
      ? lastCurrent.players
      : snapshot.players
    : snapshot.players;
  const effectiveVersion = looksTransient
    ? lastCurrent.version || snapshot.version
    : snapshot.version;

  const history = await getHistory(env);
  history.push({ t: now, v: effectiveCount });
  const cutoff = now - KEEP_MS;
  const pruned = history.filter((p) => p.t >= cutoff).slice(-MAX_HISTORY_POINTS);
  await env.PLAYERCOUNT_KV.put(HISTORY_KEY, JSON.stringify(pruned));

  const currentPayload = {
    online: effectiveOnline,
    onlineCount: effectiveCount,
    maxCount: effectiveMax,
    players: effectivePlayers,
    version: effectiveVersion,
    stale: looksTransient,
    checkedAt: now,
    updatedAt: now,
  };
  await env.PLAYERCOUNT_KV.put(CURRENT_KEY, JSON.stringify(currentPayload));

  const stats = await getStats(env);
  if (effectiveCount > (stats.allTimeHigh || 0)) {
    stats.allTimeHigh = effectiveCount;
    stats.allTimeHighAt = now;
    await env.PLAYERCOUNT_KV.put(STATS_KEY, JSON.stringify(stats));
  }

  return {
    ok: true,
    online: effectiveCount,
    points: pruned.length,
    allTimeHigh: stats.allTimeHigh || effectiveCount || 0,
    stale: looksTransient,
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
  try {
    const raw = await env.PLAYERCOUNT_KV.get(HISTORY_KEY, "text");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  } catch {
    return [];
  }
}

async function getStats(env) {
  try {
    const raw = await env.PLAYERCOUNT_KV.get(STATS_KEY, "text");
    if (!raw) return { allTimeHigh: 0, allTimeHighAt: 0 };
    const parsed = JSON.parse(raw);
    return {
      allTimeHigh: Number(parsed.allTimeHigh) || 0,
      allTimeHighAt: Number(parsed.allTimeHighAt) || 0,
    };
  } catch {
    return { allTimeHigh: 0, allTimeHighAt: 0 };
  }
}

async function getCurrent(env) {
  const cachedObj = await getCachedCurrent(env);
  if (cachedObj) return cachedObj;
  const snapshot = await fetchCurrent();
  return {
    online: snapshot.online,
    onlineCount: snapshot.onlineCount,
    maxCount: snapshot.maxCount,
    players: snapshot.players,
    version: snapshot.version,
    updatedAt: Date.now(),
  };
}

async function getCurrentLive(env) {
  const now = Date.now();
  try {
    const snapshot = await fetchCurrent();
    const payload = {
      online: snapshot.online,
      onlineCount: snapshot.onlineCount,
      maxCount: snapshot.maxCount,
      players: snapshot.players,
      version: snapshot.version,
      stale: false,
      checkedAt: now,
      updatedAt: now,
    };
    await env.PLAYERCOUNT_KV.put(CURRENT_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    const cached = await getCachedCurrent(env);
    if (cached) {
      return {
        ...cached,
        stale: true,
        checkedAt: now,
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
      updatedAt: now,
    };
  }
}

async function getCachedCurrent(env) {
  const cached = await env.PLAYERCOUNT_KV.get(CURRENT_KEY, "text");
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
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
