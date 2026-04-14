const SERVER_HOST = "endcity.net";
const MC_STATUS_URL = `https://api.mcsrvstat.us/3/${SERVER_HOST}`;
const HISTORY_KEY = "history";
const STATS_KEY = "stats";
const CURRENT_KEY = "current";
const MAX_HISTORY_POINTS = 5000;
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/current") {
      return json(await getCurrent(env));
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
  const snapshot = await fetchCurrent();
  const now = Date.now();
  const history = await getHistory(env);
  history.push({ t: now, v: snapshot.online ? snapshot.onlineCount : 0 });
  const cutoff = now - KEEP_MS;
  const pruned = history.filter((p) => p.t >= cutoff).slice(-MAX_HISTORY_POINTS);
  await env.PLAYERCOUNT_KV.put(HISTORY_KEY, JSON.stringify(pruned));

  const currentPayload = {
    online: snapshot.online,
    onlineCount: snapshot.onlineCount,
    maxCount: snapshot.maxCount,
    players: snapshot.players,
    version: snapshot.version,
    updatedAt: now,
  };
  await env.PLAYERCOUNT_KV.put(CURRENT_KEY, JSON.stringify(currentPayload));

  const stats = await getStats(env);
  if ((snapshot.online ? snapshot.onlineCount : 0) > (stats.allTimeHigh || 0)) {
    stats.allTimeHigh = snapshot.onlineCount;
    stats.allTimeHighAt = now;
    await env.PLAYERCOUNT_KV.put(STATS_KEY, JSON.stringify(stats));
  }

  return {
    ok: true,
    online: snapshot.onlineCount,
    points: pruned.length,
    allTimeHigh: stats.allTimeHigh || snapshot.onlineCount || 0,
  };
}

async function fetchCurrent() {
  const resp = await fetch(MC_STATUS_URL, {
    headers: { "Cache-Control": "no-cache", "User-Agent": "endcity-playercount-worker/1.0" },
  });
  if (!resp.ok) {
    throw new Error(`status fetch failed: ${resp.status}`);
  }
  const data = await resp.json();
  const players = data.players || {};
  return {
    online: data.online === true,
    onlineCount: Number(players.online) || 0,
    maxCount: Number(players.max) || 0,
    players: normalizePlayers(players.list),
    version: data.version || "Unknown",
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
  const cached = await env.PLAYERCOUNT_KV.get(CURRENT_KEY, "text");
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore
    }
  }
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
