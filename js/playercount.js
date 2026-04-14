(function () {
  var graph = document.getElementById("pc-graph");
  if (!graph) return;

  var cfg = window.ENDCITY_CONFIG || window.SOLAR_CONFIG || {};
  var apiBase = String(cfg.playercountApiBase || "").trim().replace(/\/+$/, "");
  if (!apiBase) return;

  var API_URL = apiBase + "/current";
  var HISTORY_URL = apiBase + "/history";
  var STATS_URL = apiBase + "/stats";
  var POLL_MS = 30 * 1000;
  var RANGE_MS = {
    "30m": 30 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
  };
  var selectedRange = "24h";
  var MAX_POINTS = 5000;

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
  var hoverLineEl = document.getElementById("pc-hover-line");
  var graphHeading = document.getElementById("pc-graph-heading");
  var rangeButtons = Array.prototype.slice.call(document.querySelectorAll("[data-range]"));
  var tooltipEl = document.getElementById("pc-tooltip");
  var tooltipTimeEl = document.getElementById("pc-tooltip-time");
  var tooltipCountEl = document.getElementById("pc-tooltip-count");

  var history = [];
  var allTimeHigh = { value: 0, timestamp: 0 };
  var lastRangeHistory = [];
  var lastGeometry = null;

  function normalizeHistory(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (pt) {
        return pt && Number.isFinite(Number(pt.t)) && Number.isFinite(Number(pt.v));
      })
      .map(function (pt) {
        return { t: Number(pt.t), v: Number(pt.v) };
      })
      .slice(-MAX_POINTS);
  }

  function normalizePlayers(list) {
    if (!Array.isArray(list)) return [];
    return Array.from(
      new Set(
        list
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
          .filter(Boolean)
      )
    );
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }

  function fmtDateTime(ts) {
    return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function getRangeHistory() {
    var windowMs = RANGE_MS[selectedRange];
    var cutoff = Date.now() - windowMs;
    return history.filter(function (pt) {
      return pt.t >= cutoff;
    });
  }

  function setRange(rangeKey) {
    if (!RANGE_MS[rangeKey]) return;
    selectedRange = rangeKey;
    rangeButtons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-range") === rangeKey);
    });
    if (graphHeading) {
      var label = rangeKey === "30m" ? "30 Minutes" : rangeKey === "6h" ? "6 Hours" : rangeKey === "12h" ? "12 Hours" : "24 Hours";
      graphHeading.textContent = "Online Trend (Last " + label + ")";
    }
    drawGraph();
  }

  function addSample(value) {
    history.push({ t: Date.now(), v: value });
    if (history.length > MAX_POINTS) history = history.slice(-MAX_POINTS);
  }

  function setPlayers(list, missingCount) {
    playerListEl.innerHTML = "";
    var hasNames = Array.isArray(list) && list.length > 0;
    if (!hasNames && missingCount <= 0) {
      playerEmptyEl.hidden = false;
      return;
    }
    playerEmptyEl.hidden = true;
    if (hasNames) {
      list.forEach(function (name) {
        var li = document.createElement("li");
        li.textContent = String(name);
        playerListEl.appendChild(li);
      });
    }
    if (missingCount > 0) {
      var moreLi = document.createElement("li");
      moreLi.className = "status-player-list__more";
      moreLi.textContent = "+" + String(missingCount) + " more online";
      playerListEl.appendChild(moreLi);
    }
  }

  function updatePeakCards() {
    var fullDayMs = RANGE_MS["24h"];
    var daily = history.filter(function (pt) {
      return pt.t >= Date.now() - fullDayMs;
    });
    if (daily.length > 0) {
      var peak24h = daily.reduce(function (best, pt) {
        return !best || pt.v > best.v ? pt : best;
      }, null);
      peak24hEl.textContent = String(peak24h.v);
      peak24hTimeEl.textContent = "at " + fmtDateTime(peak24h.t);
    } else {
      peak24hEl.textContent = "0";
      peak24hTimeEl.textContent = "No data yet";
    }
    allTimeEl.textContent = String(allTimeHigh.value || 0);
    allTimeTimeEl.textContent = allTimeHigh.timestamp ? "at " + fmtDateTime(allTimeHigh.timestamp) : "No data yet";
  }

  function drawGraph() {
    var width = 900;
    var height = 260;
    var pad = { top: 18, right: 24, bottom: 30, left: 24 };
    var innerW = width - pad.left - pad.right;
    var innerH = height - pad.top - pad.bottom;
    var rangeHistory = getRangeHistory();
    var now = Date.now();
    var windowMs = RANGE_MS[selectedRange];
    var minT = now - windowMs;
    var maxY = rangeHistory.length
      ? Math.max(
          10,
          rangeHistory.reduce(function (m, pt) {
            return Math.max(m, pt.v);
          }, 0) + 2
        )
      : 10;
    lastRangeHistory = rangeHistory.slice();

    function xScale(t) {
      return pad.left + ((t - minT) / windowMs) * innerW;
    }
    function yScale(v) {
      return pad.top + (1 - v / Math.max(1, maxY)) * innerH;
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
      var tick = minT + (windowMs / 8) * j;
      var x = xScale(tick);
      var xLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      xLabel.setAttribute("x", String(x));
      xLabel.setAttribute("y", String(height - 8));
      xLabel.setAttribute("text-anchor", "middle");
      xLabel.setAttribute("class", "status-axis-label");
      xLabel.textContent = new Date(tick).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      xLabelsEl.appendChild(xLabel);
    }

    if (!rangeHistory.length) {
      lineEl.setAttribute("d", "");
      lastGeometry = null;
      updatePeakCards();
      return;
    }

    var d = "";
    rangeHistory.forEach(function (pt, idx) {
      var x = xScale(pt.t);
      var y = yScale(pt.v);
      d += (idx === 0 ? "M" : " L") + x.toFixed(2) + " " + y.toFixed(2);
      if (idx === rangeHistory.length - 1) {
        var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", x.toFixed(2));
        dot.setAttribute("cy", y.toFixed(2));
        dot.setAttribute("r", "4");
        dot.setAttribute("class", "status-point status-point--latest");
        pointsEl.appendChild(dot);
      }
    });
    lineEl.setAttribute("d", d);
    lastGeometry = {
      width: width,
      height: height,
      pad: pad,
      minT: minT,
      windowMs: windowMs,
      maxY: maxY,
      innerH: innerH,
      innerW: innerW,
    };
    updatePeakCards();
  }

  function showTooltip(clientX, clientY) {
    if (!lastGeometry || !lastRangeHistory.length) return;
    var rect = graph.getBoundingClientRect();
    var relX = clientX - rect.left;
    var clamped = Math.max(lastGeometry.pad.left, Math.min(rect.width - lastGeometry.pad.right, relX));
    var ratio = (clamped - lastGeometry.pad.left) / Math.max(1, rect.width - lastGeometry.pad.left - lastGeometry.pad.right);
    var targetT = lastGeometry.minT + ratio * lastGeometry.windowMs;

    var nearestIdx = 0;
    var nearestDiff = Number.POSITIVE_INFINITY;
    for (var i = 0; i < lastRangeHistory.length; i += 1) {
      var diff = Math.abs(lastRangeHistory[i].t - targetT);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestIdx = i;
      }
    }
    var point = lastRangeHistory[nearestIdx];
    var px = lastGeometry.pad.left + ((point.t - lastGeometry.minT) / lastGeometry.windowMs) * (rect.width - lastGeometry.pad.left - lastGeometry.pad.right);
    var py =
      lastGeometry.pad.top +
      (1 - point.v / Math.max(1, lastGeometry.maxY)) * (rect.height - lastGeometry.pad.top - lastGeometry.pad.bottom);

    hoverLineEl.hidden = false;
    hoverLineEl.setAttribute("x1", String((px / rect.width) * 900));
    hoverLineEl.setAttribute("x2", String((px / rect.width) * 900));

    tooltipTimeEl.textContent = fmtDateTime(point.t);
    tooltipCountEl.textContent = String(point.v);

    tooltipEl.hidden = false;
    var tipX = Math.min(rect.width - 190, Math.max(8, px + 10));
    var tipY = Math.max(8, py - 20);
    tooltipEl.style.transform = "translate(" + tipX.toFixed(0) + "px, " + tipY.toFixed(0) + "px)";
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.hidden = true;
    if (hoverLineEl) hoverLineEl.hidden = true;
  }

  function parseCurrentPayload(data) {
    return {
      online: data && data.online === true,
      onlineCount: Number((data && data.onlineCount) || 0),
      maxCount: Number((data && data.maxCount) || 0),
      players: normalizePlayers((data && data.players) || []),
      version: (data && data.version) || "Unknown",
      stale: data && data.stale === true,
    };
  }

  function updateStatus(data) {
    var parsed = parseCurrentPayload(data || {});
    var nowTs = Date.now();
    var missing = Math.max(0, parsed.onlineCount - parsed.players.length);
    if (parsed.online) {
      onlineEl.textContent = String(parsed.onlineCount);
      maxEl.textContent = String(parsed.maxCount);
      stateEl.textContent = parsed.stale ? "Online (connection issue)" : "Online";
      stateEl.classList.remove("is-offline");
      versionEl.textContent = "Version: " + parsed.version;
      setPlayers(parsed.players, missing);
      if (parsed.onlineCount > (allTimeHigh.value || 0)) {
        allTimeHigh = { value: parsed.onlineCount, timestamp: nowTs };
      }
      playerNoteEl.hidden = true;
      playerNoteEl.textContent = "";
      addSample(parsed.onlineCount);
    } else {
      onlineEl.textContent = "0";
      maxEl.textContent = "0";
      stateEl.textContent = "Offline / unreachable";
      stateEl.classList.add("is-offline");
      versionEl.textContent = "Version: unavailable";
      setPlayers([], 0);
      playerNoteEl.hidden = true;
      playerNoteEl.textContent = "";
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
    return fetch(HISTORY_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        var sharedList = data && Array.isArray(data.history) ? data.history : [];
        history = normalizeHistory(sharedList);
        if (data && !Array.isArray(data)) {
          var ath = Number(data.allTimeHigh);
          var athAt = Number(data.allTimeHighAt);
          if (Number.isFinite(ath)) allTimeHigh.value = ath;
          if (Number.isFinite(athAt)) allTimeHigh.timestamp = athAt;
        }
      })
      .catch(function () {
        history = [];
      });
  }

  function loadStats() {
    return fetch(STATS_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || typeof data !== "object") return;
        var value = Number(data.allTimeHigh);
        var at = Number(data.allTimeHighAt);
        if (Number.isFinite(value)) allTimeHigh.value = value;
        if (Number.isFinite(at)) allTimeHigh.timestamp = at;
      })
      .catch(function () {
        allTimeHigh = { value: 0, timestamp: 0 };
      });
  }

  rangeButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setRange(btn.getAttribute("data-range"));
    });
  });

  Promise.all([loadSharedHistory(), loadStats()]).finally(function () {
    setRange(selectedRange);
    drawGraph();
    fetchStatus();
    window.setInterval(fetchStatus, POLL_MS);
  });

  graph.addEventListener("mousemove", function (event) {
    showTooltip(event.clientX, event.clientY);
  });
  graph.addEventListener("mouseleave", hideTooltip);
  graph.addEventListener("touchstart", function (event) {
    if (event.touches && event.touches[0]) {
      showTooltip(event.touches[0].clientX, event.touches[0].clientY);
    }
  });
  graph.addEventListener("touchmove", function (event) {
    if (event.touches && event.touches[0]) {
      showTooltip(event.touches[0].clientX, event.touches[0].clientY);
    }
  });
  graph.addEventListener("touchend", hideTooltip);

  var copyIpBtn = document.getElementById("pc-copy-ip");
  var copyIpLabel = document.getElementById("pc-copy-ip-label");
  if (copyIpBtn && copyIpLabel && navigator.clipboard && navigator.clipboard.writeText) {
    copyIpBtn.addEventListener("click", function () {
      navigator.clipboard
        .writeText("endcity.net")
        .then(function () {
          copyIpLabel.textContent = "Copied!";
          window.setTimeout(function () {
            copyIpLabel.textContent = "Copy server IP";
          }, 1400);
        })
        .catch(function () {
          copyIpLabel.textContent = "Copy failed";
          window.setTimeout(function () {
            copyIpLabel.textContent = "Copy server IP";
          }, 1400);
        });
    });
  }
})();
