#!/usr/bin/env python3
import json
import time
import urllib.request
from pathlib import Path

API_URL = "https://api.mcsrvstat.us/3/endcity.net"
ROOT = Path(__file__).resolve().parents[1]
OUT_FILE = ROOT / "data" / "playercount-history.json"
STATS_FILE = ROOT / "data" / "playercount-stats.json"
KEEP_SECONDS = 14 * 24 * 60 * 60
MAX_POINTS = 5000


def fetch_online_count() -> int:
    req = urllib.request.Request(
        API_URL,
        headers={
            "User-Agent": "endcity-playercount-collector/1.0",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if payload.get("online") is True:
        players = payload.get("players") or {}
        return int(players.get("online") or 0)
    return 0


def load_history() -> list:
    if not OUT_FILE.exists():
        return []
    try:
        data = json.loads(OUT_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    cleaned = []
    for point in data:
        if not isinstance(point, dict):
            continue
        t = point.get("t")
        v = point.get("v")
        if isinstance(t, (int, float)) and isinstance(v, (int, float)):
            cleaned.append({"t": int(t), "v": int(v)})
    return cleaned


def save_history(history: list) -> None:
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(history, separators=(",", ":")), encoding="utf-8")


def load_stats() -> dict:
    if not STATS_FILE.exists():
        return {"allTimeHigh": 0, "allTimeHighAt": 0}
    try:
        data = json.loads(STATS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"allTimeHigh": 0, "allTimeHighAt": 0}
    if not isinstance(data, dict):
        return {"allTimeHigh": 0, "allTimeHighAt": 0}
    return {
        "allTimeHigh": int(data.get("allTimeHigh") or 0),
        "allTimeHighAt": int(data.get("allTimeHighAt") or 0),
    }


def save_stats(stats: dict) -> None:
    STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATS_FILE.write_text(json.dumps(stats, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    now_ms = int(time.time() * 1000)
    cutoff_ms = now_ms - (KEEP_SECONDS * 1000)
    history = [p for p in load_history() if p["t"] >= cutoff_ms]
    count = fetch_online_count()
    history.append({"t": now_ms, "v": count})
    history = history[-MAX_POINTS:]
    stats = load_stats()
    if count > int(stats.get("allTimeHigh") or 0):
        stats["allTimeHigh"] = count
        stats["allTimeHighAt"] = now_ms
    save_history(history)
    save_stats(stats)
    print(
        "saved sample: online="
        + str(count)
        + ", points="
        + str(len(history))
        + ", allTimeHigh="
        + str(stats.get("allTimeHigh", 0))
    )


if __name__ == "__main__":
    main()
