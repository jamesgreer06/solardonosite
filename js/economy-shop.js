(function () {
  var tbody = document.getElementById("shop-changes-tbody");
  var metaEl = document.getElementById("shop-changes-meta");
  var emptyEl = document.getElementById("shop-changes-empty");
  var wrap = document.getElementById("shop-changes-wrap");
  if (!tbody || !metaEl) return;

  metaEl.textContent = "Loading snapshot…";

  var cfg = window.ENDCITY_CONFIG || window.SOLAR_CONFIG || {};
  var url = String(cfg.shopPriceChangesUrl || "data/shop-price-changes.json").trim();
  if (!url) {
    metaEl.textContent = "";
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Price snapshots are not configured for this site build.";
    }
    if (wrap) wrap.hidden = true;
    return;
  }

  function formatItemName(row) {
    var dn = row && row.displayName;
    if (dn && String(dn).trim()) return String(dn).trim();
    var id = row && row.item;
    if (!id) return "—";
    return String(id)
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function fmtPrice(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    var v = Number(n);
    var abs = Math.abs(v);
    var d = abs >= 100 ? 1 : 2;
    return v.toFixed(d);
  }

  function fmtPct(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    var v = Number(n);
    var decimals = Math.abs(v - Math.round(v)) < 0.01 ? 0 : 2;
    return (v > 0 ? "+" : "") + v.toFixed(decimals) + "%";
  }

  function fmtVolume(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return Number(n).toLocaleString();
  }

  function pressureLabel(row) {
    var t = row && row.pressureType;
    var s = row && row.pressureScore;
    if (t === "demand" || t === "supply") {
      var label = t === "demand" ? "Demand" : "Supply";
      if (Number.isFinite(Number(s))) {
        return String(s) + " · " + label;
      }
      return label;
    }
    if (row && row.pressureLabel) return String(row.pressureLabel);
    return "—";
  }

  function pressureClass(row) {
    var t = row && row.pressureType;
    if (t === "demand") return "shop-pressure shop-pressure--demand";
    if (t === "supply") return "shop-pressure shop-pressure--supply";
    return "shop-pressure";
  }

  function deltaClass(n) {
    if (n == null || !Number.isFinite(Number(n))) return "shop-delta";
    return Number(n) >= 0 ? "shop-delta shop-delta--up" : "shop-delta shop-delta--down";
  }

  function tdPriceBlock(was, neu, pct) {
    var td = document.createElement("td");
    td.className = "shop-change-cell";
    var prices = document.createElement("div");
    prices.className = "shop-change-cell__prices";
    prices.textContent = fmtPrice(was) + " → " + fmtPrice(neu);
    var pctRow = document.createElement("div");
    pctRow.className = "shop-change-cell__pct";
    var sp = document.createElement("span");
    sp.className = deltaClass(pct);
    sp.textContent = fmtPct(pct);
    pctRow.appendChild(sp);
    td.appendChild(prices);
    td.appendChild(pctRow);
    return td;
  }

  function renderRows(rows) {
    tbody.innerHTML = "";
    rows.forEach(function (row) {
      var tr = document.createElement("tr");

      var tdItem = document.createElement("td");
      var strong = document.createElement("strong");
      strong.textContent = formatItemName(row);
      tdItem.appendChild(strong);
      tdItem.appendChild(document.createElement("br"));
      var code = document.createElement("code");
      code.className = "shop-path";
      code.setAttribute("translate", "no");
      code.textContent = row.shopPath || "—";
      tdItem.appendChild(code);

      var tdPress = document.createElement("td");
      var spanP = document.createElement("span");
      spanP.className = pressureClass(row);
      spanP.textContent = pressureLabel(row);
      tdPress.appendChild(spanP);

      var tdVol = document.createElement("td");
      tdVol.className = "shop-vol";
      tdVol.textContent = fmtVolume(row.volume);

      var tdBuy = tdPriceBlock(row.buyWas, row.buyNew, row.buyDeltaPct);
      var tdSell = tdPriceBlock(row.sellWas, row.sellNew, row.sellDeltaPct);

      tr.appendChild(tdItem);
      tr.appendChild(tdPress);
      tr.appendChild(tdVol);
      tr.appendChild(tdBuy);
      tr.appendChild(tdSell);
      tbody.appendChild(tr);
    });
  }

  function setMeta(iso, note) {
    var parts = [];
    if (iso) {
      try {
        var d = new Date(iso);
        if (!isNaN(d.getTime())) {
          parts.push("Snapshot: " + d.toLocaleString());
        }
      } catch (e) {
        parts.push("Snapshot: " + iso);
      }
    }
    if (note && String(note).trim()) parts.push(String(note).trim());
    metaEl.textContent = parts.join(" · ");
  }

  fetch(url, { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      var rows = data && Array.isArray(data.rows) ? data.rows : [];
      setMeta(data && data.generatedAt, data && data.periodNote);
      if (rows.length === 0) {
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.textContent = "This snapshot has no rows yet—check back after the next export.";
        }
        if (wrap) wrap.hidden = true;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      if (wrap) wrap.hidden = false;
      renderRows(rows);
    })
    .catch(function () {
      metaEl.textContent = "";
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent =
          "We couldn’t load the price snapshot (offline or updating). Try again in a moment.";
      }
      if (wrap) wrap.hidden = true;
    });
})();
