# Student Portal CSS architecture

## Canonical stylesheet order

For standard Student Portal pages, load styles in this order:

1. `../../css/design-tokens.css` — shared design tokens only.
2. `student-core.css` — document reset and foundational defaults.
3. `components.css` — Student Portal sidebar, topbar and shared UI components.
4. `responsive.css` — responsive primitives only; no page-specific layout.
5. `portal-shell.css` — sidebar/main-column/topbar geometry and mobile shell behavior.
6. One page-owned stylesheet from `pages/<page>.css` — loaded last.

Load the page stylesheet last so scoped page rules have predictable precedence. Do not add `student-theme.css` to new pages; it is a legacy stylesheet and must remain untouched until its dependencies have been audited.

## Ownership rules

- `design-tokens.css` owns design values, not component selectors.
- `student-core.css` owns the reset and document-level defaults only.
- `components.css` owns reusable Student Portal navigation and topbar components. Keep selectors scoped to their component roots.
- `responsive.css` owns small shared responsive primitives, not portal geometry or page styling.
- `portal-shell.css` owns `.student-layout`, sidebar/container geometry, topbar placement, and mobile navigation shell behavior.
- `pages/*.css` owns the page's content layout and visual details. Scope every selector to that page's root class.
- Do not use broad selectors such as `.card`, `.header`, `.modal`, or `.button` in page styles without a page-root prefix.
- Do not use global element selectors in page styles when a page-scoped selector can be used.
- Avoid `!important` as an override mechanism. Resolve ownership and specificity instead.
- Keep standalone experiences (certificate print view, maintenance page, and other intentionally independent screens) independent when they do not use the standard portal shell.
- Preserve existing HTML IDs, data attributes, event hooks, and JavaScript behavior during visual migrations.

## Legacy stylesheet policy

Old page stylesheets and `student-theme.css` are retained until all HTML, JavaScript-created links, imports, and component dependencies have been checked. Delete a legacy file only after its references are proven absent and the replacement has been checked at desktop and mobile widths.

## Verification checklist

- Exactly one shared reset and one portal shell are loaded per standard page.
- The page-owned stylesheet is loaded after the shared shell.
- Every page selector is rooted under the page's unique wrapper class.
- No duplicate selector blocks remain unless a documented state or media override requires them.
- Modals and drawers use a shared overlay/layering contract.
- Desktop, tablet, and narrow mobile layouts are checked.
- Interactive controls, keyboard focus, loading, empty, error, and disabled states remain usable.
