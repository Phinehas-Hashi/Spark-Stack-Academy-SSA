# Spark Stack Academy — Repository-Wide Design System Audit

**Status:** Student, Instructor, Institution and Admin source migrations are recorded; Founder source migration is now isolated on `migration/founder-final`. Browser and live Firebase verification remain outstanding.  
**Branch:** migration/founder-final  
**Audit commit:** updated with Founder source migration checkpoint

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
- `instructor/messages.html` uses the shared `role-messaging.css` plus Instructor-specific `instructor/css/messages.css` overrides and has a dedicated `role-messaging-page instructor-messages-page` body class.
- `instructor/portal-suspended.html` is a standalone route and now uses `instructor/css/portal-suspended.css`.
- `instructor/report.html` is a shell route; its embedded styles were moved to `instructor/css/report.css`.
- `instructor/submission.html` is a standalone review workflow and now uses only tokens and `instructor/css/submission.css`, without loading the unused portal shell.
- `instructor/create-quiz.html`, `instructor/quiz.html`, `instructor/quizzes.html` and `instructor/quiz-submission.html` are standalone workflows; they now use the shared standalone page foundation rather than loading empty shell components.

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

The Founder source migration now uses `body.founder-portal-page` as the portal ownership boundary. All 26 top-level Founder routes load shared design tokens, and the active page/shell stylesheets are ordered consistently: tokens and typography, shell components, page stylesheet, then the unified Founder theme. The standalone Messages route keeps its role-messaging base and Founder-only override.

Completed source migration:
- Removed the cross-portal `brand-system.css` import from the Founder unified theme and removed direct brand-system links from Founder pages.
- Scoped the active Founder unified theme, shell components, page stylesheets, Wallets stylesheets, and shared role-messaging styles to their owning body roots.
- The Founder shell now preloads sidebar/topbar styles before the unified theme. Its active bootstrap is `founder/js/founder-app.js`; the separate `founder/js/component-loader.js` has no page/script references and remains as inactive legacy code pending removal review.
- Preserved the route-aware Wallets base path. The nested Wallets page no longer references nonexistent `./js/founder-app.js` or `./js/founder-auth.js`; `wallets.js` imports the shared app module and owns the page's existing wallet initialization.
- Premium Management and Reports now load dedicated page stylesheets. Courses styling was moved out of its embedded style block. Security spacing and the topbar notification badge's initial visibility are owned by CSS rather than static inline styles.
- All 26 Founder HTML routes were statically checked: no embedded style blocks or inline style attributes remain, all load shared design tokens, and none loads the cross-portal brand stylesheet.
- All inspected active Founder CSS files have balanced braces and no `@import` dependencies. The Students font now uses the shared typography link.
- No Firebase, Firestore, authorization, wallet, payment or Cloud Functions logic was intentionally changed.

Inactive legacy files `founder-complete.css`, `founder/components/founder-shell.css` and `founder/components/founder-theme.css` are retained because no active route/bootstrap references them; they were not deleted as part of this migration.

**Remaining risk:** `founder-unified.css` still contains 170 `!important` declarations; `students-fixes.css` has 56, `revenue-premium.css` has 48 and Dashboard has 27. These rules are now portal-scoped, but their visual precedence and responsive behavior need browser review. Static checks do not validate the live Firebase flows, modal stacking, mobile drawer animation, or production rendering.

## Shared shell and JavaScript ownership

| Portal | Shell entry point | Component injection / state contract |
|---|---|---|
| Student | `student/js/student-app.js` | Dedicated sidebar/topbar modules; shell promise; active link update |
| Instructor | `instructor/js/instructor-app.js` | Fetches sidebar/topbar; `.open` sidebar, `.active` overlay |
| Institution | `institution/js/institution-app.js` | Fetches sidebar/topbar; `.open` sidebar, `.active` overlay |
| Admin | `admin/js/admin-app.js` | Fetches markup, imports sidebar/topbar modules and initializes them |
| Founder | `founder/js/founder-app.js` | Active shell bootstrap; `component-loader.js` is unreferenced legacy code retained pending removal review |

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
- [x] Resolve Admin `settings.html` versus `Settings.html`; the uppercase authenticated page is canonical and the lowercase path redirects to it.
- Classify every exception listed above as shell page, standalone page or embedded component.
- [x] Confirm Founder bootstrap ownership: `founder-app.js` is the active shell entry point; the unreferenced `component-loader.js` remains retained legacy code.
- Record the stable shell root, component IDs and drawer state classes for each portal.

**P1 — source-of-truth CSS**
- Establish root design tokens and documented reset ownership.
- Map imported CSS dependencies and remove imports only after inlining/replacing their responsibilities.
- Compare the 26 duplicate Student page stylesheet pairs and select a canonical copy for each route.
- Reduce the remaining high-override foundations after browser regression: Founder unified, Student fixes/theme, Revenue premium, Admin responsive/modal layer, Institution foundation and Instructor responsive layer. Founder selectors are now portal-scoped; override reduction is a separate visual-validation task.
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

The dependency mapping and static CSS scan cover all five portals and all 152 CSS files. The architecture is not suitable for a mass stylesheet replacement: route exceptions, parallel Student CSS generations and override-heavy foundations still require controlled regression work. Source migrations have been recorded in scoped, reversible batches across Student, Instructor, Institution, Admin and Founder. No wholesale CSS deletion has been performed; legacy files remain until their usage and behavior are verified. The remaining work is browser/Firebase regression, merge reconciliation and reduction of high-override layers.

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
- Follow-up static validation resolved every local CSS and JavaScript reference across the 24 Instructor application routes against the current repository tree; no missing local asset paths were found. The 24 route files also contain no embedded style blocks or inline style attributes.
- All 29 Instructor CSS files have balanced brace counts and no `@import` directives. This is a static structural check only; it does not replace parsing or browser rendering.



**Instructor verification checklist:** test the drawer and overlay at mobile widths; verify keyboard Escape and body scroll lock; test course-builder and assignment modals, earnings/payment dialogs, quiz grading panels, responsive tables, messages and standalone routes. The repository changes are committed, but the Instructor portal must not be marked visually complete until these checks pass on GitHub Pages.
**Migration status:** Student, Instructor and Institution source migrations are recorded; Admin source migration is recorded on its portal branch; Founder source migration is recorded on `migration/founder-final`. Remaining work is cross-branch reconciliation, browser verification and live Firebase regression. Static source checks do not establish visual correctness or production readiness.

**Important:** The Instructor migration is a source-code migration, not a claim that every route has been visually verified. Test the mobile drawer, topbar, course-builder modals, earnings withdrawal modal, quiz grading panels, responsive tables and standalone messaging on GitHub Pages before calling this portal complete. No production-ready claim is made until all portal routes have been tested at desktop, tablet and mobile widths.


### Institution Portal — foundation and page migration

- Re-scoped the authenticated shell foundation so the portal's reset, body styling, sidebar, topbar and overlay no longer rely on unqualified global element selectors. Shell IDs are scoped under `.institution-app`.
- Separated dashboard-only presentation into `institution/css/dashboard.css`; the authenticated shell foundation retains shared layout, shell, responsive drawer and access-fallback rules.
- Dashboard, Courses and Learners load shared design tokens, the shared Montserrat/Poppins font pair, the Institution shell foundation and their route-specific stylesheet. Dashboard now has its own page stylesheet.
- Institution Registration remains a standalone onboarding route. It loads shared tokens, typography and `register.css` only, without authenticated portal shell CSS.
- Dashboard, Courses and Learners use the authenticated shell wrapper and page roots. Registration has its own standalone `.registration-page` root.
- Sidebar, topbar and overlay rules are scoped to the injected `#institutionSidebar`, `#institutionTopbar` and `#sidebarOverlay` within `.institution-app`. The mobile drawer uses the actual JavaScript `.open` and `.active` states, with a 270px desktop content offset and a 292px maximum mobile drawer.
- Navigation accessibility remains aligned with the existing JavaScript: `aria-controls`, `aria-expanded`, `aria-hidden`, Escape handling, overlay click and body scroll lock. No Firebase or Cloud Functions behavior was changed.
- Aligned Dashboard, Courses, Learners and Registration colours with the shared purple/cyan design language while preserving semantic success, warning and error states.
- Moved the dynamic access-verification fallback presentation into scoped `.institution-access-error` CSS rules. Runtime-driven progress-bar widths remain in JavaScript.
- Static inspection of all four Institution application routes found no embedded style blocks or inline style attributes. All local CSS and JavaScript references resolved against the repository tree.
- All five active Institution CSS files have balanced brace counts and no `@import` directives. The only remaining `!important` declarations are reduced-motion overrides in the shell and registration styles.
- Browser rendering, mobile drawer interaction, and Firebase-backed workflows have not been verified in this migration pass.


**Institution verification checklist:** test dashboard metrics and quota/team panels, course creation/listing, learner enrolment and roster actions, registration submission, mobile sidebar open/close and overlay, Escape handling, and all Firebase-backed states. Visual and backend verification remains outstanding; the Institution source migration must not be treated as production sign-off.


### Admin Portal — foundation and page migration

- Rebuilt `admin/css/admin-core.css` around shared design tokens. Admin palette aliases now inherit the Academy ink, violet, cyan, canvas, surface and border tokens instead of defining a separate blue/navy root palette.
- Scoped the Admin reset, typography, page header, content offset, sidebar, topbar and overlay under `.admin-app`; body-level state selectors are restricted to `body.admin-portal-page`.
- Removed the cross-portal `brand-system.css` import from `admin/css/responsive.css` and removed the dashboard's direct brand-system link. The Admin responsive layer now contains Admin-only breakpoints and the existing tested modal positioning rules.
- Standardized all 17 authenticated Admin routes on this order: shared tokens → Montserrat/Poppins fonts → Admin core → shared Admin components → one page stylesheet → Admin responsive/modal layer.
- Removed the conflicting global brand-system override layer and aligned Admin component/page brand colors with the shared violet/cyan palette. Semantic status colors remain intact.
- Unified the Admin sidebar and topbar chrome with the dark indigo shell. Mobile navigation uses the JavaScript `.open` state, overlay `.active` state, body scroll lock and the actual shell IDs.
- Added `aria-controls`, `aria-expanded` and `aria-hidden` state synchronization to the menu control, including Escape and overlay-close behavior.
- Extracted Certificates and Withdrawals inline style blocks into dedicated `certificates.css` and `withdrawals.css`. Those pages no longer load the unrelated Dashboard stylesheet.
- Removed six static inline progress-bar width attributes from Course Profile and Instructor Profile and placed their zero-state defaults in the page stylesheets; runtime JavaScript width updates remain unchanged.
- Admin Messages remains a standalone shared messaging screen with an Admin-only theme override. It does not load the authenticated Admin shell.
- Resolved the case-sensitive Settings route: `Settings.html` remains the canonical authenticated page and the lowercase `settings.html` path redirects to it. Sidebar and profile menu links use the canonical path.
- Static inspection of all 19 Admin HTML routes found no embedded style blocks or inline style attributes. All 21 Admin CSS files have balanced brace counts and no `@import` directives.
- The remaining `!important` declarations are concentrated in the existing modal surface/stacking normalization, reduced-motion rules and a few component states. The previously tested modal behavior was preserved rather than rewritten.
- No Firebase, authorization, Firestore or Cloud Functions logic was changed during this styling migration.

**Admin verification checklist:** test all 17 shell routes, the standalone Messages screen and lowercase Settings redirect; test the mobile drawer, Escape/overlay close, profile dropdown, all modal types, responsive tables, certificate/withdrawal screens and dynamic progress bars. Browser and Firebase verification remain outstanding; source migration is not production sign-off.
