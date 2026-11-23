# Instructor Portal CSS architecture

## Canonical load order

For standard Instructor pages:

1. `../css/design-tokens.css` — shared design values only.
2. `instructor-core.css` — document reset, Instructor shell geometry and token aliases.
3. `components.css` — injected sidebar and topbar only.
4. One page stylesheet — page content and page-specific states.
5. `responsive.css` — responsive primitives and overflow/reduced-motion behavior.
6. `instructor-theme.css` — scoped brand layer applied after page styles.

The theme is intentionally loaded last so it can standardise shared page chrome and common controls without global selectors. Page-specific layout remains owned by the page stylesheet.

## Ownership rules

- `design-tokens.css` is the source of shared colors, typography, spacing, radii and shadows.
- `instructor-core.css` owns the document reset, shell geometry, sidebar width and document scroll lock.
- `components.css` styles only `#instructorSidebar`, `#sidebarOverlay` and `#instructorTopbar`. Do not add page cards, forms or modal content here.
- `responsive.css` owns breakpoints and responsive primitives. It must not import `brand-system.css` or define global heading/button styles.
- `instructor-theme.css` owns Instructor-scoped brand presentation. Keep selectors under `.instructor-app`, `.instructor-page`, `#instructorSidebar` or `#instructorTopbar`.
- Each page stylesheet owns its page content. Avoid unscoped element selectors and shared component names unless the selector is rooted under the page.
- Keep body scroll-lock classes aligned with the JavaScript state class.
- Preserve component IDs and navigation state classes. Current shell contract: `#instructorSidebar.open`, `#sidebarOverlay.active`, and `body.sidebar-open`.
- Keep standalone messaging, maintenance and submission-review pages independent of the authenticated portal shell.

## Migration notes

- Instructor core variables now map to the shared SSA design tokens.
- The previous `brand-system.css` import was removed from `responsive.css`; standard Instructor pages now load the scoped `instructor-theme.css` instead.
- The Instructor component stylesheet was reduced to the currently injected sidebar/topbar markup and scoped to component IDs.
- Sidebar width is 270px on desktop. The tablet offset applies only above 900px, so the mobile drawer breakpoint does not leave an empty main-column gutter.
- The overlay class used by the shell is `.active`; the stylesheet supports it. The document lock class is `.sidebar-open`.
- Report styles were moved out of the HTML and scoped under `.report-page`.
- The suspended screen and submission review screen now use standalone page-root styles and shared tokens.
- The quizzes, create-quiz and dashboard stylesheets had proven duplicate same-context rules consolidated. Other repeated selectors are retained where they are responsive overrides.

## Standalone routes

- `messages.html` uses the shared role-messaging experience and does not load the Instructor shell.
- `portal-suspended.html` is a standalone system-state screen.
- `submission.html` is a standalone submission-review experience.
- `create-quiz.html`, `quiz.html`, `quiz-submission.html` and `quizzes.html` use the `.instructor-page` root without injecting the full sidebar/topbar shell.

## Verification checklist

- All linked stylesheet paths exist in the repository.
- Shared tokens load before Instructor core.
- No standard Instructor page imports the global brand system.
- Sidebar, overlay and topbar selectors are contained within their component IDs.
- Desktop, tablet and mobile shell geometry is checked at 1100px, 901px and 900px boundaries.
- Drawer open/close, overlay click, Escape, body scroll lock and nav click behavior are checked.
- Modal stacking, page overflow, keyboard focus and form states are checked.
- GitHub Pages output is tested separately; repository checks alone do not prove browser behavior.
