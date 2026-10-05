// ============================================
// SSA PLATFORM UI POLISH
// Modals + viewport layout normalization
// ============================================

(() => {
    if (window.__SSA_UI_POLISH__) return;
    window.__SSA_UI_POLISH__ = true;

    const style = document.createElement("style");
    style.id = "ssa-platform-ui-polish";
    style.textContent = `
        html, body { min-height: 100%; }
        html { overflow-x: hidden; }
        body { width: 100%; max-width: 100vw; }
        *, *::before, *::after { box-sizing: border-box; }
        img, video, iframe, canvas { max-width: 100%; }
        button, input, select, textarea { font: inherit; }

        /* Universal modal shell */
        .modal, .modal-overlay, .modal-backdrop,
        [role="dialog"], [aria-modal="true"] {
            box-sizing: border-box;
        }
        .modal, .modal-overlay, .modal-backdrop,
        [role="dialog"][aria-modal="true"] {
            z-index: 5000;
        }
        /* Drawers must sit above the Founder shell/sidebar/topbar. */
        .ai-tool-drawer,
        .course-drawer,
        .notification-drawer,
        .lesson-drawer,
        .admin-modal,
        .calendar-modal,
        .ai-action-modal,
        [class*="drawer"][aria-hidden="false"],
        [class*="drawer"].open,
        [class*="drawer"].show,
        [class*="modal"][aria-hidden="false"],
        [class*="modal"].active,
        [class*="modal"].open,
        [class*="modal"].show {
            z-index: 5000 !important;
        }
        .drawer-backdrop,
        .lesson-drawer-overlay,
        .admin-modal-backdrop,
        .calendar-modal-backdrop,
        [class*="drawer-backdrop"].open,
        [class*="drawer-overlay"].open,
        [class*="modal-backdrop"].open {
            z-index: 4990 !important;
        }
        .modal-overlay, .modal-backdrop {
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100dvh;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: clamp(12px, 3vw, 28px);
            overflow-y: auto;
            overscroll-behavior: contain;
            background: rgba(3, 10, 27, .62);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
        }
        .modal > *, [role="dialog"] > * {
            max-width: 100%;
        }
        .modal-content, .modal-dialog,
        .modal .modal-content, .modal-overlay > .modal-content,
        [role="dialog"] {
            width: min(560px, 100%);
            max-height: min(88dvh, 760px);
            overflow: auto;
            overscroll-behavior: contain;
            border-radius: 20px;
            box-shadow: 0 24px 80px rgba(0,0,0,.28);
        }
        .modal-content::-webkit-scrollbar,
        .modal-dialog::-webkit-scrollbar,
        [role="dialog"]::-webkit-scrollbar { width: 6px; }

        .modal.is-open, .modal.open, .modal.show,
        .modal-overlay.is-open, .modal-overlay.open,
        [role="dialog"][aria-hidden="false"] { animation: ssaModalIn .18s ease both; }
        body.ssa-modal-open { overflow: hidden; touch-action: none; }

        /* Responsive app shell */
        .ssa-injected-component { min-width: 0; }
        main, .main-content, .content, .page-content,
        .dashboard-content, .app-content { min-width: 0; }
        .container, .content-container, .page-container {
            width: min(100%, 1440px);
            margin-inline: auto;
        }
        table { max-width: 100%; }
        .table-wrapper, .table-responsive, .data-table-wrapper {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }

        @keyframes ssaModalIn {
            from { opacity: 0; transform: translateY(10px) scale(.985); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-width: 1024px) {
            .container, .content-container, .page-container { width: 100%; }
        }
        @media (max-width: 768px) {
            .modal-overlay, .modal-backdrop {
                place-items: end center;
                padding: 10px;
            }
            .modal-content, .modal-dialog,
            .modal .modal-content, .modal-overlay > .modal-content,
            [role="dialog"] {
                width: 100%;
                max-height: 90dvh;
                border-radius: 18px;
            }
            .ssa-injected-component { max-width: 100vw; }
        }
        @media (max-width: 480px) {
            .modal-overlay, .modal-backdrop { padding: 8px; }
            .modal-content, .modal-dialog,
            .modal .modal-content, .modal-overlay > .modal-content,
            [role="dialog"] { max-height: 94dvh; border-radius: 16px; }
        }
    `;
    document.head.appendChild(style);

    function updateViewportClass() {
        const w = window.innerWidth;
        const device = w <= 480 ? "phone" : w <= 768 ? "tablet" : w <= 1024 ? "tablet-wide" : "desktop";
        document.documentElement.dataset.ssaDevice = device;
    }

    function bindModal(modal) {
        if (modal.dataset.ssaBound === "1") return;
        modal.dataset.ssaBound = "1";

        const isOpen = () => {
            const hidden = modal.getAttribute("aria-hidden");
            return hidden === "false" || modal.classList.contains("open") || modal.classList.contains("show") || modal.classList.contains("is-open");
        };

        const sync = () => document.body.classList.toggle("ssa-modal-open", !!document.querySelector('.modal.open,.modal.show,.modal.is-open,.modal-overlay.open,.modal-overlay.is-open,[role="dialog"][aria-hidden="false"]'));
        modal.addEventListener("click", event => {
            if (event.target === modal && isOpen()) {
                modal.classList.remove("open", "show", "is-open");
                modal.setAttribute("aria-hidden", "true");
                sync();
            }
        });
        modal.querySelectorAll('[data-modal-close], .modal-close, [data-close-modal]').forEach(btn => {
            btn.addEventListener("click", () => {
                modal.classList.remove("open", "show", "is-open");
                modal.setAttribute("aria-hidden", "true");
                sync();
            });
        });
    }

    function scan() {
        updateViewportClass();
        document.querySelectorAll('.modal,.modal-overlay,.modal-backdrop,[role="dialog"]').forEach(bindModal);
    }

    window.addEventListener("resize", updateViewportClass, { passive: true });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan, { once: true });
    else scan();

    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
