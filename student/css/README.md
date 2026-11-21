# Student Portal CSS ownership

Load styles in this order:

1. `../../css/design-tokens.css` — shared design values only.
2. `student-core.css` — reset and document defaults only.
3. `components.css` — reusable sidebar, topbar, buttons and shared components.
4. `responsive.css` — responsive utilities only; no portal geometry.
5. `student-theme.css` — Student Portal visual theme.
6. Page stylesheet(s) — styles owned by that page only.
7. `portal-shell.css` — Student Portal frame and column geometry.

## Ownership rules

- Do not define `.student-layout`, `.sidebar-container`, `.student-main` or topbar-container geometry in page styles.
- Do not use global element selectors in page CSS when a page-scoped selector can be used.
- Do not add another global brand stylesheet to Student pages. Use design tokens and student-theme.
- Keep standalone experiences (certificate print view, payment confirmation, maintenance page) independent when they intentionally use a separate layout.
- Retire old styles only after searching every HTML import and testing the replacement at mobile and desktop widths.

## Migration status

The shared Student shell, theme, base and responsive responsibilities have been separated. Student pages use the standard stylesheet order and cache-busted foundation references. The certificates list was migrated to the current shell containers so the shared sidebar and topbar loaders can mount correctly.
