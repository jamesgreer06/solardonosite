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

  /** ISO date string for when this row’s prices last changed (preferred over shopPath in the UI). */
  function formatChangedLine(row) {
    var raw = row && (row.priceChangedAt || row.changedAt);
    if (raw) {
      var d = new Date(String(raw));
      if (!isNaN(d.getTime())) {
        var label = d.toLocaleString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        return { iso: String(raw), text: "Changed " + label };
      }
    }
    if (row && row.shopPath) {
      return { iso: null, text: String(row.shopPath), isPath: true };
    }
    return { iso: null, text: "—" };
  }

  function fmtPrice(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    var v = Number(n);
    var abs = Math.abs(v);
    var d = abs >= 100 ? 1 : 2;
    return v.toFixed(d);
  }

  /** In-game currency display */
  function fmtMoney(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return "$" + fmtPrice(n);
  }

  function fmtPct(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    var v = Number(n);
    var decimals = Math.abs(v - Math.round(v)) < 0.01 ? 0 : 2;
    return (v > 0 ? "+" : "") + v.toFixed(decimals) + "%";
  }

  function fmtVolumeMain(n) {
    if (n == null || !Number.isFinite(Number(n))) return null;
    return Number(n).toLocaleString();
  }

  function pressureLabel(row) {
    var t = row && row.pressureType;
    var s = row && row.pressureScore;
    if (t === "demand" || t === "supply" || t === "mixed") {
      var label = t === "demand" ? "Demand" : t === "supply" ? "Supply" : "Mixed";
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
    if (t === "mixed") return "shop-pressure shop-pressure--mixed";
    return "shop-pressure";
  }

  function deltaClass(n) {
    if (n == null || !Number.isFinite(Number(n))) return "shop-delta";
    var v = Number(n);
    if (v > 0) return "shop-delta shop-delta--up";
    if (v < 0) return "shop-delta shop-delta--down";
    return "shop-delta shop-delta--flat";
  }

  function tdPriceBlock(was, neu, pct) {
    var td = document.createElement("td");
    td.className = "shop-change-cell";

    var prices = document.createElement("div");
    prices.className = "shop-change-cell__prices";
    var wOk = was != null && Number.isFinite(Number(was));
    var nOk = neu != null && Number.isFinite(Number(neu));
    if (!wOk && !nOk) {
      prices.textContent = "—";
    } else {
      prices.textContent = fmtMoney(was) + " → " + fmtMoney(neu);
    }
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
      var ch = formatChangedLine(row);
      if (ch.iso) {
        var timeEl = document.createElement("time");
        timeEl.className = "shop-item-changed";
        timeEl.setAttribute("datetime", ch.iso);
        timeEl.textContent = ch.text;
        tdItem.appendChild(timeEl);
      } else {
        var sub = document.createElement(ch.isPath ? "code" : "span");
        sub.className = ch.isPath ? "shop-path shop-path--fallback" : "shop-item-changed";
        if (ch.isPath) sub.setAttribute("translate", "no");
        sub.textContent = ch.text;
        tdItem.appendChild(sub);
      }

      var tdPress = document.createElement("td");
      var spanP = document.createElement("span");
      spanP.className = pressureClass(row);
      spanP.textContent = pressureLabel(row);
      tdPress.appendChild(spanP);

      var tdVol = document.createElement("td");
      tdVol.className = "shop-vol";
      var volMain = fmtVolumeMain(row.volume);
      if (volMain == null) {
        tdVol.textContent = "—";
      } else {
        tdVol.appendChild(document.createTextNode(volMain));
        var volUnit = document.createElement("span");
        volUnit.className = "shop-vol__unit";
        volUnit.textContent = "items";
        tdVol.appendChild(volUnit);
      }

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
