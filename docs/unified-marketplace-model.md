# Unified Marketplace and Institution Course Management

Status: modernization branch implementation, not production-enabled.

## Architecture

The Academy uses one marketplace collection, `marketplaceItems/{itemId}`, for public catalogue listings. Course learning content remains in the existing `courses/{courseId}` collection. A marketplace course item stores a source reference to the course instead of duplicating modules, lessons, quizzes, assignments or enrolment history.

Current course listing IDs use `course_{courseId}`. A trusted Firestore trigger mirrors a course into the marketplace when it is published and removes the listing when it is unpublished, archived, soft-deleted or routed back to review.

Marketplace item fields:
- `itemId`, `productType`, `title`, `description`, `category`
- `sourceCollection`, `sourceId` (for linked content)
- `ownerType`, `instructorId`, `institutionId`
- `price`, `currency`
- `status`, `published`, `updatedAt`, `createdAt`

Marketplace product types:
- `course`
- `mentorship`
- `professional_service`
- `course_bundle`
- `bootcamp`
- `digital_product`
- `addon`
- `corporate_training`
- `institution_onboarding`
- `institution_monthly`
- `institution_annual`
- `student_membership_monthly`
- `student_membership_annual`

The first live listing integration is for approved courses. Other product types are represented in the central price book and Student Marketplace filters, but their seller workflows, fulfilment, checkout, recurring billing, refunds and settlement integrations remain future work.

## Proposed starting prices

The Founder price book supports independently configured KES, USD, EUR and GBP amounts for every product family. Prices are not automatically converted from a base currency; this avoids using stale or misleading exchange rates. Blank currency amounts are unavailable in that currency. All price types default to disabled. Saving creates an immutable version and audit record; it does not enable checkout or change existing transactions.

| Product | Proposed price | Unit |
|---|---:|---|
| Individual course | KSh 2,500 | per course |
| Mentorship | KSh 1,500 | per session |
| Professional services | KSh 5,000 | starting price |
| Course bundle | KSh 5,500 | per bundle |
| Boot camp | KSh 7,500 | per learner / cohort |
| Digital product | KSh 500 | per item |
| Platform add-on | KSh 300 | per add-on / month |
| Corporate training | KSh 75,000 | starting price per cohort |
| Institution onboarding | KSh 15,000 | one-time per institution |
| Institution subscription | KSh 7,500 | per institution / month |
| Institution subscription | KSh 75,000 | per institution / year |
| Student membership | KSh 499 | per student / month |
| Student membership | KSh 4,999 | per student / year |
| Institution transaction fee | 2% | optional; disabled |

The central marketplace price book stores independent local-currency prices in KES, USD, EUR and GBP. Country-specific overrides, tax/VAT treatment, and automated exchange-rate feeds remain future work. The price book is currently separate from the existing Daraja institution onboarding pricing configuration. Before charging institutions, the two settings must be reconciled so there is only one authoritative price source for the payment workflow.

The 25% Academy / 75% instructor course revenue split remains the approved instructor policy. Institution direct settlement remains separate. No new commission rates for mentorship, services, bundles, boot camps, digital products, add-ons or corporate training have been approved.

## Institution course workflow

1. Active, verified institution owner or administrator creates a draft through `createInstitutionCourse`.
2. The callable validates the institution, course fields, optional instructor assignment and institution course quota.
3. The institution course counter is incremented transactionally.
4. The institution submits the draft through `submitInstitutionCourseForReview`.
5. The course enters `pending_review`, is hidden from the marketplace and is available to the Admin moderation queue.
6. Admin reviews and approves by publishing, or rejects/returns the course for correction.
7. A published course is mirrored to `marketplaceItems` by the trusted Firestore trigger.

The institution quota configured by the current onboarding workflow is 100 courses. This implementation uses the institution's stored usage counter; verify/backfill the counter against existing course documents before enabling the workflow for institutions with pre-existing courses.

## Founder course moderation

Founder actions:
- **Send to Admin for review:** changes the course to `pending_review`, hides it from the marketplace and records the routing audit event.
- **Delete course:** uses a soft-delete status (`deleted`) rather than physically deleting the source record. This preserves enrolments, certificates and financial history while removing the marketplace listing.

Founder no longer has a direct publish/unpublish action in the course table. Admin remains responsible for review and publication.

## Security and release notes

- Marketplace catalogue records are server-written; clients have read-only access to published items.
- Institution course creation and review submission use trusted callable Cloud Functions.
- Founder moderation and price book changes use trusted callable Cloud Functions and audit logs.
- Firestore rules allow institution members to read only their institution's courses.
- No Firebase functions or Firestore rules have been deployed by this change.
- No live Daraja payment or marketplace checkout has been tested.
- The Student Marketplace is a catalogue view. Checkout and fulfilment for non-course products are not yet implemented.
- All work is on the `modernization` branch. Production `main` and the GitHub Pages deployment remain untouched.
