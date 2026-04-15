(function () {
  var cfg = window.ENDCITY_CONFIG || window.SOLAR_CONFIG || {};
  var bill = Number(cfg.monthlyBill) || 0;
  var raisedRaw =
    cfg.raisedTowardNextBill != null
      ? Number(cfg.raisedTowardNextBill)
      : Number(cfg.raisedThisMonth) || 0;
  var raised = raisedRaw;
  var rolloverIn = Number(cfg.rolloverFromPriorMonth) || 0;
  var periodLabel =
    cfg.fundraisingForLabel ||
    cfg.monthLabel ||
    "Next bill";

  var totalTowardBill = rolloverIn + raised;
  var surplus = Math.max(0, totalTowardBill - bill);
  var pct = bill <= 0 ? 0 : Math.min(100, (totalTowardBill / bill) * 100);

  var elMonth = document.getElementById("goal-month");
  var elAmount = document.getElementById("goal-amount");
  var elFill = document.getElementById("progress-fill");
  var elBar = document.getElementById("goal-progressbar");
  var elProgLabel = document.getElementById("goal-progress-label");
  var elFundSummary = document.getElementById("fund-raised-summary");
  var elStatus = document.getElementById("goal-status");
  var elRollover = document.getElementById("goal-rollover");
  var elBillingNote = document.getElementById("billing-note");
  var elBillDueLine = document.getElementById("bill-due-line");
  var paypalLink = document.getElementById("paypal-link");
  var donorTrack = document.getElementById("donor-strip-track");
  var donorEmpty = document.getElementById("donor-strip-empty");

  var siteNotice = cfg.siteNotice && typeof cfg.siteNotice === "object" ? cfg.siteNotice : null;
  if (siteNotice && siteNotice.enabled) {
    var txt = String(siteNotice.text || "").trim();
    if (txt) {
      var headerEl = document.querySelector(".site-header");
      var noticeEl = document.createElement("div");
      noticeEl.className = "site-maintenance-banner";
      noticeEl.setAttribute("role", "status");
      noticeEl.setAttribute("aria-live", "polite");
      noticeEl.textContent = txt;
      if (headerEl && headerEl.parentNode) {
        headerEl.parentNode.insertBefore(noticeEl, headerEl.nextSibling);
      } else {
        document.body.insertBefore(noticeEl, document.body.firstChild);
      }
    }
  }

  function fmt(n) {
    return "$" + (Math.round(n * 100) / 100).toFixed(2);
  }

  function ordinalDay(n) {
    var d = Number(n) || 1;
    if (d > 3 && d < 21) return d + "th";
    switch (d % 10) {
      case 1:
        return d + "st";
      case 2:
        return d + "nd";
      case 3:
        return d + "rd";
      default:
        return d + "th";
    }
  }

  var dueDayNum = Number(cfg.billDueDay) || 1;
  if (elBillDueLine) {
    elBillDueLine.innerHTML =
      "Hosting is due on the <strong>" +
      ordinalDay(dueDayNum) +
      "</strong> of every month.";
  }

  if (elMonth) elMonth.textContent = "Toward " + periodLabel;
  if (elAmount) elAmount.textContent = fmt(bill);

  if (elFill) {
    elFill.style.width = pct + "%";
    if (pct >= 100) elFill.classList.add("is-complete");
  }

  if (elBar) {
    elBar.setAttribute("aria-valuenow", String(Math.round(pct)));
    elBar.setAttribute("aria-valuemax", "100");
  }

  if (elProgLabel) {
    var progressLine =
      fmt(totalTowardBill) + " / " + fmt(bill) + " for next bill";
    elProgLabel.textContent = progressLine;
    if (elFundSummary) elFundSummary.textContent = progressLine;
  }

  if (elBillingNote) {
    if (cfg.billingNote) {
      elBillingNote.textContent = String(cfg.billingNote);
      elBillingNote.hidden = false;
    } else {
      elBillingNote.hidden = true;
    }
  }

  if (elStatus) {
    var statusText = "";
    if (totalTowardBill >= bill) {
      statusText =
        "Goal met for " +
        periodLabel +
        (surplus > 0
          ? " — " + fmt(surplus) + " rolls toward the next bill."
          : ".");
    } else if (rolloverIn > 0) {
      statusText =
        fmt(rolloverIn) +
        " rollover plus " +
        fmt(raised) +
        " donated — " +
        fmt(bill - totalTowardBill) +
        " to go before the " +
        ordinalDay(dueDayNum) +
        ".";
    } else {
      statusText =
        fmt(totalTowardBill) +
        " of " +
        fmt(bill) +
        " toward " +
        periodLabel +
        " — " +
        fmt(bill - totalTowardBill) +
        " to go before the " +
        ordinalDay(dueDayNum) +
        ".";
    }
    elStatus.textContent = statusText;
  }

  if (elRollover) {
    if (surplus > 0) {
      elRollover.hidden = false;
      elRollover.textContent =
        "Surplus toward next month: " +
        fmt(surplus) +
        " — add this to rolloverFromPriorMonth when the new month starts.";
    } else {
      elRollover.hidden = true;
    }
  }

  var paypalUrl = (cfg.paypalUrl && String(cfg.paypalUrl).trim()) || "";
  var paypalPlaceholder =
    !paypalUrl ||
    /YOURUSERNAME|placeholder|example\.com/i.test(paypalUrl);

  if (paypalLink && paypalUrl && !paypalPlaceholder) {
    paypalLink.href = paypalUrl;
  }

  var elAltPay = document.getElementById("donate-alt-payments");
  if (elAltPay) {
    var disc = (cfg.discordUsername && String(cfg.discordUsername).trim()) || "tcp.syn.ack";
    var esc = disc.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    elAltPay.innerHTML =
      "<strong>Apple Pay</strong> or <strong>crypto</strong> — DM on Discord (<strong translate=\"no\">" +
      esc +
      "</strong>) and we’ll work it out.";
  }

  var donations = Array.isArray(cfg.donations) ? cfg.donations : [];
  if (donorTrack) {
    donorTrack.innerHTML = "";
    var sorted = donations
      .filter(function (d) {
        return d && d.username;
      })
      .slice()
      .sort(function (a, b) {
        return String(a.username).localeCompare(String(b.username), undefined, {
          sensitivity: "base",
        });
      });

    if (sorted.length === 0) {
      if (donorEmpty) donorEmpty.hidden = false;
    } else {
      if (donorEmpty) donorEmpty.hidden = true;
      sorted.forEach(function (d) {
        var user = String(d.username);
        var item = document.createElement("div");
        item.className = "donor-strip__item";
        var img = document.createElement("img");
        img.className = "donor-strip__head";
        img.width = 56;
        img.height = 56;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.src =
          "https://mc-heads.net/avatar/" +
          encodeURIComponent(user) +
          "/56";
        img.onerror = function () {
          img.src = "https://mc-heads.net/avatar/MHF_Steve/56";
        };
        var name = document.createElement("span");
        name.className = "donor-strip__name";
        name.textContent = user;
        var amt = document.createElement("span");
        amt.className = "donor-strip__amt";
        amt.textContent =
          d.amount != null && d.amount !== "" ? fmt(Number(d.amount)) : "—";
        item.appendChild(img);
        item.appendChild(name);
        item.appendChild(amt);
        donorTrack.appendChild(item);
      });
    }
  }

  var toggle = document.querySelector(".nav-toggle");
  var panel = document.getElementById("nav-panel");
  if (toggle && panel) {
    toggle.addEventListener("click", function () {
      var open = panel.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      panel.hidden = !open;
    });
    panel.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        panel.classList.remove("is-open");
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      });
    });

    function closeNavIfDesktop() {
      if (window.matchMedia("(min-width: 768px)").matches) {
        panel.classList.remove("is-open");
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      }
    }
    window.addEventListener("resize", closeNavIfDesktop);
  }

  var discordUrl = (cfg.discordInviteUrl && String(cfg.discordInviteUrl).trim()) || "";
  if (discordUrl) {
    document.querySelectorAll("[data-discord-invite]").forEach(function (el) {
      if (el.tagName === "A") el.href = discordUrl;
    });
  }
})();
