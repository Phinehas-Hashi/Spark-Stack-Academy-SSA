# Spark Stack Academy — Repository-Wide Design System Audit

**Status:** Five-portal dependency audit completed; Student and Instructor migration batches committed; Admin, Institution and Founder migrations remain queued  
**Branch:** main  
**Audit commit:** pending this report update

## Scope and method

The audit used the recursive Git tree and fetched source files from the current `main` branch. It covered all five portals: all 117 portal HTML files, all 152 CSS files, and the five portal shell entry points plus the Founder component loader. HTML inspection recorded stylesheet order, inline style attributes, embedded style blocks, body/root classes, and shell references. CSS inspection recorded file size, `!important` counts, `@import` usage, likely unscoped root/element selectors, and simple brace-count balance.

The CSS checks are static heuristics, not a browser cascade simulation or a full CSS parser. Balanced brace counts do not prove that a stylesheet is valid or visually correct. Browser testing has not been performed.

## Repository inventory

The current recursive tree contains **478 tracked files**.

| Area | HTML | CSS | JavaScript |
|---|---:|---:|---:|
| Student | 33 | 62 | 48 |
| Instructor | 26 | 24 | 26 |
| Institution | 6 | 4 | 4 |
| Admin | 21 | 18 | 20 |
| Founder | 31 | 35 | 36 |
| **Portal totals** | **117** | **143** | **134** |

There are nine additional CSS files outside portal folders, bringing the repository CSS total to 152. The remaining non-portal HTML/JS files are outside this portal audit.

## Cross-portal findings

1. **There is no single stylesheet-order convention.** Admin and Instructor usually load portal core, shared components, page CSS and responsive CSS, but some pages reverse page/responsive order. Institution commonly loads its base and page styles before the root brand system. Founder pages vary substantially, with the unified stylesheet before or after page CSS. Student regular pages mostly use a repeatable sequence, but some route types omit parts of it.
2. **Global CSS reaches beyond clear ownership boundaries.** Root `css/brand-system.css`, portal foundation files and a number of Founder page styles include global element/root selectors. Some page CSS therefore has the potential to affect other pages or injected shell components.
3. **Override pressure is concentrated in foundations and patch layers.** Highest observed `!important` counts include:
   - `founder/founder-unified.css`: 192
   - `admin/css/responsive.css`: 65
   - `founder/students-fixes.css`: 56
   - `css/brand-system.css`: 51
   - `founder/revenue-premium.css`: 48
   - `instructor/css/responsive.css`: 39
   - `student/css/student-theme.css`: 34
   - `founder/components/founder-theme.css`: 27
   - `founder/dashboard.css`: 27
   - `institution/css/institution.css`: 44
4. **Imports are still used in core stylesheets.** Examples include `css/brand-system.css`, `css/auth.css`, `css/index.css`, `founder/founder-unified.css`, `founder/students.css`, `institution/css/institution.css`, `admin/css/responsive.css`, and `instructor/css/responsive.css`. Their imported dependencies need to be resolved and assigned explicit ownership before the import chains are removed.
5. **The simple brace-count check found balanced opening/closing braces in all 152 CSS files.** This is only a structural screening result; it does not certify syntax, selector correctness, media-query behavior or browser rendering.
6. **Student has parallel stylesheet generations.** There are 26 same-named page stylesheets in both `student/css/` and `student/css/pages/`. The older and newer copies must be compared for selector/content drift and HTML references before one is retired. The old directory also contains portal foundations and some standalone styles; it cannot be deleted wholesale.

## Portal-by-portal dependency findings

### Student Portal

All 33 HTML pages were enumerated. Most regular learning pages use:
`design-tokens → student-core → components → responsive → portal-shell → page stylesheet`.

Exceptions and special routes:
- `student/progress.html`: no stylesheet references were detected.
- `student/certificate-view.html`: standalone certificate stylesheet only.
- `student/portal-suspended.html`: page-specific styling without the regular shell sequence.
- `student/premium-success.html`: partial shared foundation; no design tokens, responsive stylesheet or portal shell.
- `student/chat.html`, `student/messages.html`, `student/new-chat.html`, and `student/help-center.html`: shared styles are partial and `portal-shell.css` is absent; classify their intended shell before changing them.
- Some pages retain inline style attributes, including course details, course player, learning progress, notifications and premium-related pages.

The Student shell is injected by `student/js/student-app.js` through dedicated sidebar/topbar modules. Shell loading and auth/profile boot are coordinated with a shared promise. Keep the injected component selectors and page root contract intact during migration.

**Specific risk:** 26 page stylesheet names exist in both the legacy `student/css/` and newer `student/css/pages/` trees. Confirm every HTML reference and compare the paired CSS before deleting or consolidating either copy. `marketplace.css` has previously been identified as containing more than one styling generation and deserves early review.

### Instructor Portal

The normal page pattern is generally:
`instructor-core.css → components.css → page CSS → responsive.css`.

Exceptions:
- `instructor/calendar.html` places Google Fonts before the portal styles and responsive CSS before its page stylesheet.
- `instructor/dashboard.html` adds root `brand-system.css` after portal/page styles.
- `instructor/messages.html` uses only the shared `role-messaging.css` and has a dedicated `role-messaging-page` body class.
- `instructor/portal-suspended.html` has an embedded style block and no linked stylesheet.
- `instructor/report.html` has an embedded style block and no page-specific stylesheet; it loads core/components/responsive only.
- `instructor/submission.html` omits the responsive stylesheet.
- `instructor/create-quiz.html` and several quiz/report routes omit the Google Fonts link.

The shell is injected by `instructor/js/instructor-app.js`. The script expects `#instructorSidebar`, `#instructorTopbar` and `#sidebarOverlay`, injects component HTML, then attaches mobile navigation handlers. The CSS migration must preserve these IDs and the `.open` / `.active` state contract.

**Specific risk:** `instructor/css/responsive.css` contains 39 `!important` declarations, one import and global/root selectors. Review its override role before using it as the canonical responsive layer.

### Institution Portal

The four application pages are dashboard, courses, learners and registration; two additional HTML files provide sidebar/topbar component markup.
- Dashboard uses `institution.css` followed by root `brand-system.css`.
- Courses and learners add page CSS, with root brand CSS loaded afterward.
- Registration is a standalone `registration-page` route with `register.css`; it should not be forced into the authenticated institution shell.
- No dedicated Institution responsive stylesheet currently exists in the portal folder.

The shell is injected by `institution/js/institution-app.js` into `#institutionSidebar` and `#institutionTopbar`; mobile navigation uses `.open` and `.active` classes with a body state class. The registration page uses its own registration script.

**Specific risk:** `institution/css/institution.css` contains 44 `!important` declarations, an import and global/root selectors. Its role currently spans more than a narrowly scoped portal shell, so it must be decomposed carefully.

### Admin Portal

Most authenticated Admin pages follow:
`admin-core.css → components.css → page CSS → responsive.css`.

Exceptions:
- `admin/messages.html` uses only `role-messaging.css` and a dedicated `role-messaging-page` body class.
- `admin/settings.html` has no linked stylesheets or scripts, while the case-distinct `admin/Settings.html` loads the Admin settings stylesheet and app shell. GitHub Pages is case-sensitive: this is a route/link integrity issue to resolve before styling.
- `admin/certificates.html` and `admin/withdrawals.html` contain embedded style blocks.
- `admin/course-profile.html` and `admin/instructor-profile.html` each retain three inline style attributes.
- `admin/institutions.html` and `admin/pricing.html` put fonts before portal styles and use a different page/responsive ordering.
- Dashboard additionally loads root `brand-system.css`.

The shell is injected by `admin/js/admin-app.js`, which fetches sidebar/topbar markup and then imports their behavior modules. Preserve `#adminSidebar`, `#adminTopbar` and the component initialization contract.

**Specific risk:** `admin/css/responsive.css` has 65 `!important` declarations, one import and global/root selectors. This is a high-priority cascade review target. The lower-case `settings.html` file should be checked for intended route behavior; do not silently overwrite it with the uppercase file without comparing navigation and references.

### Founder Portal

Founder has the most varied stylesheet arrangement:
- Page styles and `founder-unified.css` appear in both orders across pages.
- `founder/dashboard.html` also loads root `brand-system.css`.
- `founder/global-intelligence.html` includes Leaflet CSS and then its page stylesheet after `founder-unified.css`.
- `founder/revenue.html` loads `revenue-premium.css` after the unified and page styles.
- `founder/instructor-admissions.html`, `founder/marketplace.html`, `founder/marketplace-products.html`, and `founder/spark-ai.html` load the unified stylesheet before page-specific CSS.
- `founder/messages.html` uses only `role-messaging.css`.
- `founder/premium-management.html` and `founder/reports.html` have embedded style blocks and load only `founder-unified.css` as linked CSS.
- `founder/security.html` retains one inline style attribute.
- Wallets pages use a different combination of component theme/sidebar/topbar styles and unified styles.

The Founder shell has overlapping implementation paths. `founder/js/founder-app.js` dynamically ensures shell containers and loads `founder-unified.css` and `founder-complete.css`, then injects sidebar/topbar components. A separate `founder/js/component-loader.js` also loads shell components and wires mobile navigation. Determine which pages load which bootstrap path before consolidating; do not let both initialize the same shell.

**Specific risk:** `founder/founder-unified.css` has 192 `!important` declarations and global selectors. `founder/students-fixes.css` adds another 56 override declarations. These should not be treated as a clean design-system foundation without selector-by-selector ownership work.

## Shared shell and JavaScript ownership

| Portal | Shell entry point | Component injection / state contract |
|---|---|---|
| Student | `student/js/student-app.js` | Dedicated sidebar/topbar modules; shell promise; active link update |
| Instructor | `instructor/js/instructor-app.js` | Fetches sidebar/topbar; `.open` sidebar, `.active` overlay |
| Institution | `institution/js/institution-app.js` | Fetches sidebar/topbar; `.open` sidebar, `.active` overlay |
| Admin | `admin/js/admin-app.js` | Fetches markup, imports sidebar/topbar modules and initializes them |
| Founder | `founder/js/founder-app.js` and `founder/js/component-loader.js` | Two component-loader/bootstrap paths need route-by-route ownership confirmation |

Do not rename component IDs, shell root classes, drawer state classes or injected component selectors during a CSS-only migration.

## Recommended target architecture

1. **Brand tokens:** one small root token file for colors, typography, spacing, radii, shadows, borders and motion. Tokens should not style portal page elements directly.
2. **Base/reset:** explicit, minimal reset rules with a documented global scope. Avoid global component styling in this layer.
3. **Portal shell:** one portal-root-scoped stylesheet per portal for layout, sidebar, topbar, content offsets, overlay and mobile drawer behavior.
4. **Shared components:** scoped component primitives with documented class ownership. Avoid broad selectors that unintentionally style page content.
5. **Responsive primitives:** shared breakpoints and layout utilities, with portal-specific shell behavior kept in its owning shell stylesheet.
6. **Page styles:** one canonical stylesheet per page, scoped beneath a stable page root. Page styles must not redefine shell ownership.
7. **Standalone routes:** auth, messaging, registration, suspended, success and transactional screens receive explicit standalone foundations rather than accidental portal-shell dependencies.

The exact canonical link order must be finalized from selector ownership and actual imports. The existing Student sequence should not be copied blindly to other portals.

## Prioritised migration blueprint

**P0 — route and shell integrity**
- Resolve Admin `settings.html` versus `Settings.html` and confirm the intended navigation target.
- Classify every exception listed above as shell page, standalone page or embedded component.
- Confirm Founder bootstrap ownership and eliminate any duplicate shell initialization only after page references are known.
- Record the stable shell root, component IDs and drawer state classes for each portal.

**P1 — source-of-truth CSS**
- Establish root design tokens and documented reset ownership.
- Map imported CSS dependencies and remove imports only after inlining/replacing their responsibilities.
- Compare the 26 duplicate Student page stylesheet pairs and select a canonical copy for each route.
- Decompose the high-override foundations in this order: Admin responsive, Founder unified, Institution foundation, Instructor responsive, Student theme, then remaining patch layers.
- Replace unscoped selectors with portal/page-root scopes where the HTML contract supports it.

**P2 — page migration**
- Migrate one portal at a time, retaining a commit/rollback point for each batch.
- Move static inline and embedded styles to their page stylesheets; retain runtime-generated inline styles where JavaScript behavior depends on them.
- Keep modals, drawers, dropdowns, topbars and sidebars on a documented stacking-context scale.
- Remove unused legacy CSS only after confirming no HTML, JS injection or dynamic route references it.

**P3 — verification**
- Check every route at mobile, tablet and desktop widths.
- Test drawer open/close, overlay, Escape, body scroll lock, modal stacking, dropdown clipping, topbar alignment, horizontal overflow and keyboard focus.
- Run HTML/CSS linting and route/link checks; verify case-sensitive paths.
- Test actual GitHub Pages output and Firebase-backed flows separately. Static repository inspection is not proof of runtime or production readiness.

## Audit conclusion

The dependency mapping and static CSS scan cover all five portals and all 152 CSS files. The architecture is not suitable for a mass stylesheet replacement: route exceptions, parallel Student CSS generations, global selector leakage, override-heavy foundations and competing Founder shell loaders must be addressed in controlled stages. Migration has begun with scoped, reversible portal batches. No wholesale CSS deletion has been performed; legacy files remain until their usage and behavior are verified. The next work is to finish Student and Instructor regression checks, then migrate Institution, Admin and Founder in sequence.

## Portal migration progress — 23 November 2026

### Student Portal — first migration batch

- Regular Student routes continue to use the canonical token/core/components/responsive/shell/page stylesheet sequence where a shell is intended.
- Premium Success now loads shared tokens and core defaults without the unused shell component stylesheet.
- Portal Suspended now uses the shared tokens with a standalone page root.
- Certificate View now uses a dedicated `.certificate-view-page` root, token palette and typography; its print behavior is retained and its global heading/footer/reset selectors have been scoped.
- Marketplace CSS was consolidated to the current generation after its previous classes were checked against the page HTML and JavaScript. The obsolete generation was removed from the active page stylesheet; the unused legacy duplicate file remains retained.
- All 29 Student page-owned stylesheets passed the static brace-balance check and the bare global element-selector screen. Browser verification remains outstanding.
- The 26 old duplicate page stylesheet copies are retained pending final regression testing and cleanup.

### Instructor Portal — foundation and page migration

- Classified all 24 Instructor HTML routes: 17 authenticated shell routes and 7 standalone routes.
- The 17 shell routes use shared design tokens, Instructor core/reset, injected shell components, a page stylesheet, responsive primitives and the scoped Instructor theme. The current link order is: tokens → font preconnect/font stylesheet → core → shell components → page stylesheet → responsive primitives → theme.
- Four standalone quiz routes (Create Quiz, Quiz Submission, Quiz and Quizzes) use the shared standalone foundation, their own page stylesheet, responsive primitives and the scoped theme; they do not load the injected sidebar/topbar components.
- Messages remains a standalone shared messaging layout. It now loads shared tokens and a dedicated Instructor-only `messages.css` override.
- Portal Suspended and Submission Review each use dedicated standalone page-root styles and do not depend on the authenticated shell.
- Replaced the Instructor component stylesheet with selectors scoped to the actual injected IDs: `#instructorSidebar`, `#sidebarOverlay` and `#instructorTopbar`. The sidebar open state and overlay state match the shell JavaScript classes `.open` and `.active`.
- Removed duplicate outer sidebar and overlay geometry from Instructor core CSS. The injected component stylesheet owns those elements; core CSS owns the reset, main-column offset and topbar sizing.
- Scoped Instructor token aliases to `.instructor-app` and `.instructor-page` instead of defining portal-specific aliases globally on `:root`.
- Updated the mobile menu control with `aria-controls` and `aria-expanded`, and made its click handler toggle the drawer state.
- Migrated legacy Instructor blue/navy brand values in page stylesheets toward the shared purple/cyan palette while retaining semantic status colors.
- Extracted Report an Issue styles into `instructor/css/report.css`. The suspended page and submission-review page use dedicated standalone stylesheets.
- Static inspection of all 24 Instructor HTML routes found no embedded `<style>` blocks or inline style attributes. Inspected Instructor CSS files have balanced braces and no `@import` dependencies.
- Remaining `!important` declarations are primarily state/visibility rules and reduced-motion overrides; they still require contextual browser review.


**Instructor verification checklist:** test the drawer and overlay at mobile widths; verify keyboard Escape and body scroll lock; test course-builder and assignment modals, earnings/payment dialogs, quiz grading panels, responsive tables, messages and standalone routes. The repository changes are committed, but the Instructor portal must not be marked visually complete until these checks pass on GitHub Pages.
**Migration status:** Student active stylesheet foundation and standalone-page first batch are committed. Instructor foundation and page-level palette migration are committed across its shell and standalone routes. The remaining work is browser verification followed by controlled migration of Institution, Admin and Founder. Static source checks do not establish visual correctness or production readiness.

**Important:** The Instructor migration is a source-code migration, not a claim that every route has been visually verified. Test the mobile drawer, topbar, course-builder modals, earnings withdrawal modal, quiz grading panels, responsive tables and standalone messaging on GitHub Pages before calling this portal complete. No production-ready claim is made until all portal routes have been tested at desktop, tablet and mobile widths.
