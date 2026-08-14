/**
 * Homepage extras: copy-to-join buttons and the manual Dispatch blog.
 * Edit posts in data/blog-posts.json (newest first).
 */
(function () {
  var BLOG_URL = "data/blog-posts.json";

  function discordHref() {
    var cfg = window.ENDCITY_CONFIG || window.SOLAR_CONFIG || {};
    return (cfg.discordInviteUrl && String(cfg.discordInviteUrl).trim()) ||
      "https://discord.gg/Z5sZx9cjsC";
  }

  function announce(btn, ok) {
    var original = btn.getAttribute("data-original-label") || btn.textContent;
    if (!btn.getAttribute("data-original-label")) {
      btn.setAttribute("data-original-label", original);
    }
    btn.textContent = ok ? "Copied — now join" : "Copy failed";
    btn.classList.toggle("is-copied", ok);
    window.setTimeout(function () {
      btn.textContent = btn.getAttribute("data-original-label");
      btn.classList.remove("is-copied");
    }, 1600);
  }

  function copyText(text, btn) {
    var value = String(text || "").trim();
    if (!value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(
        function () {
          announce(btn, true);
        },
        function () {
          fallbackCopy(value, btn);
        }
      );
      return;
    }
    fallbackCopy(value, btn);
  }

  function fallbackCopy(value, btn) {
    var area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(area);
    announce(btn, ok);
  }

  document.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-copy]");
    if (!btn) return;
    copyText(btn.getAttribute("data-copy"), btn);
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) return String(iso || "");
    var months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    var month = months[Number(parts[1]) - 1];
    var day = String(Number(parts[2]));
    var year = parts[0];
    if (!month) return String(iso);
    return month + " " + day + ", " + year;
  }

  function sideLabel(side) {
    if (side === "java") return "Java note";
    if (side === "bedrock") return "Bedrock note";
    return "Both editions";
  }

  function paragraphs(body) {
    return String(body || "")
      .split(/\n{2,}/)
      .map(function (chunk) {
        return chunk.trim();
      })
      .filter(Boolean)
      .map(function (chunk) {
        return "<p>" + escapeHtml(chunk).replace(/\n/g, "<br />") + "</p>";
      })
      .join("");
  }

  function renderPosts(posts) {
    var root = document.getElementById("dispatch-list");
    if (!root) return;
    if (!posts.length) {
      var emptyInvite = discordHref();
      root.innerHTML =
        '<p class="muted">No notes on the board yet. The conversation is already happening on <a class="domain-link" data-discord-invite href="' +
        escapeHtml(emptyInvite) +
        '" target="_blank" rel="noopener noreferrer">Discord</a> — come be in it.</p>';
      return;
    }

    var invite = discordHref();

    var hash = (window.location.hash || "").replace(/^#/, "");
    root.innerHTML = posts
      .map(function (post, index) {
        var id = String(post.id || "post-" + (index + 1)).replace(/[^a-z0-9-]/gi, "");
        var targeted = hash.indexOf("dispatch-") === 0;
        var open = targeted ? hash === "dispatch-" + id : index === 0;
        var side = String(post.side || "both").toLowerCase();
        return (
          '<article class="dispatch-card' +
          (open ? " is-open" : "") +
          '" id="dispatch-' +
          escapeHtml(id) +
          '">' +
          '<button type="button" class="dispatch-card__toggle" aria-expanded="' +
          (open ? "true" : "false") +
          '" data-dispatch-toggle>' +
          '<span class="dispatch-card__meta">' +
          '<span class="dispatch-card__date">' +
          escapeHtml(formatDate(post.date)) +
          "</span>" +
          '<span class="dispatch-card__side dispatch-card__side--' +
          escapeHtml(side) +
          '">' +
          escapeHtml(sideLabel(side)) +
          "</span>" +
          "</span>" +
          '<span class="dispatch-card__title">' +
          escapeHtml(post.title || "City note") +
          "</span>" +
          '<span class="dispatch-card__chevron" aria-hidden="true"></span>' +
          "</button>" +
          '<div class="dispatch-card__body"' +
          (open ? "" : " hidden") +
          ">" +
          paragraphs(post.body) +
          '<p class="dispatch-card__cta"><a class="domain-link" href="' +
          escapeHtml(invite) +
          '" data-discord-invite target="_blank" rel="noopener noreferrer">Come talk on Discord</a></p>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  var list = document.getElementById("dispatch-list");
  if (list) {
    list.addEventListener("click", function (event) {
      var toggle = event.target.closest("[data-dispatch-toggle]");
      if (!toggle) return;
      var card = toggle.closest(".dispatch-card");
      var body = card && card.querySelector(".dispatch-card__body");
      if (!card || !body) return;
      var open = !card.classList.contains("is-open");
      if (open) {
        var others = list.querySelectorAll(".dispatch-card.is-open");
        for (var i = 0; i < others.length; i++) {
          var other = others[i];
          if (other === card) continue;
          other.classList.remove("is-open");
          var otherBody = other.querySelector(".dispatch-card__body");
          var otherToggle = other.querySelector("[data-dispatch-toggle]");
          if (otherBody) otherBody.hidden = true;
          if (otherToggle) otherToggle.setAttribute("aria-expanded", "false");
        }
      }
      card.classList.toggle("is-open", open);
      body.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && card.id) {
        history.replaceState(null, "", "#" + card.id);
      }
    });

    fetch(BLOG_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var posts = Array.isArray(data) ? data : data && data.posts;
        renderPosts(Array.isArray(posts) ? posts : []);
      })
      .catch(function () {
        var invite = discordHref();
        list.innerHTML =
          '<p class="muted">City notes could not load. The conversation is still happening on <a class="domain-link" data-discord-invite href="' +
          escapeHtml(invite) +
          '" target="_blank" rel="noopener noreferrer">Discord</a>.</p>';
      });
  }
})();
