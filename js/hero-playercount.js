(function () {
  var onlineEl = document.getElementById("hero-playercount-online");
  var maxEl = document.getElementById("hero-playercount-max");
  var root = document.getElementById("hero-playercount");
  var dotEl = document.getElementById("hero-playercount-dot");
  if (!onlineEl || !maxEl || !root) return;

  var cfg = window.ENDCITY_CONFIG || window.SOLAR_CONFIG || {};
  var apiBase = String(cfg.playercountApiBase || "").trim().replace(/\/+$/, "");
  if (!apiBase) {
    root.hidden = true;
    return;
  }

  var API_URL = apiBase + "/current";
  var POLL_MS = 30 * 1000;

  function parseCurrentPayload(data) {
    return {
      online: data && data.online === true,
      onlineCount: Number((data && data.onlineCount) || 0),
      maxCount: Number((data && data.maxCount) || 0),
    };
  }

  function update(data) {
    var parsed = parseCurrentPayload(data || {});
    if (parsed.online) {
      onlineEl.textContent = String(parsed.onlineCount);
      maxEl.textContent = String(parsed.maxCount);
      root.classList.remove("is-offline");
      if (dotEl) dotEl.classList.remove("is-offline");
    } else {
      onlineEl.textContent = "0";
      maxEl.textContent = "0";
      root.classList.add("is-offline");
      if (dotEl) dotEl.classList.add("is-offline");
    }
  }

  function fetchStatus() {
    fetch(API_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(update)
      .catch(function () {
        update({ online: false });
      });
  }

  fetchStatus();
  window.setInterval(fetchStatus, POLL_MS);
})();
