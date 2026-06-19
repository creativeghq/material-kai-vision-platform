/* MaterialsHub Documentation — shared navigation + layout injection */
(function () {
  // Public base URL for screenshots stored in the Supabase `documentation` bucket
  window.IMG_BASE =
    "https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/documentation/";

  // Ordered table of contents (drives the sidebar AND the prev/next pager)
  var GROUPS = [
    {
      title: "Overview",
      items: [
        { file: "index.html", title: "Introduction", icon: "📘" },
        { file: "getting-started.html", title: "Getting Started", icon: "🚀" },
      ],
    },
    {
      title: "Core",
      items: [
        { file: "dashboard.html", title: "Dashboard", icon: "🏠" },
        { file: "agent-hub.html", title: "Agent Hub (JARVIS)", icon: "🤖" },
        { file: "knowledge-base.html", title: "Knowledge Base", icon: "📚" },
        { file: "recognition.html", title: "Material Recognition", icon: "🔍" },
        { file: "compare.html", title: "Material Compare", icon: "⚖️" },
      ],
    },
    {
      title: "Workspace",
      items: [
        { file: "moodboards.html", title: "MoodBoards", icon: "🎨" },
        { file: "projects.html", title: "Projects", icon: "📁" },
        { file: "quotes.html", title: "Quotes & Requests", icon: "🧾" },
        { file: "crm.html", title: "CRM", icon: "👥" },
        { file: "finance.html", title: "Finance & Invoicing", icon: "💶" },
        { file: "pos.html", title: "Point of Sale", icon: "🧮" },
        { file: "inbox.html", title: "Inbox", icon: "✉️" },
      ],
    },
    {
      title: "Network & Tools",
      items: [
        { file: "discover.html", title: "Discover & Network", icon: "🌐" },
        { file: "factory-analytics.html", title: "Factory Analytics", icon: "📊" },
        { file: "tools.html", title: "Free Tools", icon: "🛠️" },
      ],
    },
    {
      title: "Account",
      items: [
        { file: "account.html", title: "Account & Billing", icon: "⚙️" },
        { file: "sales.html", title: "Sales Portal", icon: "💼" },
      ],
    },
    {
      title: "Reference",
      items: [
        { file: "public-pages.html", title: "Public & Shared Pages", icon: "🔗" },
      ],
    },
  ];

  function currentFile() {
    var p = location.pathname.split("/").pop();
    return p && p.length ? p : "index.html";
  }

  function flat() {
    var out = [];
    GROUPS.forEach(function (g) { g.items.forEach(function (it) { out.push(it); }); });
    return out;
  }

  function buildSidebar(cur) {
    var html =
      '<div class="brand">' +
      '<div class="logo">M</div>' +
      '<div class="name">MaterialsHub<small>User Documentation</small></div>' +
      "</div>";
    GROUPS.forEach(function (g) {
      html += '<div class="nav-group"><h4>' + g.title + "</h4><div class=\"nav\">";
      g.items.forEach(function (it) {
        var active = it.file === cur ? " active" : "";
        html +=
          '<a class="' + active.trim() + '" href="' + it.file + '">' +
          '<span style="margin-right:8px">' + it.icon + "</span>" +
          it.title +
          "</a>";
      });
      html += "</div></div>";
    });
    return html;
  }

  function buildPager(cur) {
    var list = flat();
    var i = list.findIndex(function (x) { return x.file === cur; });
    if (i < 0) return "";
    var prev = i > 0 ? list[i - 1] : null;
    var next = i < list.length - 1 ? list[i + 1] : null;
    var h = '<div class="pager">';
    h += prev
      ? '<a href="' + prev.file + '"><span class="lbl">← Previous</span><span class="ttl">' + prev.title + "</span></a>"
      : "<span></span>";
    h += next
      ? '<a class="next" href="' + next.file + '"><span class="lbl">Next →</span><span class="ttl">' + next.title + "</span></a>"
      : "<span></span>";
    h += "</div>";
    return h;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var cur = currentFile();

    // Sidebar
    var aside = document.createElement("aside");
    aside.className = "sidebar";
    aside.id = "sidebar";
    aside.innerHTML = buildSidebar(cur);

    // Wrap existing <main class="content"> into the flex layout
    var content = document.querySelector(".content");
    var layout = document.createElement("div");
    layout.className = "layout";
    content.parentNode.insertBefore(layout, content);
    layout.appendChild(aside);
    layout.appendChild(content);

    // Mobile menu button
    var btn = document.createElement("button");
    btn.className = "menu-btn";
    btn.setAttribute("aria-label", "Toggle navigation");
    btn.innerHTML = "☰";
    btn.onclick = function () { aside.classList.toggle("open"); };
    document.body.appendChild(btn);
    aside.addEventListener("click", function (e) {
      if (e.target.tagName === "A") aside.classList.remove("open");
    });

    // Pager + footer
    var pager = document.createElement("div");
    pager.innerHTML = buildPager(cur);
    content.appendChild(pager.firstChild ? pager.firstChild : document.createComment(""));

    var foot = document.createElement("div");
    foot.className = "docfoot";
    foot.innerHTML =
      "MaterialsHub — User Documentation · Screenshots captured from the live application at app.materialshub.gr.";
    content.appendChild(foot);

    // Resolve {{IMG}} placeholders in <img data-src> already handled inline; nothing else needed.
  });
})();
