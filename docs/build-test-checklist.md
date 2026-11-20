# Spark Stack Academy — Build Verification Checklist

This checklist is the working test record for the modernization branch. Tests must be run against an isolated development Firebase project. Never point test traffic at production collections or live Daraja credentials.

## Release boundaries

- Branch under test: `modernization`.
- Production branch: `main` — do not merge or deploy during development without explicit approval.
- Founder is the platform Super Admin. The trusted `requireFounder` authorization gate requires a signed-in Founder record with role `founder`, active status, and no explicit inactive/unverified flag.
- A green GitHub syntax workflow is not a substitute for Firebase Emulator, security-rule, browser, payment or end-to-end testing.

## Test cycle for each build

1. Run GitHub Actions syntax checks.
2. Deploy Functions and Firestore rules to the isolated development Firebase project only, after confirming the selected Firebase project.
3. Run Firebase Emulator tests for callable authorization and Firestore rules where supported.
4. Test each portal in a browser at desktop and mobile widths.
5. Inspect Firestore documents and Cloud Functions logs after each write operation.
6. Record pass/fail, evidence and defects before starting the next feature.
7. Re-test affected workflows after each fix.

## Marketplace product management

| ID | Test | Expected result |
|---|---|---|
| MP-01 | Founder/Super Admin opens Product Management | Product list loads through trusted callable |
| MP-02 | Non-Founder calls getMarketplaceProducts | Permission denied |
| MP-03 | Non-Founder calls saveMarketplaceProduct | Permission denied |
| MP-04 | Save a valid product as draft | Record saved; not visible in Student Marketplace |
| MP-05 | Save with invalid type, title, description, currency or price | Callable rejects request |
| MP-06 | Publish while product type price is disabled | Callable rejects request |
| MP-07 | Enable product family in Founder price book, then publish | Listing becomes visible in public marketplace |
| MP-08 | Edit a managed product | Existing record updated; audit event created |
| MP-09 | Archive a product | Record retained; public listing disappears |
| MP-10 | Attempt to edit/archive a course mirror as a product | Callable rejects operation |
| MP-11 | Student opens Marketplace | Only published marketplace items are listed |
| MP-12 | Student attempts to purchase a non-course product | No checkout action is offered; checkout remains disabled |

## Course review and marketplace integration

| ID | Test | Expected result |
|---|---|---|
| CR-01 | Instructor submits draft | Course enters pending_review and stays hidden |
| CR-02 | Institution submits draft | Course enters pending_review and stays hidden |
| CR-03 | Founder requests Admin review | Course is routed to Admin; no direct publication |
| CR-04 | Founder soft-deletes a course | Course is hidden; enrolment and financial history remain |
| CR-05 | Admin approves course | Course is published and mirrored to marketplace |
| CR-06 | Admin rejects/returns course | Course is not visible in marketplace |
| CR-07 | Published course becomes unpublished/deleted | Marketplace mirror is removed |
| CR-08 | Existing course without explicit approved review status | Must not become newly visible from the sync trigger |

## Institution limits and access

- Verify 20 instructor, 100 course, 5,000 student and 10 administrator limits independently.
- Confirm the institution owner counts as one of the 10 administrator accounts.
- Confirm limits are enforced server-side, not only displayed in the UI.
- Verify that existing institution usage is reconciled before activating limits for existing tenants.
- Confirm an institution member cannot read another institution's records.

## Payment and financial safety

- Use Daraja sandbox only.
- Test successful, failed, cancelled, delayed and duplicate callbacks.
- Test amount, phone and receipt mismatches.
- Test retry rules and scheduled reconciliation.
- Confirm the approved onboarding fee and the institution billing configuration have one authoritative price source before enabling collection.
- Confirm instructor 75% / Academy 25% course split and institution direct settlement are not altered by product catalogue changes.
- Do not activate subscriptions, recurring charges, refunds or seller payouts until each workflow has separate tested ledger and idempotency controls.

## Current product-management implementation status

- Founder/Super Admin product create, edit, list and archive callables: implemented on modernization branch.
- Product editor and managed catalogue list: implemented on modernization branch.
- Draft/published catalogue status and price-book gate: implemented.
- Checkout and fulfilment: deliberately disabled.
- Firebase deployment and live Firestore testing: not yet performed.
- No production data has been changed.
