// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR PORTAL
// SIDEBAR ENGINE V2
// ============================================================

let sidebarContainer = null;
let sidebar = null;
let sidebarOverlay = null;
let menuButton = null;


// ============================================================
// INITIALIZE
// ============================================================

export function initSidebar() {

    sidebarContainer =
        document.getElementById("instructorSidebar") || document.getElementById("sidebarContainer");

    sidebar =
        sidebarContainer?.querySelector(".sidebar");

    sidebarOverlay =
        document.getElementById("sidebarOverlay");

    menuButton =
        document.getElementById("instructorMenuBtn");


    console.log("🔥 SIDEBAR ENGINE INITIALIZED");

    console.log("Sidebar:", sidebar);
    console.log("Menu:", menuButton);


    if (!sidebar) {
        console.error("❌ .sidebar not found");
        return;
    }


    if (!menuButton) {
        console.error("❌ #instructorMenuBtn not found");
        return;
    }


    setupMenu();
    setupNavigation();
    setActivePage();

}


// ============================================================
// MENU
// ============================================================

function setupMenu() {

    menuButton.addEventListener(
        "click",
        event => {

            event.preventDefault();
            event.stopPropagation();

            toggleSidebar();

        }
    );


    sidebarOverlay?.addEventListener(
        "click",
        closeSidebar
    );


    document.addEventListener(
        "keydown",
        event => {

            if (event.key === "Escape") {

                closeSidebar();

            }

        }
    );

}


// ============================================================
// TOGGLE
// ============================================================

function toggleSidebar() {

    if (
        sidebarContainer?.classList.contains("open")
    ) {

        closeSidebar();

    } else {

        openSidebar();

    }

}


// ============================================================
// OPEN
// ============================================================

function openSidebar() {

    sidebarContainer?.classList.add("open");

    sidebarOverlay?.classList.add("active");

    document.body.classList.add("sidebar-open");

    console.log("📂 SIDEBAR OPENED");

}


// ============================================================
// CLOSE
// ============================================================

function closeSidebar() {

    sidebarContainer?.classList.remove("open");

    sidebarOverlay?.classList.remove("active");

    document.body.classList.remove("sidebar-open");

    console.log("📁 SIDEBAR CLOSED");

}


// ============================================================
// NAVIGATION
// ============================================================

function setupNavigation() {

    sidebar
        .querySelectorAll(".nav-link")
        .forEach(link => {

            link.addEventListener(
                "click",
                () => {

                    if (
                        window.innerWidth <= 900
                    ) {

                        closeSidebar();

                    }

                }
            );

        });

}


// ============================================================
// ACTIVE PAGE
// ============================================================

function setActivePage() {

    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();


    sidebar
        ?.querySelectorAll(".nav-link")
        .forEach(link => {

            const href =
                link.getAttribute("href");

            if (!href) return;


            const page =
                href
                    .split("/")
                    .pop()
                    .split("?")[0]
                    .toLowerCase();


            link.classList.toggle(
                "active",
                page === currentPage
            );

        });

}


// ============================================================
// REFRESH
// ============================================================

export function refreshSidebar() {

    initSidebar();

    if (
        window.lucide &&
        typeof window.lucide.createIcons === "function"
    ) {

        window.lucide.createIcons();

    }

}