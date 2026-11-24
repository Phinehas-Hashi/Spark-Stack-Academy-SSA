// ============================================
// SPARK STACK ACADEMY — HOMEPAGE INTERACTIONS
// ============================================

import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Keep role destinations in one place. These paths match the
// portal directories in the repository.
const DASHBOARDS = {
  founder: "founder/dashboard.html",
  admin: "admin/dashboard.html",
  instructor: "instructor/dashboard.html",
  student: "student/dashboard.html",
  institution: "institution/dashboard.html"
};

const ROLE_ALIASES = {
  owner: "founder",
  superadmin: "founder",
  "super-admin": "founder",
  teacher: "instructor",
  learner: "student",
  school: "institution"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function dashboardFor(role) {
  const normalized = String(role || "student").trim().toLowerCase();
  const canonical = ROLE_ALIASES[normalized] || normalized;
  return DASHBOARDS[canonical] || DASHBOARDS.student;
}

// ============================================
// PRELOADER
// ============================================

const preloader = $("#preloader");
let preloaderHidden = false;

function hidePreloader() {
  if (!preloader || preloaderHidden) return;
  preloaderHidden = true;
  preloader.classList.add("is-hidden");
  preloader.setAttribute("aria-hidden", "true");
  window.setTimeout(() => preloader.remove(), 600);
}

window.addEventListener("load", hidePreloader, { once: true });
window.setTimeout(hidePreloader, 3000);

// ============================================
// RESPONSIVE NAVIGATION
// ============================================

const header = $("header");
const menuButton = $("#menuBtn");
const navLinks = $(".nav-links");
const navItems = $$(".nav-links a");

function closeMobileMenu() {
  if (!menuButton || !navLinks) return;
  navLinks.classList.remove("show");
  menuButton.setAttribute("aria-expanded", "false");
  const icon = $("i", menuButton);
  if (icon) {
    icon.classList.remove("fa-xmark");
    icon.classList.add("fa-bars");
  }
}

if (menuButton && navLinks) {
  menuButton.setAttribute("aria-controls", navLinks.id || "primary-navigation");
  menuButton.setAttribute("aria-expanded", "false");
  if (!navLinks.id) navLinks.id = "primary-navigation";

  menuButton.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("show");
    menuButton.setAttribute("aria-expanded", String(isOpen));
    const icon = $("i", menuButton);
    if (icon) {
      icon.classList.toggle("fa-bars", !isOpen);
      icon.classList.toggle("fa-xmark", isOpen);
    }
  });

  navItems.forEach(link => link.addEventListener("click", closeMobileMenu));

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMobileMenu();
  });

  document.addEventListener("click", event => {
    if (
      navLinks.classList.contains("show") &&
      !navLinks.contains(event.target) &&
      !menuButton.contains(event.target)
    ) closeMobileMenu();
  });
}

// ============================================
// HEADER SCROLL STATE + BACK TO TOP
// ============================================

const backToTop = $("#backToTop");
let scrollTicking = false;

function updateScrollUI() {
  const scrolled = window.scrollY > 40;
  if (header) header.classList.toggle("is-scrolled", scrolled);
  if (backToTop) backToTop.classList.toggle("show", window.scrollY > 500);
  scrollTicking = false;
}

window.addEventListener("scroll", () => {
  if (scrollTicking) return;
  scrollTicking = true;
  window.requestAnimationFrame(updateScrollUI);
}, { passive: true });

updateScrollUI();

if (backToTop) {
  backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ============================================
// ACCESSIBLE IN-PAGE NAVIGATION
// ============================================

$$('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", event => {
    const targetId = anchor.getAttribute("href");
    if (!targetId || targetId === "#") return;
    const target = $(targetId);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// ============================================
// ACTIVE SECTION INDICATOR
// ============================================

const trackedSections = $$("main section[id], body > section[id], section[id]");
if ("IntersectionObserver" in window && navItems.length && trackedSections.length) {
  const sectionObserver = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;

    navItems.forEach(link => {
      const active = link.getAttribute("href") === `#${visible.target.id}`;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }, { rootMargin: "-25% 0px -60% 0px", threshold: [0, 0.15, 0.35, 0.6] });

  trackedSections.forEach(section => sectionObserver.observe(section));
}

// ============================================
// SCROLL REVEAL — respects reduced motion
// ============================================

const revealSelector = [
  ".course-card", ".why-card", ".achievement-card",
  ".testimonial-card", ".contact-card", ".partner-item",
  ".feature", ".instructor-card", ".portal-showcase-card",
  ".academy-experience-copy", ".academy-experience-art",
  ".mobile-experience"
].join(",");

const revealItems = $$(revealSelector);
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!prefersReducedMotion && "IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  revealItems.forEach(item => {
    item.classList.add("reveal-on-scroll");
    revealObserver.observe(item);
  });
} else {
  revealItems.forEach(item => item.classList.add("is-visible"));
}

// ============================================
// ANIMATED COUNTERS
// ============================================

const counters = $$(".counter");

if ("IntersectionObserver" in window && counters.length) {
  const counterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const counter = entry.target;
      const target = Number(counter.dataset.target);
      if (!Number.isFinite(target) || target < 0) {
        counterObserver.unobserve(counter);
        return;
      }

      const duration = 1200;
      const startedAt = performance.now();
      const initialText = counter.textContent.trim();
      const suffix = initialText.endsWith("+") || counter.dataset.suffix === "+" ? "+" : "";

      function tick(now) {
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        counter.textContent = `${Math.round(target * eased)}${progress === 1 ? suffix : ""}`;
        if (progress < 1) window.requestAnimationFrame(tick);
      }

      window.requestAnimationFrame(tick);
      counterObserver.unobserve(counter);
    });
  }, { threshold: 0.5 });

  counters.forEach(counter => counterObserver.observe(counter));
}

// ============================================
// NEWSLETTER — existing client-side acknowledgement
// Note: this form has no connected subscription backend yet.
// ============================================

const newsletterForm = $("#newsletterForm");
if (newsletterForm) {
  newsletterForm.addEventListener("submit", event => {
    event.preventDefault();
    const input = $("input[type='email'], input", newsletterForm);
    if (!input || !input.value.trim()) return;
    if (input.type === "email" && !input.checkValidity()) {
      input.reportValidity();
      return;
    }
    window.alert("Thanks for your interest in Spark Stack Academy. Newsletter subscriptions are not connected yet.");
    newsletterForm.reset();
  });
}

// ============================================
// FIREBASE SESSION + ROLE-BASED PORTAL ROUTING
// ============================================

const loginButton = $(".login-btn");
const signupButton = $(".signup-btn");

onAuthStateChanged(auth, async user => {
  if (!user) return;

  try {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    if (!userSnapshot.exists()) return;

    const userData = userSnapshot.data();
    const destination = dashboardFor(userData.role);

    if (loginButton) {
      loginButton.textContent = "Dashboard";
      loginButton.href = destination;
    }

    if (signupButton) {
      signupButton.textContent = "My Account";
      signupButton.href = destination;
    }

    // Use textContent, not innerHTML, for user-provided profile data.
    const welcome = $(".hero-badge, .hero-eyebrow");
    if (welcome && userData.fullName) {
      welcome.textContent = `Welcome back, ${userData.fullName}`;
    }
  } catch (error) {
    console.error("Unable to load the signed-in Academy profile:", error);
  }
});

// Retain the existing global logout entry point for any legacy callers.
window.logout = async () => {
  try {
    await signOut(auth);
    window.location.reload();
  } catch (error) {
    console.error("Sign-out failed:", error);
    window.alert("We could not sign you out. Please try again.");
  }
};

console.info("Spark Stack Academy homepage interactions initialized.");
