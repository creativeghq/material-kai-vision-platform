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
    ]},
    { title: "Workspace", items: [
      { file: "moodboards.html", title: "MoodBoards", icon: "🎨", children: [
        { file: "moodboards-board.html", title: "Building a board" },
        { file: "moodboards-sheets.html", title: "Presentation sheets" },
      ]},
      { file: "projects.html", title: "Projects", icon: "📁", children: [
        { file: "projects-plan.html", title: "Plan & Estimating" },
        { file: "projects-blueprints.html", title: "Blueprint Library" },
        { file: "projects-rooms.html", title: "Rooms" },
        { file: "projects-client-view.html", title: "Client View" },
        { file: "projects-tabs.html", title: "Other tabs" },
      ]},
      { file: "quotes.html", title: "Quotes & Requests", icon: "🧾", children: [
        { file: "quotes-build.html", title: "Build & send a quote" },
        { file: "quotes-requests.html", title: "Requests" },
      ]},
      { file: "crm.html", title: "CRM", icon: "👥", children: [
        { file: "crm-users.html", title: "Users" },
        { file: "crm-contacts.html", title: "Contacts" },
        { file: "crm-companies.html", title: "Companies" },
        { file: "crm-categories.html", title: "Categories" },
      ]},
      { file: "finance.html", title: "Finance & Invoicing", icon: "💶", children: [
        { file: "finance-receivables-payables.html", title: "Receivables & Payables", children: [
          { file: "finance-rp-receivables.html", title: "Receivables" },
          { file: "finance-rp-payables.html", title: "Payables" },
          { file: "finance-rp-payments.html", title: "Payments" },
          { file: "finance-rp-cheques.html", title: "Cheques" },
          { file: "finance-rp-followups.html", title: "Follow-ups" },
        ]},
        { file: "finance-documents.html", title: "Documents", children: [
          { file: "finance-doc-orders.html", title: "Orders" },
          { file: "finance-doc-invoices.html", title: "Invoices" },
          { file: "finance-doc-receipts.html", title: "Receipts" },
          { file: "finance-doc-credit-notes.html", title: "Credit notes" },
          { file: "finance-doc-expenses.html", title: "Expenses" },
          { file: "finance-doc-delivery-notes.html", title: "Delivery notes" },
        ]},
        { file: "finance-einvoicing.html", title: "Greek e-invoicing" },
        { file: "finance-operations.html", title: "Operations & Reports", children: [
          { file: "finance-op-dispatch.html", title: "Dispatch board" },
          { file: "finance-op-warehouse.html", title: "Warehouse" },
          { file: "finance-op-customers-suppliers.html", title: "Customers & Suppliers" },
          { file: "finance-op-planning.html", title: "Planning" },
          { file: "finance-op-time-billing.html", title: "Time & billing" },
          { file: "finance-op-reports.html", title: "Reports" },
          { file: "finance-op-marketplace.html", title: "Marketplace" },
          { file: "finance-op-expense-cards.html", title: "Expense cards" },
        ]},
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
      { file: "client-portal.html", title: "Client Portal", icon: "🪪" },
      { file: "inbox.html", title: "Inbox", icon: "✉️" },
    ]},
    { title: "Network & Tools", items: [
      { file: "discover.html", title: "Discover & Network", icon: "🌐", children: [
        { file: "discover-profiles.html", title: "Profiles" },
        { file: "discover-factory.html", title: "Factory" },
        { file: "discover-products.html", title: "Products" },
        { file: "discover-marketplace.html", title: "Marketplace" },
        { file: "discover-network.html", title: "Network" },
      ]},
      { file: "factory-analytics.html", title: "Factory Analytics", icon: "📊" },
      { file: "tools.html", title: "Tools", icon: "🛠️", children: [
        { file: "recognition.html", title: "Material Recognition" },
        { file: "compare.html", title: "Material Compare" },
      ]},
    ]},
    { title: "Business Apps", items: [
      { file: "apps.html", title: "Apps & Modules", icon: "🧩" },
      { file: "hr.html", title: "HR", icon: "👥", children: [
        { file: "hr-employees.html", title: "Employees & org" },
        { file: "hr-attendance.html", title: "Attendance & clock-in" },
        { file: "hr-timeoff.html", title: "Time-off & absences" },
        { file: "hr-payroll.html", title: "Payroll & payslips" },
        { file: "hr-recruitment.html", title: "Recruitment & careers" },
        { file: "hr-documents.html", title: "Documents (AI OCR)" },
        { file: "hr-ergani.html", title: "Ergani filing (BYOK)" },
        { file: "hr-self-service.html", title: "Employee self-service" },
      ]},
      { file: "stock.html", title: "Stock Management", icon: "📦" },
      { file: "email-marketing.html", title: "Email Marketing (BYOK)", icon: "📣" },
      { file: "flows.html", title: "Flows", icon: "🔀" },
      { file: "team-docs.html", title: "Team Docs", icon: "📓" },
    ]},
    { title: "Account", items: [
      { file: "account.html", title: "Account & Billing", icon: "⚙️", children: [
        { file: "account-profile.html", title: "Profile" },
        { file: "account-subscription.html", title: "Subscription & API keys" },
        { file: "account-credits.html", title: "Credits" },
        { file: "account-billing.html", title: "Billing" },
        { file: "account-keys.html", title: "Keys & Connections" },
        { file: "account-modules.html", title: "Modules" },
        { file: "account-social.html", title: "Social Accounts" },
        { file: "account-appointments-reviews.html", title: "Appointments & Reviews" },
      ]},
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
