(() => {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
    batch:
      '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7 5.8l9 5v9"/>',
    replicate:
      '<path d="M12 3c4 5 1 7 3 9l3-4c5 7 2 13-6 13-8 0-11-7-6-13l2 4c0-4 4-5 4-9z"/>',
    templates:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    works:
      '<path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18"/>',
    assets:
      '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 6-7 4 4 4-5 4 6"/>',
    accounts:
      '<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3H6M5 5a3 3 0 0 0 0 6M19 5a3 3 0 0 1 0 6M3 20H1v-3a5 5 0 0 1 3-4M21 20h2v-3a5 5 0 0 0-3-4"/>',
    settings:
      '<circle cx="12" cy="12" r="4"/><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/>',
  };
  const items = [
    ["home", "首页", "/studio"],
    ["batch", "批量制作", "/studio?new=1"],
    ["replicate", "爆款复刻", "/replicate"],
    ["templates", "模板中心", "/templates"],
    ["works", "项目", "/projects"],
    ["assets", "我的素材", "/assets"],
    ["accounts", "豆包账号池", "/accounts"],
  ];
  const icon = (id) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]}</svg>`;
  function mount() {
    if (
      location.pathname !== "/accounts" &&
      !document.getElementById("accountsDrawer")
    )
      window.doubaoAccounts?.hide();
    document.body.classList.add("app-shell");
    let sidebar = document.querySelector(".sidebar,.wb-nav");
    if (!sidebar) {
      sidebar = document.createElement("aside");
      document.body.prepend(sidebar);
    }
    sidebar.className = "sidebar app-sidebar";
    const params = new URLSearchParams(location.search),
      page = location.pathname;
    const active =
      page === "/studio"
        ? params.has("new") ||
          params.has("type") ||
          params.has("project") ||
          params.has("scene") ||
          params.has("template")
          ? "batch"
          : "home"
        : page === "/replicate" || page === "/clone"
          ? "replicate"
          : ["/projects", "/works"].includes(page)
            ? "works"
            : page.slice(1);
    sidebar.innerHTML =
      '<a class="brand" href="/studio"><img src="/design-assets/frame-logo.svg" alt=""><span>帧间</span></a><nav aria-label="主导航">' +
      items
        .map(
          ([id, label, url]) =>
            `<a href="${url}" data-app-nav="${id}" aria-label="${label}" class="${active === id ? "active" : ""}" ${active === id ? 'aria-current="page"' : ""}>${icon(id)}<span>${label}</span></a>`,
        )
        .join("") +
      `</nav><a data-app-nav="settings" class="settings-link ${active === "settings" ? "active" : ""}" href="/settings" aria-label="设置">${icon("settings")}<span>设置</span></a>`;
    if (document.getElementById("accountsDrawer")) markActive("accounts");
    else if (location.hash === "#accounts")
      queueMicrotask(() => openAccounts());
  }
  function markActive(id) {
    document.querySelectorAll(".app-sidebar [data-app-nav]").forEach((link) => {
      const selected = link.dataset.appNav === id;
      link.classList.toggle("active", selected);
      if (selected) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
  function openAccounts(accountId = "") {
    const existing = document.getElementById("accountsDrawer");
    if (existing) {
      if (accountId)
        existing
          .querySelector("iframe")
          .contentWindow.postMessage(
            { type: "select-account", id: accountId },
            location.origin,
          );
      return;
    }
    const prior = document.body.style.overflow,
      priorActive = document.querySelector(".app-sidebar a.active")?.dataset
        .appNav,
      previousUrl = location.href;
    document.body.style.overflow = "hidden";
    markActive("accounts");
    const backdrop = document.createElement("div");
    backdrop.id = "accountsDrawer";
    backdrop.className = "accounts-drawer-backdrop";
    backdrop.innerHTML =
      '<section class="accounts-drawer" role="dialog" aria-modal="true" aria-label="豆包账号池"><header><strong>豆包账号池</strong><button id="closeAccountsDrawer" aria-label="关闭账号池">× 关闭</button></header><iframe title="豆包账号与会话" src="/accounts?embedded=1' +
      (accountId ? "&accountId=" + encodeURIComponent(accountId) : "") +
      '"></iframe></section>';
    document.body.append(backdrop);
    if (location.hash !== "#accounts")
      history.pushState(
        { accountsOverlay: true, previousUrl },
        "",
        "#accounts",
      );
    const closeUI = () => {
      window.doubaoAccounts?.hide();
      backdrop.remove();
      document.body.style.overflow = prior;
      markActive(priorActive);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("popstate", back);
    };
    const close = () => {
      closeUI();
      if (history.state?.accountsOverlay) history.back();
    };
    const back = () => {
      if (location.hash !== "#accounts") closeUI();
    };
    const escape = (e) => {
      if (e.key === "Escape") close();
    };
    backdrop.querySelector("#closeAccountsDrawer").onclick = close;
    backdrop.onclick = (e) => {
      if (e.target === backdrop) close();
    };
    document.addEventListener("keydown", escape);
    window.addEventListener("popstate", back);
    backdrop
      .querySelector("#closeAccountsDrawer")
      .focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href="/accounts"]');
    if (!link || location.pathname === "/accounts") return;
    e.preventDefault();
    openAccounts();
  });
  window.StudioShell = { mount, openAccounts };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
