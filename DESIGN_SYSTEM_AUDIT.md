# Spark Stack Academy — Design System Audit

**Status:** Preliminary repository-wide inventory and representative stylesheet review  
**Branch:** main  
**Audit baseline commit:** 118675013e0f8c39b748069bfe14092ef6666a23

## Repository inventory

The recursive Git tree reports 477 tracked files:
- 128 HTML files
- 152 CSS files
- 165 JavaScript files

| Portal | HTML | CSS | JavaScript |
|---|---:|---:|---:|
| Student | 33 | 62 | 48 |
| Instructor | 26 | 24 | 26 |
| Institution | 6 | 4 | 4 |
| Admin | 21 | 18 | 20 |
| Founder | 31 | 35 | 36 |

There are also nine root-level CSS files.

## Confirmed preliminary findings

1. **Stylesheet order is inconsistent.** Representative Founder pages place `founder-unified.css` before or after page styles inconsistently. Admin and Instructor pages also vary in the order of foundational and page-specific CSS.
2. **Global styling is not fully isolated.** The root `css/brand-system.css` contains global element selectors (including `html`, `body`, controls and links), an `@import`, and 51 `!important` declarations.
3. **Portal foundations differ.** Student, Instructor, Admin, Institution and Founder each have separate core/component stylesheets and different selector conventions.
4. **High override pressure exists in some portal foundations.** The sampled `founder-unified.css` contains 192 `!important` declarations; `institution.css` contains 44. These require rule-by-rule review before consolidation.
5. **Inline styling remains.** Sampled Admin pages include inline style attributes and at least one embedded style block.
6. **The Student portal has a more developed page-level stylesheet structure** (`student/css/pages/`), while the other portals largely use different stylesheet layouts.

## Important limitations

This is not yet a complete selector-by-selector or page-by-page audit. The file inventory is repository-wide, but the detailed HTML and CSS inspection so far is representative sampling. No existing stylesheet has been deleted or rewritten as part of this audit.

## Migration principles

- Preserve all existing HTML structure, JavaScript behavior, Firebase integration and route contracts unless a separately verified defect requires a change.
- Do not mass-delete legacy CSS.
- Define explicit ownership: global design tokens; portal shell; shared portal components; page-scoped styles.
- Use consistent stylesheet ordering: tokens/reset → portal core → portal shell/components → responsive primitives → page stylesheet.
- Scope page styles to a page root and portal styles to a portal root. Avoid unscoped global selectors in page stylesheets.
- Reduce `!important` only after tracing the cascade and confirming the replacement.
- Validate relative stylesheet paths, duplicate imports, inline styles, selector leakage, responsive rules and modal/drawer stacking.
- Migrate one portal at a time and retain a rollback point for each batch.

## Next audit steps

1. Complete HTML stylesheet-reference and inline-style inventory for all 128 pages.
2. Review all 152 CSS files for selector leakage, duplicate/conflicting declarations, imports, specificity and media-query overlap.
3. Map shared shell markup and JavaScript ownership for all five portals.
4. Produce a page-to-stylesheet dependency map and prioritised remediation plan.
5. Only then implement the unified architecture and migrate portal-by-portal.

## Expanded Student Portal dependency scan

All 33 Student Portal HTML pages were enumerated. A complete per-page stylesheet reference pass identified these exceptions to the common shell pattern:

- `student/progress.html`: no stylesheet references detected.
- `student/certificate-view.html`: only its standalone `certificate-view.css` is referenced.
- `student/portal-suspended.html`: only its page stylesheet is referenced.
- `student/premium-success.html`: uses core/components/page CSS but does not reference the shared design tokens, responsive stylesheet or portal shell.
- `student/chat.html`, `student/messages.html`, `student/new-chat.html`, and `student/help-center.html`: use some shared foundation styles but do not reference `portal-shell.css`; these need route/standalone classification before any shell is added.

Most regular Student Portal pages load this sequence:
`design-tokens → student-core → components → responsive → portal-shell → page stylesheet`.
This is consistent across the sampled regular pages, but it differs from the previously proposed canonical order (portal shell before responsive primitives). The correct order must be established by inspecting actual selector ownership and responsive overrides; do not reorder blindly.

Additional observations:
- Several Student pages retain inline style attributes, including course details, course player, learning progress, notifications and premium screens.
- The shared Student shell is present on most regular learning pages, but not every HTML route. The standalone/transactional pages need an explicit route classification.
- No CSS or HTML changes were made during this dependency scan.

## Prioritised findings for remediation

**P0 — establish source of truth:** agree canonical stylesheet order and selector ownership before further visual patching.

**P1 — route classification:** classify every HTML route as portal-shell page, standalone/auth/transactional page, or embedded component. Do not inject shell CSS indiscriminately.

**P1 — global cascade containment:** inspect root brand system imports and global selectors; replace accidental portal-wide reach with explicit design tokens and scoped component rules.

**P2 — inline-style review:** migrate static inline styles into page-scoped CSS where safe; preserve dynamic JS-set inline styles.

**P2 — regression verification:** test drawer, modal, topbar, page overflow and responsive layout at mobile, tablet and desktop widths.
