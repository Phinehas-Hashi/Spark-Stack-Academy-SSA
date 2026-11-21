// ============================================
// SSA PLATFORM UI POLISH
// Safe viewport normalization only.
// Modal and drawer geometry belongs to each
// portal/component stylesheet to prevent clashes.
// ============================================

(() => {
    if (window.__SSA_UI_POLISH__) return;
    window.__SSA_UI_POLISH__ = true;

    const style = document.createElement("style");
    style.id = "ssa-platform-ui-polish";
    style.textContent = `
        html, body { min-height: 100%; }
        html { overflow-x: hidden; }
        body { width: 100%; max-width: 100%; }
        *, *::before, *::after { box-sizing: border-box; }
        img, video, iframe, canvas { max-width: 100%; }
        button, input, select, textarea { font: inherit; }
        table { max-width: 100%; }
        .table-wrapper, .table-responsive, .data-table-wrapper {
            max-width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }
    `;
    document.head.appendChild(style);

    function updateViewportClass() {
        const width = window.innerWidth;
        const device = width <= 480 ? "phone"
            : width <= 768 ? "tablet"
            : width <= 1024 ? "tablet-wide"
            : "desktop";
        document.documentElement.dataset.ssaDevice = device;
    }

    updateViewportClass();
    window.addEventListener("resize", updateViewportClass, { passive: true });
})();
