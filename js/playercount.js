(function () {
  var graph = document.getElementById("pc-graph");
  if (!graph) return;

  var API_URL = "https://api.mcsrvstat.us/3/endcity.net";
  var POLL_MS = 30 * 1000;
  var HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
  var SHARED_HISTORY_URL = "data/playercount-history.json";
  var SHARED_STATS_URL = "data/playercount-stats.json";
  var MAX_SAMPLES = 3000;

  var onlineEl = document.getElementById("pc-online");
  var maxEl = document.getElementById("pc-max");
  var versionEl = document.getElementById("pc-server-version");
  var updatedEl = document.getElementById("pc-last-updated");
  var stateEl = document.getElementById("pc-online-state");
  var peak24hEl = document.getElementById("pc-peak-24h");
  var peak24hTimeEl = document.getElementById("pc-peak-24h-time");
  var allTimeEl = document.getElementById("pc-alltime-high");
  var allTimeTimeEl = document.getElementById("pc-alltime-time");
  var playerListEl = document.getElementById("pc-player-list");
  var playerEmptyEl = document.getElementById("pc-player-empty");
  var playerNoteEl = document.getElementById("pc-player-note");
  var lineEl = document.getElementById("pc-line");
  var pointsEl = document.getElementById("pc-points");
  var gridlinesEl = document.getElementById("pc-gridlines");
  var yLabelsEl = document.getElementById("pc-ylabels");
  var xLabelsEl = document.getElementById("pc-xlabels");

  var history = [];
  var allTimeHigh = { value: 0, timestamp: 0 };

  function normalizeHistory(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (pt) {
        return pt && Number.isFinite(Number(pt.t)) && Number.isFinite(Number(pt.v));
      })
      .map(function (pt) {
        return { t: Number(pt.t), v: Number(pt.v) };
      })
      .slice(-MAX_SAMPLES);
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function fmtDateTime(ts) {
    return new Date(ts).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function addSample(value) {
    var now = Date.now();
    history.push({ t: now, v: value });
    var cutoff = now - HISTORY_WINDOW_MS;
    history = history.filter(function (pt) {
      return pt.t >= cutoff;
    });
    if (history.length > MAX_SAMPLES) {
      history = history.slice(-MAX_SAMPLES);
    }
  }

  function normalizePlayers(list) {
    if (!Array.isArray(list)) return [];
    var names = list
      .map(function (entry) {
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
      .filter(function (name) {
        return name.length > 0;
      });
    return Array.from(new Set(names));
  }

  function setPlayers(list) {
    playerListEl.innerHTML = "";
    if (!Array.isArray(list) || list.length === 0) {
      playerEmptyEl.hidden = false;
      return;
    }
    playerEmptyEl.hidden = true;
    list.forEach(function (name) {
      var li = document.createElement("li");
      li.textContent = String(name);
      playerListEl.appendChild(li);
    });
  }

  function updatePeakCards() {
    if (history.length > 0) {
      var peak24h = history.reduce(function (best, pt) {
        if (!best || pt.v > best.v) return pt;
        return best;
      }, null);
      if (peak24hEl) peak24hEl.textContent = String(peak24h.v);
      if (peak24hTimeEl) peak24hTimeEl.textContent = "at " + fmtDateTime(peak24h.t);
    } else {
      if (peak24hEl) peak24hEl.textContent = "0";
      if (peak24hTimeEl) peak24hTimeEl.textContent = "No samples yet";
    }

    if (allTimeEl) allTimeEl.textContent = String(allTimeHigh.value || 0);
    if (allTimeTimeEl) {
      allTimeTimeEl.textContent = allTimeHigh.timestamp
        ? "at " + fmtDateTime(allTimeHigh.timestamp)
        : "No samples yet";
    }
  }

  function drawGraph() {
    var width = 900;
    var height = 260;
    var pad = { top: 18, right: 24, bottom: 30, left: 24 };
    var innerW = width - pad.left - pad.right;
    var innerH = height - pad.top - pad.bottom;
    var now = Date.now();
    var minT = now - HISTORY_WINDOW_MS;
    var minY = 0;
    var maxY = 10;

    if (history.length > 0) {
      var peak = history.reduce(function (m, pt) {
        return Math.max(m, pt.v);
      }, 0);
      maxY = Math.max(10, peak + 2);
    }

    function xScale(t) {
      return pad.left + ((t - minT) / HISTORY_WINDOW_MS) * innerW;
    }

    function yScale(v) {
      return pad.top + (1 - (v - minY) / Math.max(1, maxY - minY)) * innerH;
    }

    gridlinesEl.innerHTML = "";
    pointsEl.innerHTML = "";
    yLabelsEl.innerHTML = "";
    xLabelsEl.innerHTML = "";

    for (var i = 0; i <= 4; i += 1) {
      var yVal = Math.round((maxY / 4) * i);
      var y = yScale(yVal);
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(pad.left));
      line.setAttribute("x2", String(width - pad.right));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("class", "status-gridline");
      gridlinesEl.appendChild(line);

      var yLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      yLabel.setAttribute("x", String(width - pad.right + 4));
      yLabel.setAttribute("y", String(y + 4));
      yLabel.setAttribute("class", "status-axis-label");
      yLabel.textContent = String(yVal);
      yLabelsEl.appendChild(yLabel);
    }

    for (var j = 0; j <= 8; j += 1) {
      var t = minT + (HISTORY_WINDOW_MS / 8) * j;
      var x = xScale(t);
      var xLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      xLabel.setAttribute("x", String(x));
      xLabel.setAttribute("y", String(height - 8));
      xLabel.setAttribute("text-anchor", "middle");
      xLabel.setAttribute("class", "status-axis-label");
      xLabel.textContent = new Date(t).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      xLabelsEl.appendChild(xLabel);
    }

    if (history.length === 0) {
      lineEl.setAttribute("d", "");
      updatePeakCards();
      return;
    }

    var d = "";
    history.forEach(function (pt, idx) {
      var x = xScale(pt.t);
      var y = yScale(pt.v);
      d += (idx === 0 ? "M" : " L") + x.toFixed(2) + " " + y.toFixed(2);

      if (idx === history.length - 1) {
        var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", x.toFixed(2));
        dot.setAttribute("cy", y.toFixed(2));
        dot.setAttribute("r", "4");
        dot.setAttribute("class", "status-point status-point--latest");
        pointsEl.appendChild(dot);
      }
    });

    lineEl.setAttribute("d", d);
    updatePeakCards();
  }

  function updateStatus(data) {
    var online = data && data.online === true;
    var players = (data && data.players) || {};
    var onlineCount = Number(players.online) || 0;
    var maxCount = Number(players.max) || 0;
    var list = normalizePlayers(players.list);
    var version = (data && data.version) || "Unknown";
    var nowTs = Date.now();

    if (online) {
      onlineEl.textContent = String(onlineCount);
      maxEl.textContent = String(maxCount);
      stateEl.textContent = "Online";
      stateEl.classList.remove("is-offline");
      versionEl.textContent = "Version: " + version;
      setPlayers(list);
      if (onlineCount > (allTimeHigh.value || 0)) {
        allTimeHigh.value = onlineCount;
        allTimeHigh.timestamp = nowTs;
      }
      if (playerNoteEl) {
        var missing = Math.max(0, onlineCount - list.length);
        if (missing > 0) {
          playerNoteEl.hidden = false;
          playerNoteEl.textContent = "+" + missing + " more online";
        } else {
          playerNoteEl.hidden = true;
          playerNoteEl.textContent = "";
        }
      }
      addSample(onlineCount);
    } else {
      onlineEl.textContent = "0";
      maxEl.textContent = "0";
      stateEl.textContent = "Offline / unreachable";
      stateEl.classList.add("is-offline");
      versionEl.textContent = "Version: unavailable";
      setPlayers([]);
      if (playerNoteEl) {
        playerNoteEl.hidden = true;
        playerNoteEl.textContent = "";
      }
      addSample(0);
    }

    updatedEl.textContent = "Last updated: " + fmtTime(nowTs);
    drawGraph();
  }

  function fetchStatus() {
    fetch(API_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(updateStatus)
      .catch(function () {
        updateStatus({ online: false });
      });
  }

  function loadSharedHistory() {
    return fetch(SHARED_HISTORY_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) return [];
        return res.json();
      })
      .then(function (data) {
        history = normalizeHistory(data);
      })
      .catch(function () {
        history = [];
      });
  }

  function loadSharedStats() {
    return fetch(SHARED_STATS_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || typeof data !== "object") return;
        var value = Number(data.allTimeHigh);
        var timestamp = Number(data.allTimeHighAt);
        allTimeHigh = {
          value: Number.isFinite(value) ? value : 0,
          timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        };
      })
      .catch(function () {
        allTimeHigh = { value: 0, timestamp: 0 };
      });
  }

  Promise.all([loadSharedHistory(), loadSharedStats()]).finally(function () {
    drawGraph();
    fetchStatus();
    window.setInterval(fetchStatus, POLL_MS);
  });
})();
