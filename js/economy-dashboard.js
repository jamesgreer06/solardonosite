(function () {
  var tbody = document.getElementById("shop-changes-tbody");
  var metaEl = document.getElementById("shop-changes-meta");
  var emptyEl = document.getElementById("shop-changes-empty");
  var panelEl = document.getElementById("shop-changes-panel");
  var sortSelect = document.getElementById("shop-changes-sort");
  var kpiWrap = document.getElementById("econ-dash-kpis");
  var bestSellEl = document.getElementById("dash-best-sell");
  var supplyEl = document.getElementById("dash-supply");
  if (!tbody || !metaEl) return;

  var allRows = [];

  function parseChangedAtToIso(raw) {
    if (raw == null) return null;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      var ms = raw < 1e12 ? raw * 1000 : raw;
      var d = new Date(ms);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    var s = String(raw).trim();
    if (!s) return null;
    var d2 = new Date(s);
    return isNaN(d2.getTime()) ? null : d2.toISOString();
  }

  function formatChangedLine(row) {
    var iso =
      (row && row.changedAtIso) ||
      parseChangedAtToIso(row && row.changedAt) ||
      parseChangedAtToIso(row && row.priceChangedAt);
    if (iso) {
      var d = new Date(iso);
      if (!isNaN(d.getTime())) {
        return {
          iso: iso,
          text:
            "Changed " +
            d.toLocaleString([], {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
        };
      }
    }
    return { iso: null, text: "—" };
  }

  function humanizeItemName(raw) {
    if (raw == null) return "—";
    var text = String(raw).trim();
    if (!text) return "—";
    var looksLikeId = text.indexOf("_") >= 0 || /^[A-Z0-9]+$/.test(text);
    if (!looksLikeId) return text;
    return text
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function formatItemName(row) {
    var dn = row && row.displayName;
    if (dn != null && String(dn).trim() !== "") return humanizeItemName(dn);
    var id = row && row.item;
    return humanizeItemName(id);
  }

  function fmtPrice(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    var v = Number(n);
    var abs = Math.abs(v);
    var d = abs >= 100 ? 1 : 2;
    return v.toFixed(d);
  }

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

  function fmtVolumeMoney(n) {
    if (n == null || !Number.isFinite(Number(n))) return null;
    return (
      "$" +
      Number(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
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

  function normalizeEconomyPayload(data) {
    if (!data || typeof data !== "object") {
      return { rows: [], generatedAt: null };
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

    if (Array.isArray(data.changes)) {
      var rows = data.changes.map(function (ch) {
        var buyW = ch.buyBefore != null ? Number(ch.buyBefore) : null;
        var buyN = ch.buyAfter != null ? Number(ch.buyAfter) : null;
        var buyD =
          buyW != null && buyN != null && Number.isFinite(buyW) && Number.isFinite(buyN)
            ? pctDelta(buyW, buyN)
            : null;
        var sellW = ch.sellBefore != null ? Number(ch.sellBefore) : null;
        var sellN = ch.sellAfter != null ? Number(ch.sellAfter) : null;
        var sellD =
          sellW != null && sellN != null && Number.isFinite(sellW) && Number.isFinite(sellN)
            ? pctDelta(sellW, sellN)
            : null;
        var name =
          ch.itemName != null && String(ch.itemName).trim() !== ""
            ? String(ch.itemName).trim()
            : "—";
        return {
          item: name,
          displayName: name,
          changedAtIso: parseChangedAtToIso(ch.changedAt),
          pressureType: pressureTypeFromScore(ch.pressure),
          pressureScore: Number.isFinite(Number(ch.pressure)) ? Number(ch.pressure) : null,
          volume: Number.isFinite(Number(ch.volume)) ? Number(ch.volume) : null,
          volumeMoney: Number.isFinite(Number(ch.volumeMoney)) ? Number(ch.volumeMoney) : null,
          buyWas: buyW,
          buyNew: buyN,
          buyDeltaPct: buyD,
          sellWas: sellW,
          sellNew: sellN,
          sellDeltaPct: sellD,
        };
      });
      return { rows: rows, generatedAt: gen };
    }

    if (Array.isArray(data.rows)) {
      var mappedRows = data.rows.map(function (r) {
        var iso =
          (r && r.changedAtIso) ||
          parseChangedAtToIso(r && r.changedAt) ||
          parseChangedAtToIso(r && r.priceChangedAt);
        var vm =
          r && r.volumeMoney != null && Number.isFinite(Number(r.volumeMoney))
            ? Number(r.volumeMoney)
            : null;
        return Object.assign({}, r, {
          changedAtIso: iso || undefined,
          volumeMoney: vm,
        });
      });
      return { rows: mappedRows, generatedAt: gen || data.generatedAt };
    }
    return { rows: [], generatedAt: gen };
  }

  function pressureLabel(row) {
    var t = row && row.pressureType;
    var s = row && row.pressureScore;
    if (t === "demand" || t === "supply" || t === "mixed") {
      var label = t === "demand" ? "Demand" : t === "supply" ? "Supply" : "Mixed";
      if (Number.isFinite(Number(s))) return String(s) + " · " + label;
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

  function buyNewNum(r) {
    if (!r || r.buyNew == null || !Number.isFinite(Number(r.buyNew))) return null;
    return Number(r.buyNew);
  }

  function sellNewNum(r) {
    if (!r || r.sellNew == null || !Number.isFinite(Number(r.sellNew))) return null;
    return Number(r.sellNew);
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

  function cmpBuyHigh(a, b) {
    var va = buyNewNum(a);
    var vb = buyNewNum(b);
    if (va == null && vb == null) return tiebreakName(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (vb !== va) return vb - va;
    return tiebreakName(a, b);
  }

  function cmpSellHigh(a, b) {
    var va = sellNewNum(a);
    var vb = sellNewNum(b);
    if (va == null && vb == null) return tiebreakName(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (vb !== va) return vb - va;
    return tiebreakName(a, b);
  }

  function cmpDemandStrong(a, b) {
    var sa = scoreNum(a);
    var sb = scoreNum(b);
    if (sa == null && sb == null) return cmpVolumeDesc(a, b);
    if (sa == null) return 1;
    if (sb == null) return -1;
    if (sa !== sb) return sa - sb;
    return cmpVolumeDesc(a, b);
  }

  function cmpSupplyStrong(a, b) {
    var sa = scoreNum(a);
    var sb = scoreNum(b);
    if (sa == null && sb == null) return cmpVolumeDesc(a, b);
    if (sa == null) return 1;
    if (sb == null) return -1;
    if (sb !== sa) return sb - sa;
    return cmpVolumeDesc(a, b);
  }

  function cmpBalanced(a, b) {
    var sa = scoreNum(a);
    var sb = scoreNum(b);
    var da = sa == null ? 999 : Math.abs(sa - 0.5);
    var db = sb == null ? 999 : Math.abs(sb - 0.5);
    if (da !== db) return da - db;
    return cmpVolumeDesc(a, b);
  }

  function changedTimestampMs(r) {
    if (!r) return null;
    var iso =
      r.changedAtIso ||
      parseChangedAtToIso(r.changedAt) ||
      parseChangedAtToIso(r.priceChangedAt);
    if (!iso) return null;
    var t = new Date(iso).getTime();
    return isNaN(t) ? null : t;
  }

  function cmpChangedRecent(a, b) {
    var ta = changedTimestampMs(a);
    var tb = changedTimestampMs(b);
    if (ta == null && tb == null) return tiebreakName(a, b);
    if (ta == null) return 1;
    if (tb == null) return -1;
    if (tb !== ta) return tb - ta;
    return tiebreakName(a, b);
  }

  function sortRows(rows, mode) {
    var out = rows.slice();
    var cmp = cmpVolumeDesc;
    if (mode === "buy-desc") cmp = cmpBuyHigh;
    else if (mode === "sell-desc") cmp = cmpSellHigh;
    else if (mode === "changed-desc") cmp = cmpChangedRecent;
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
    if (!wOk && !nOk) prices.textContent = "—";
    else prices.textContent = fmtMoney(was) + " → " + fmtMoney(neu);
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
      var volMoney = fmtVolumeMoney(row.volumeMoney);
      if (volMain == null && volMoney == null) {
        tdVol.textContent = "—";
      } else {
        if (volMain != null) {
          tdVol.appendChild(document.createTextNode(volMain));
          var volUnit = document.createElement("span");
          volUnit.className = "shop-vol__unit";
          volUnit.textContent = "items";
          tdVol.appendChild(volUnit);
        }
        if (volMoney != null) {
          tdVol.appendChild(document.createElement("br"));
          var volMoneyEl = document.createElement("span");
          volMoneyEl.className = "shop-vol__money";
          volMoneyEl.textContent = volMoney;
          tdVol.appendChild(volMoneyEl);
        }
      }
      tr.appendChild(tdItem);
      tr.appendChild(tdPress);
      tr.appendChild(tdVol);
      tr.appendChild(tdPriceBlock(row.buyWas, row.buyNew, row.buyDeltaPct));
      tr.appendChild(tdPriceBlock(row.sellWas, row.sellNew, row.sellDeltaPct));
      tbody.appendChild(tr);
    });
  }

  function sumFinite(rows, getter) {
    return rows.reduce(function (acc, row) {
      var v = getter(row);
      return Number.isFinite(v) ? acc + v : acc;
    }, 0);
  }

  function renderKpis(rows) {
    if (!kpiWrap) return;
    var cards = [
      { label: "Volume (14d)", value: fmtVolumeMain(sumFinite(rows, volNum)) || "—" },
      { label: "Volume value (14d)", value: fmtVolumeMoney(sumFinite(rows, function (r) { return Number(r && r.volumeMoney); })) || "—" },
    ];
    kpiWrap.innerHTML = "";
    cards.forEach(function (card) {
      var article = document.createElement("article");
      article.className = "econ-dash-kpi";
      var h = document.createElement("h3");
      h.textContent = card.label;
      var p = document.createElement("p");
      p.textContent = card.value;
      article.appendChild(h);
      article.appendChild(p);
      kpiWrap.appendChild(article);
    });
  }

  function scoreSellOpportunity(row) {
    var sell = sellNewNum(row);
    var pressure = scoreNum(row);
    var vol = volNum(row);
    if (sell == null || pressure == null || vol == null) return null;
    return sell * (1.15 - pressure) * Math.log10(vol + 10);
  }

  function renderOpportunityList(target, rows, formatter) {
    if (!target) return;
    target.innerHTML = "";
    rows.slice(0, 8).forEach(function (row, idx) {
      var li = document.createElement("li");
      li.innerHTML = formatter(row, idx);
      target.appendChild(li);
    });
    if (!target.children.length) {
      var empty = document.createElement("li");
      empty.textContent = "No qualifying rows right now.";
      target.appendChild(empty);
    }
  }

  function pressureBadge(row) {
    var t = row && row.pressureType;
    var label = t === "demand" ? "Demand" : t === "supply" ? "Supply" : "Mixed";
    var cls = pressureClass(row);
    return '<span class="' + cls + '">' + label + "</span>";
  }

  function metricChip(label, value) {
    return (
      '<span class="econ-dash-chip"><span class="econ-dash-chip__label">' +
      label +
      '</span><span class="econ-dash-chip__value">' +
      value +
      "</span></span>"
    );
  }

  function renderOpportunityRow(rank, row, chipsHtml) {
    return (
      '<span class="econ-dash-row">' +
      '<span class="econ-dash-rank">#' +
      rank +
      "</span>" +
      '<span class="econ-dash-row__main">' +
      '<span class="econ-dash-row__item">' +
      formatItemName(row) +
      "</span>" +
      '<span class="econ-dash-row__meta">' +
      pressureBadge(row) +
      chipsHtml +
      "</span>" +
      "</span>" +
      "</span>"
    );
  }

  function renderOpportunities(rows) {
    var bestSell = rows
      .map(function (r) {
        return { row: r, score: scoreSellOpportunity(r) };
      })
      .filter(function (x) {
        return Number.isFinite(x.score);
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .map(function (x) {
        return x.row;
      });

    var supply = rows
      .filter(function (r) {
        return scoreNum(r) != null;
      })
      .slice()
      .sort(cmpSupplyStrong);

    renderOpportunityList(bestSellEl, bestSell, function (r, i) {
      var chips =
        metricChip("Sell", fmtMoney(r.sellNew)) +
        metricChip("Volume", fmtVolumeMain(r.volume) || "—");
      return renderOpportunityRow(i + 1, r, chips);
    });
    renderOpportunityList(supplyEl, supply, function (r, i) {
      var chips =
        metricChip("Sell", fmtMoney(r.sellNew)) +
        metricChip("Pressure", scoreNum(r) != null ? String(scoreNum(r)) : "—");
      return renderOpportunityRow(i + 1, r, chips);
    });
  }

  function setMeta(iso) {
    if (!iso) {
      metaEl.textContent = "";
      return;
    }
    var d = new Date(iso);
    if (!isNaN(d.getTime())) {
      metaEl.textContent = "Last updated " + d.toLocaleString();
      return;
    }
    metaEl.textContent = "Last updated " + iso;
  }

  var cfg = window.ENDCITY_CONFIG || window.SOLAR_CONFIG || {};
  var url = String(cfg.shopPriceChangesUrl || "").trim();
  if (!url) {
    var apiBase = String(cfg.playercountApiBase || "").trim().replace(/\/+$/, "");
    if (apiBase) url = apiBase + "/economy";
    else url = "data/shop-price-changes.json";
  }

  fetch(url, { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      var norm = normalizeEconomyPayload(data);
      allRows = norm.rows || [];
      setMeta(norm.generatedAt);
      if (!allRows.length) {
        if (panelEl) panelEl.hidden = true;
        if (emptyEl) emptyEl.hidden = false;
        if (kpiWrap) kpiWrap.innerHTML = "";
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      if (panelEl) panelEl.hidden = false;
      renderKpis(allRows);
      renderOpportunities(allRows);
      var mode = sortSelect && sortSelect.value ? sortSelect.value : "volume-desc";
      renderRows(sortRows(allRows, mode));
    })
    .catch(function () {
      if (panelEl) panelEl.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "We could not load the economy snapshot right now.";
      }
      metaEl.textContent = "";
    });

  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      if (!allRows.length) return;
      renderRows(sortRows(allRows, sortSelect.value));
    });
  }
})();
