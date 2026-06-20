/* MaterialsHub Documentation — shared header, sidebar, on-page TOC + layout injection */
(function () {
  // Public base URL for screenshots stored in the Supabase `documentation` bucket
  window.IMG_BASE =
    "https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/documentation/";

  var APP_URL = "https://app.materialshub.gr/";

  // Ordered table of contents. Items may have `children` (sub-pages).
  var GROUPS = [
    { title: "Overview", items: [
      { file: "index.html", title: "Introduction", icon: "📘" },
      { file: "getting-started.html", title: "Getting Started", icon: "🚀" },
    ]},
    { title: "Core", items: [
      { file: "dashboard.html", title: "Dashboard", icon: "🏠" },
      { file: "agent-hub.html", title: "Agent Hub", icon: "🤖", children: [
        { file: "agent-agents.html", title: "AI Agents" },
        { file: "agent-tools.html", title: "Tools & Capabilities" },
      ]},
      { file: "knowledge-base.html", title: "Knowledge Base", icon: "📚" },
      { file: "recognition.html", title: "Material Recognition", icon: "🔍" },
      { file: "compare.html", title: "Material Compare", icon: "⚖️" },
    ]},
    { title: "Workspace", items: [
      { file: "moodboards.html", title: "MoodBoards", icon: "🎨" },
      { file: "projects.html", title: "Projects", icon: "📁" },
      { file: "quotes.html", title: "Quotes & Requests", icon: "🧾" },
      { file: "crm.html", title: "CRM", icon: "👥" },
      { file: "finance.html", title: "Finance & Invoicing", icon: "💶", children: [
        { file: "finance-receivables-payables.html", title: "Receivables & Payables" },
        { file: "finance-documents.html", title: "Documents" },
        { file: "finance-einvoicing.html", title: "Greek e-invoicing" },
        { file: "finance-operations.html", title: "Operations & Reports" },
        { file: "finance-settings.html", title: "Settings", children: [
          { file: "finance-settings-general.html", title: "General" },
          { file: "finance-settings-business-identity.html", title: "Business Identity" },
          { file: "finance-settings-documents.html", title: "Documents" },
          { file: "finance-settings-einvoicing.html", title: "e-Invoicing" },
          { file: "finance-settings-pricing.html", title: "Pricing" },
          { file: "finance-settings-categories.html", title: "Categories" },
          { file: "finance-settings-services.html", title: "Services" },
          { file: "finance-settings-team.html", title: "Team" },
          { file: "finance-settings-online-store.html", title: "Online Store" },
          { file: "finance-settings-statement-pdf.html", title: "Statement PDF" },
          { file: "finance-settings-finance-digest.html", title: "Finance Digest" },
          { file: "finance-settings-payments.html", title: "Payments" },
        ]},
      ]},
      { file: "pos.html", title: "Point of Sale", icon: "🧮" },
      { file: "inbox.html", title: "Inbox", icon: "✉️" },
    ]},
    { title: "Network & Tools", items: [
      { file: "discover.html", title: "Discover & Network", icon: "🌐" },
      { file: "factory-analytics.html", title: "Factory Analytics", icon: "📊" },
      { file: "tools.html", title: "Free Tools", icon: "🛠️" },
    ]},
    { title: "Account", items: [
      { file: "account.html", title: "Account & Billing", icon: "⚙️" },
      { file: "sales.html", title: "Sales Portal", icon: "💼" },
    ]},
    { title: "Reference", items: [
      { file: "public-pages.html", title: "Public & Shared Pages", icon: "🔗" },
    ]},
  ];

  function currentFile() {
    var p = location.pathname.split("/").pop();
    return p && p.length ? p : "index.html";
  }
  function flat() {
    var out = [];
    GROUPS.forEach(function (g) {
      g.items.forEach(function (it) {
        out.push(it);
        if (it.children) it.children.forEach(function (c) {
          out.push(c);
          if (c.children) c.children.forEach(function (gc) { out.push(gc); });
        });
      });
    });
    return out;
  }
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  function buildHeader() {
    var el = document.createElement("header");
    el.className = "docheader";
    el.innerHTML =
      '<button class="menu-btn" id="menuBtn" aria-label="Menu">☰</button>' +
      '<a class="hbrand" href="index.html">' +
        '<img class="logo-img" src="assets/mh-logo.png" alt="MaterialsHub">' +
        '<span class="divider"></span>' +
        '<span class="t-sub">Documentation</span>' +
      "</a>" +
      '<span class="spacer"></span>' +
      '<a class="hlink" href="' + APP_URL + '" target="_blank" rel="noopener">Open app ↗</a>';
    return el;
  }

  function buildSidebar(cur) {
    var aside = document.createElement("aside");
    aside.className = "sidebar";
    aside.id = "sidebar";
    var html = "";
    GROUPS.forEach(function (g) {
      html += '<div class="nav-group"><h4>' + g.title + '</h4><nav class="nav">';
      g.items.forEach(function (it) {
        var childActive = it.children && it.children.some(function (c) { return c.file === cur; });
        var cls = (it.file === cur ? "active" : "") + (childActive ? " parent-active" : "");
        html +=
          '<a class="' + cls.trim() + '" href="' + it.file + '">' +
          '<span class="ic">' + it.icon + "</span>" + it.title + "</a>";
        if (it.children) {
          html += '<div class="subnav">';
          it.children.forEach(function (c) {
            var gcActive = c.children && c.children.some(function (gc) { return gc.file === cur; });
            html += '<a class="' + ((c.file === cur ? "active" : "") + (gcActive ? " parent-active" : "")).trim() + '" href="' + c.file + '">' + c.title + "</a>";
            // Render grandchildren only when in that sub-area, to keep the sidebar tidy
            if (c.children && (c.file === cur || gcActive)) {
              html += '<div class="subnav subnav-deep">';
              c.children.forEach(function (gc) {
                html += '<a class="' + (gc.file === cur ? "active" : "") + '" href="' + gc.file + '">' + gc.title + "</a>";
              });
              html += "</div>";
            }
          });
          html += "</div>";
        }
      });
      html += "</nav></div>";
    });
    aside.innerHTML = html;
    return aside;
  }

  function buildTOC(content) {
    var toc = document.createElement("aside");
    toc.className = "toc";
    var hs = content.querySelectorAll("h2");
    if (hs.length < 2) return toc;
    var html = "<h5>On this page</h5>";
    hs.forEach(function (h, i) {
      if (!h.id) {
        h.id = (h.textContent || "section-" + i).toLowerCase()
          .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "section-" + i;
      }
      html += '<a href="#' + h.id + '" data-tref="' + h.id + '">' + esc(h.textContent) + "</a>";
    });
    toc.innerHTML = html;
    return toc;
  }

  function buildPager(cur) {
    var list = flat();
    var i = list.findIndex(function (x) { return x.file === cur; });
    if (i < 0) return null;
    var prev = i > 0 ? list[i - 1] : null;
    var next = i < list.length - 1 ? list[i + 1] : null;
    var wrap = document.createElement("div");
    wrap.className = "pager";
    var h = "";
    if (prev) h += '<a href="' + prev.file + '"><span class="lbl">← Previous</span><span class="ttl">' + prev.title + "</span></a>";
    if (next) h += '<a class="next" href="' + next.file + '"><span class="lbl">Next →</span><span class="ttl">' + next.title + "</span></a>";
    wrap.innerHTML = h;
    return wrap;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var cur = currentFile();
    var content = document.querySelector(".content");
    if (!content) return;

    document.body.insertBefore(buildHeader(), document.body.firstChild);

    var layout = document.createElement("div");
    layout.className = "layout";
    content.parentNode.insertBefore(layout, content);

    var sidebar = buildSidebar(cur);
    var toc = buildTOC(content);

    var pager = buildPager(cur);
    if (pager) content.appendChild(pager);
    var foot = document.createElement("div");
    foot.className = "docfoot";
    foot.textContent = "MaterialsHub — User Documentation · Screenshots captured from the live application at app.materialshub.gr.";
    content.appendChild(foot);

    layout.appendChild(sidebar);
    layout.appendChild(content);
    layout.appendChild(toc);

    // Mobile drawer
    var scrim = document.createElement("div");
    scrim.className = "scrim";
    document.body.appendChild(scrim);
    var menuBtn = document.getElementById("menuBtn");
    function closeNav() { sidebar.classList.remove("open"); scrim.classList.remove("show"); }
    if (menuBtn) menuBtn.onclick = function () {
      sidebar.classList.toggle("open"); scrim.classList.toggle("show");
    };
    scrim.onclick = closeNav;
    sidebar.addEventListener("click", function (e) { if (e.target.closest("a")) closeNav(); });

    // Keep the active sidebar item in view
    var act = sidebar.querySelector("a.active");
    if (act && act.scrollIntoView) act.scrollIntoView({ block: "center" });

    // TOC scroll-spy
    var tlinks = toc.querySelectorAll("a[data-tref]");
    if (tlinks.length) {
      var map = {};
      tlinks.forEach(function (a) { map[a.getAttribute("data-tref")] = a; });
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            tlinks.forEach(function (a) { a.classList.remove("active"); });
            var a = map[en.target.id];
            if (a) a.classList.add("active");
          }
        });
      }, { rootMargin: "-80px 0px -70% 0px", threshold: 0 });
      content.querySelectorAll("h2[id]").forEach(function (h) { obs.observe(h); });
    }
  });
})();
