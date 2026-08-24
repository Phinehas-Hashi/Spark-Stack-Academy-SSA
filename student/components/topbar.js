// ============================================================
// SPARK STACK ACADEMY — STUDENT TOPBAR
// Premium shell loader + responsive sidebar controller.
// ============================================================

const CACHE_KEY = "ssa_student_topbar_html_v2";
const STYLE_ID = "ssa-student-shell-polish";

function installShellStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        /* ===============================
           SSA STUDENT SHELL POLISH
        =============================== */
        .student-main{min-width:0;overflow-x:hidden}
        .topbar{
            position:sticky!important;
            top:0!important;
            min-height:76px!important;
            padding:12px 30px!important;
            display:flex!important;
            align-items:center!important;
            gap:18px!important;
            background:rgba(255,255,255,.92)!important;
            border-bottom:1px solid rgba(148,163,184,.18)!important;
            box-shadow:0 8px 30px rgba(8,28,58,.06)!important;
            backdrop-filter:blur(18px)!important;
            -webkit-backdrop-filter:blur(18px)!important;
            z-index:900!important;
        }
        .top-actions{display:flex!important;align-items:center!important;gap:9px!important;margin-left:auto!important}
        .top-search{width:min(380px,40vw)!important;min-width:0!important}
        .top-search input{min-width:0!important}
        .menu-btn,.theme-btn,.icon-btn,.student-avatar{flex-shrink:0!important}
        .notification-wrapper{position:relative!important}
        .notification-panel{
            position:absolute!important;
            top:calc(100% + 12px)!important;
            right:0!important;
            z-index:2000!important;
        }
        .profile-menu{flex-shrink:0!important;max-width:230px!important}
        .profile-info{min-width:0!important}
        .profile-info strong{max-width:165px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}

        .sidebar.ssa-student-sidebar{
            position:fixed!important;
            top:0!important;
            left:0!important;
            bottom:0!important;
            width:280px!important;
            height:100dvh!important;
            min-height:100vh!important;
            padding:18px 14px 14px!important;
            display:flex!important;
            flex-direction:column!important;
            gap:0!important;
            overflow-x:hidden!important;
            overflow-y:auto!important;
            background:linear-gradient(180deg,#071a38 0%,#0a2450 52%,#071a38 100%)!important;
            border-right:1px solid rgba(255,255,255,.08)!important;
            box-shadow:14px 0 40px rgba(8,28,58,.18)!important;
            z-index:1200!important;
        }
        .ssa-student-sidebar .sidebar-profile{
            flex-shrink:0!important;
            margin:2px 4px 18px!important;
            padding:15px!important;
            background:linear-gradient(135deg,rgba(41,121,255,.18),rgba(255,193,7,.07))!important;
            border:1px solid rgba(255,255,255,.09)!important;
            border-radius:18px!important;
        }
        .ssa-student-sidebar .sidebar-menu{display:flex!important;flex-direction:column!important;gap:4px!important;flex:1 1 auto!important;min-height:0!important}
        .ssa-student-sidebar .sidebar-link{
            min-height:44px!important;
            padding:11px 12px!important;
            border:1px solid transparent!important;
            border-radius:13px!important;
            color:#b9c8e4!important;
            font-weight:600!important;
            transition:all .18s ease!important;
        }
        .ssa-student-sidebar .sidebar-link:hover{
            transform:translateX(2px)!important;
            color:#fff!important;
            background:rgba(255,255,255,.065)!important;
            border-color:rgba(255,255,255,.07)!important;
        }
        .ssa-student-sidebar .sidebar-link.active{
            color:#fff!important;
            background:linear-gradient(90deg,rgba(41,121,255,.96),rgba(41,121,255,.68))!important;
            border-color:rgba(125,174,255,.22)!important;
            box-shadow:0 8px 22px rgba(41,121,255,.22)!important;
        }
        .ssa-student-sidebar .sidebar-link.active::before{left:-1px!important;width:3px!important;height:62%!important;background:#ffc107!important;box-shadow:0 0 12px rgba(255,193,7,.55)!important}
        .ssa-student-sidebar .sidebar-footer{flex-shrink:0!important;margin:12px 4px 0!important;padding-top:12px!important;border-top:1px solid rgba(255,255,255,.08)!important}
        .ssa-student-sidebar .logout-btn{width:100%!important}
        #sidebarOverlay{
            position:fixed!important;
            inset:0!important;
            display:block!important;
            opacity:0!important;
            visibility:hidden!important;
            pointer-events:none!important;
            background:rgba(2,10,25,.62)!important;
            backdrop-filter:blur(4px)!important;
            -webkit-backdrop-filter:blur(4px)!important;
            z-index:1100!important;
            transition:opacity .22s ease,visibility .22s ease!important;
        }
        #sidebarOverlay.show{opacity:1!important;visibility:visible!important;pointer-events:auto!important}

        @media(max-width:900px){
            .topbar{min-height:68px!important;padding:10px 15px!important;gap:10px!important}
            .menu-btn{display:flex!important;width:42px!important;height:42px!important;align-items:center!important;justify-content:center!important}
            .top-search{flex:1 1 auto!important;width:auto!important}
            .profile-info{display:none!important}
            .profile-menu{max-width:none!important}
            .sidebar.ssa-student-sidebar{
                width:min(292px,88vw)!important;
                max-width:88vw!important;
                transform:translate3d(-105%,0,0)!important;
                visibility:hidden!important;
                pointer-events:none!important;
                transition:transform .24s cubic-bezier(.22,.8,.25,1),visibility 0s linear .24s!important;
                box-shadow:18px 0 50px rgba(0,0,0,.38)!important;
            }
            .sidebar.ssa-student-sidebar.open{
                transform:translate3d(0,0,0)!important;
                visibility:visible!important;
                pointer-events:auto!important;
                transition:transform .24s cubic-bezier(.22,.8,.25,1),visibility 0s!important;
            }
            .sidebar-container{width:0!important;min-width:0!important;max-width:0!important;flex:0 0 0!important}
        }
        @media(max-width:600px){
            .topbar{padding:9px 10px!important}
            .theme-btn,.icon-btn,.student-avatar{width:38px!important;height:38px!important}
            .top-search input{font-size:12px!important}
            .sidebar.ssa-student-sidebar{width:min(280px,86vw)!important;max-width:86vw!important;padding:18px 14px 14px!important}
        }
        @media(max-width:380px){.top-search{display:none!important}.sidebar.ssa-student-sidebar{width:86vw!important;max-width:86vw!important}}
    `;
    document.head.appendChild(style);
}

function paint(html, container) {
    if (!container || !html) return false;
    container.innerHTML = html;
    initializeTopbar();
    window.lucide?.createIcons();
    return true;
}

export async function loadTopbar() {
    installShellStyles();

    const container = document.getElementById("topbarContainer");
    if (!container) return;

    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) paint(cached, container);

    try {
        const response = await fetch(new URL("./topbar.html", import.meta.url), { cache: "no-cache" });
        if (!response.ok) throw new Error(`Failed to load topbar: ${response.status}`);
        const html = await response.text();
        sessionStorage.setItem(CACHE_KEY, html);
        if (!cached) paint(html, container);
        else if (container.innerHTML !== html) paint(html, container);
    } catch (error) {
        console.error("Topbar error:", error);
    }
}

function initializeTopbar() {
    installShellStyles();
    window.lucide?.createIcons();

    const menuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");

    if (menuBtn && !menuBtn.dataset.bound) {
        menuBtn.dataset.bound = "true";
        menuBtn.addEventListener("click", () => {
            const open = sidebar?.classList.toggle("open");
            overlay?.classList.toggle("show", !!open);
            overlay?.setAttribute("aria-hidden", String(!open));
            document.body.classList.toggle("ssa-sidebar-open", !!open);
        });
    }

    if (overlay && !overlay.dataset.bound) {
        overlay.dataset.bound = "true";
        overlay.addEventListener("click", closeSidebar);
    }

    function closeSidebar() {
        sidebar?.classList.remove("open");
        overlay?.classList.remove("show");
        overlay?.setAttribute("aria-hidden", "true");
        document.body.classList.remove("ssa-sidebar-open");
    }

    const themeBtn = document.getElementById("themeToggle");
    const themeIcon = document.getElementById("themeIcon");
    const savedTheme = localStorage.getItem("ssa-theme") || "light";
    applyTheme(savedTheme);

    if (themeBtn && !themeBtn.dataset.bound) {
        themeBtn.dataset.bound = "true";
        themeBtn.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme") || "light";
            applyTheme(current === "dark" ? "light" : "dark");
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("ssa-theme", theme);
        if (themeIcon) {
            themeIcon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon");
            window.lucide?.createIcons();
        }
    }

    const notificationBtn = document.getElementById("notificationBtn");
    const notificationPanel = document.getElementById("notificationPanel");
    if (notificationBtn && !notificationBtn.dataset.bound) {
        notificationBtn.dataset.bound = "true";
        notificationBtn.addEventListener("click", event => {
            event.stopPropagation();
            notificationPanel?.classList.toggle("show");
        });
    }
    if (notificationPanel && !notificationPanel.dataset.bound) {
        notificationPanel.dataset.bound = "true";
        notificationPanel.addEventListener("click", event => event.stopPropagation());
    }

    const profileMenu = document.getElementById("profileMenu");
    if (profileMenu && !profileMenu.dataset.bound) {
        profileMenu.dataset.bound = "true";
        profileMenu.addEventListener("click", () => { window.location.href = "profile.html"; });
        profileMenu.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                window.location.href = "profile.html";
            }
        });
    }

    const searchInput = document.getElementById("studentSearch");
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "true";
        searchInput.addEventListener("keydown", event => {
            if (event.key === "Enter" && searchInput.value.trim()) {
                window.location.href = `courses.html?search=${encodeURIComponent(searchInput.value.trim())}`;
            }
        });
    }

    window.addEventListener("keydown", event => {
        if (event.key === "Escape") closeSidebar();
    }, { once: true });
}

export function updateTopbar(student) {
    if (!student) return;
    const name = student.name || student.fullName || "Student";
    const topName = document.getElementById("topStudentName");
    const avatar = document.getElementById("topAvatar");
    if (topName) {
        topName.textContent = name;
        if (student.premium === true) {
            const badge = document.createElement("span");
            badge.className = "premium-badge";
            badge.textContent = "✓";
            badge.title = "SSA Premium Verified";
            topName.append(" ", badge);
        }
    }
    if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
}
