(function () {
  var tbody = document.getElementById("shop-changes-tbody");
  var metaEl = document.getElementById("shop-changes-meta");
  var emptyEl = document.getElementById("shop-changes-empty");
  var panelEl = document.getElementById("shop-changes-panel");
  var sortSelect = document.getElementById("shop-changes-sort");
  if (!tbody || !metaEl) return;

  var allRows = [];

  metaEl.textContent = "Loading snapshot…";

  var cfg = window.ENDCITY_CONFIG || window.SOLAR_CONFIG || {};
  var url = String(cfg.shopPriceChangesUrl || "").trim();
  if (!url) {
    var apiBase = String(cfg.playercountApiBase || "").trim().replace(/\/+$/, "");
    if (apiBase) {
      url = apiBase + "/economy";
    } else {
      url = "data/shop-price-changes.json";
    }
  }

  function formatItemName(row) {
    var dn = row && row.displayName;
    if (dn != null && String(dn).trim() !== "") return String(dn).trim();
    var id = row && row.item;
    if (!id) return "—";
    return String(id)
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  /** Second line under item: snapshot time only. */
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

  function pctDelta(before, after) {
    if (before == null || after == null) return null;
    var b = Number(before);
    var a = Number(after);
    if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
    if (b === 0) return a === 0 ? 0 : null;
    return ((a - b) / b) * 100;
  }

  function pressureTypeFromScore(p) {
    if (!Number.isFinite(Number(p))) return "mixed";
    var v = Number(p);
    if (v > 0.52) return "supply";
    if (v < 0.48) return "demand";
    return "mixed";
  }

  /**
   * Worker/plugin payload uses `changes[]` + numeric `generatedAt`.
   * Legacy static JSON uses `rows[]` + ISO `generatedAt`.
   */
  function normalizeEconomyPayload(data) {
    if (!data || typeof data !== "object") {
      return { rows: [], generatedAt: null, periodNote: "" };
    }

    var gen = data.generatedAt;
    if (typeof gen === "number" && Number.isFinite(gen)) {
      gen = new Date(gen).toISOString();
    } else if (gen != null) {
      var d0 = new Date(String(gen));
      gen = !isNaN(d0.getTime()) ? d0.toISOString() : null;
    } else {
      gen = null;
    }

    var periodParts = [];
    if (Number.isFinite(Number(data.changeCount))) {
      periodParts.push(String(data.changeCount) + " changes");
    }
    if (Number.isFinite(Number(data.aggregatedItemCount))) {
      periodParts.push(String(data.aggregatedItemCount) + " items in window");
    }
    var periodNote = periodParts.length ? periodParts.join(" · ") : "";

    if (Array.isArray(data.changes)) {
      var rows = data.changes.map(function (ch) {
        var buyW;
        var buyN;
        var buyD;
        var sellW;
        var sellN;
        var sellD;
        if (ch.updateBuy !== false) {
          buyW = ch.buyBefore != null ? Number(ch.buyBefore) : null;
          buyN = ch.buyAfter != null ? Number(ch.buyAfter) : null;
          buyD = buyW != null && buyN != null ? pctDelta(buyW, buyN) : null;
        } else {
          buyW = buyN = buyD = null;
        }
        if (ch.updateSell !== false) {
          sellW = ch.sellBefore != null ? Number(ch.sellBefore) : null;
          sellN = ch.sellAfter != null ? Number(ch.sellAfter) : null;
          sellD = sellW != null && sellN != null ? pctDelta(sellW, sellN) : null;
        } else {
          sellW = sellN = sellD = null;
        }

        var name =
          ch.itemName != null && String(ch.itemName).trim() !== ""
            ? String(ch.itemName).trim()
            : "—";

        return {
          item: name,
          displayName: name,
          priceChangedAt: gen,
          pressureType: pressureTypeFromScore(ch.pressure),
          pressureScore: Number.isFinite(Number(ch.pressure)) ? Number(ch.pressure) : null,
          volume: Number.isFinite(Number(ch.volume)) ? Number(ch.volume) : null,
          buyWas: buyW,
          buyNew: buyN,
          buyDeltaPct: buyD,
          sellWas: sellW,
          sellNew: sellN,
          sellDeltaPct: sellD,
        };
      });
      return { rows: rows, generatedAt: gen, periodNote: periodNote };
    }

    if (Array.isArray(data.rows)) {
      return {
        rows: data.rows,
        generatedAt: gen || data.generatedAt,
        periodNote: data.periodNote != null ? String(data.periodNote) : periodNote,
      };
    }

    return { rows: [], generatedAt: gen, periodNote: periodNote };
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

  function volNum(r) {
    if (!r || r.volume == null || !Number.isFinite(Number(r.volume))) return null;
    return Number(r.volume);
  }

  function scoreNum(r) {
    if (!r || r.pressureScore == null || !Number.isFinite(Number(r.pressureScore))) return null;
    return Number(r.pressureScore);
  }

  function tiebreakName(a, b) {
    return formatItemName(a).localeCompare(formatItemName(b));
  }

  function cmpVolumeDesc(a, b) {
    var va = volNum(a);
    var vb = volNum(b);
    if (va == null && vb == null) return tiebreakName(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (vb !== va) return vb - va;
    return tiebreakName(a, b);
  }

  function buyNewNum(r) {
    if (!r || r.buyNew == null || !Number.isFinite(Number(r.buyNew))) return null;
    return Number(r.buyNew);
  }

  function sellNewNum(r) {
    if (!r || r.sellNew == null || !Number.isFinite(Number(r.sellNew))) return null;
    return Number(r.sellNew);
  }

  /** Current buy-from-shop price (after change), high → low */
  function cmpBuyHigh(a, b) {
    var va = buyNewNum(a);
    var vb = buyNewNum(b);
    if (va == null && vb == null) return tiebreakName(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (vb !== va) return vb - va;
    return tiebreakName(a, b);
  }

  /** Current sell-to-shop payout (after change), high → low */
  function cmpSellHigh(a, b) {
    var va = sellNewNum(a);
    var vb = sellNewNum(b);
    if (va == null && vb == null) return tiebreakName(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (vb !== va) return vb - va;
    return tiebreakName(a, b);
  }

  /** Lower score = more demand-heavy */
  function cmpDemandStrong(a, b) {
    var sa = scoreNum(a);
    var sb = scoreNum(b);
    if (sa == null && sb == null) return cmpVolumeDesc(a, b);
    if (sa == null) return 1;
    if (sb == null) return -1;
    if (sa !== sb) return sa - sb;
    return cmpVolumeDesc(a, b);
  }

  /** Higher score = more supply-heavy */
  function cmpSupplyStrong(a, b) {
    var sa = scoreNum(a);
    var sb = scoreNum(b);
    if (sa == null && sb == null) return cmpVolumeDesc(a, b);
    if (sa == null) return 1;
    if (sb == null) return -1;
    if (sb !== sa) return sb - sa;
    return cmpVolumeDesc(a, b);
  }

  function distFromBalanced(r) {
    var s = scoreNum(r);
    if (s == null) return 999;
    return Math.abs(s - 0.5);
  }

  function cmpBalanced(a, b) {
    var da = distFromBalanced(a);
    var db = distFromBalanced(b);
    if (da !== db) return da - db;
    return cmpVolumeDesc(a, b);
  }

  function sortRows(rows, mode) {
    var out = rows.slice();
    var cmp = cmpVolumeDesc;
    if (mode === "buy-desc") cmp = cmpBuyHigh;
    else if (mode === "sell-desc") cmp = cmpSellHigh;
    else if (mode === "demand-strong") cmp = cmpDemandStrong;
    else if (mode === "supply-strong") cmp = cmpSupplyStrong;
    else if (mode === "balanced") cmp = cmpBalanced;
    out.sort(cmp);
    return out;
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
        var sub = document.createElement("span");
        sub.className = "shop-item-changed";
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
      var norm = normalizeEconomyPayload(data);
      var rows = norm.rows;
      setMeta(norm.generatedAt, norm.periodNote);
      if (rows.length === 0) {
        allRows = [];
        if (panelEl) panelEl.hidden = true;
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.textContent = "This snapshot has no rows yet—check back after the next export.";
        }
        return;
      }
      allRows = rows;
      if (emptyEl) emptyEl.hidden = true;
      if (panelEl) panelEl.hidden = false;
      var mode = sortSelect && sortSelect.value ? sortSelect.value : "volume-desc";
      renderRows(sortRows(allRows, mode));
    })
    .catch(function () {
      allRows = [];
      if (panelEl) panelEl.hidden = true;
      metaEl.textContent = "";
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent =
          "We couldn’t load the price snapshot (offline or updating). Try again in a moment.";
      }
    });

  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      if (!allRows.length) return;
      renderRows(sortRows(allRows, sortSelect.value));
    });
  }
})();
