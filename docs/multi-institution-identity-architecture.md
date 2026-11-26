# Multi-Institution Identity and Access Architecture

Status: approved target architecture; design committed, implementation not yet enabled.

## Decision

Spark Stack Academy will use one global identity per person, with multiple independently controlled institution memberships.

- Firebase Authentication identifies the person by UID.
- users/{uid} is the global profile and is not proof of membership in any institution.
- Each institution membership is a separate authorization grant with its own institution-scoped role, status and metadata.
- An account may have zero, one or many active institution memberships and may also use the independent Academy marketplace.
- Institution membership never grants access to another institution.
- A user may switch between institutions without creating another Firebase Auth account.

This is a multi-tenant application architecture, not separate Firebase projects or duplicate user accounts.

## Identity, membership and tenant context

### Global identity

Path: users/{uid}

Contains identity/profile attributes only, for example:

- uid
- fullName
- email
- photoURL
- globalStatus (where introduced; migration must preserve existing status semantics until complete)
- createdAt
- updatedAt

Do not store a single institution as the user's authoritative institution. Existing institutionId and institutionRole fields are legacy compatibility fields and must not be used as the long-term multi-membership model.

Global platform roles (Founder, Admin, Finance, and independent Instructor) remain distinct from institution-scoped roles. A person can be an instructor globally and a student or staff member in a specific institution only where policy explicitly permits it. Role precedence and privileged-account conflicts must be resolved by server policy, not client-side role selection.

### Canonical institution membership

Path: institutions/{institutionId}/members/{uid}

Suggested fields:

- uid
- institutionId
- institutionCode (display/routing metadata; never an authorization secret)
- memberType: student, instructor, institution_admin, institution_owner, or approved staff type
- role: institution-scoped permission role
- status: invited, pending_verification, active, suspended, revoked
- verified
- admissionNumber or staffNumber (institution-scoped identifier; protect from public exposure)
- departmentId, programmeId, cohortId where relevant
- permissions only for explicitly supported scoped grants; avoid arbitrary client-defined permission maps
- createdAt, activatedAt, updatedAt, revokedAt
- provisionedBy and audit metadata

The institution-scoped member document is the canonical authorization record. It is created, activated, changed, suspended and revoked only by trusted provisioning workflows. Clients cannot self-assign institution IDs, roles, approval flags or membership status.

### Membership discovery index

If the product needs a fast account switcher, maintain a minimal server-written index at:

users/{uid}/institutionMemberships/{institutionId}

This index is for listing available institution environments, not for granting access. It contains only institution ID, display name/code, member type, status and updated timestamp. Every sensitive read/write must independently validate the canonical institutions/{institutionId}/members/{uid} record. Both records must be written atomically by trusted backend workflows and reconciled if one is missing.

Do not introduce the index until the account-switcher query and security rules are tested. A collection-group query over institution members is an alternative if it meets Firestore query and rules constraints.

## Login and institution routing

Support three entry methods using the same Firebase Auth identity:

1. General Academy sign-in: authenticate once, then show the user's available destinations (personal Academy and active institution memberships).
2. Institution-branded entry: an institution slug/code or custom domain identifies the requested tenant before sign-in. After authentication, the server/database must verify an active membership for that exact institution before opening its portal.
3. Future institutional SSO: support OpenID Connect or SAML federation through a trusted identity broker/backend. SSO assertions must map to an existing or verified global identity and a separately approved membership.

Institution codes, URL slugs, email domains, admission numbers and hidden links are routing/discovery aids only. None is proof of authorization. Never create a membership merely because someone knows an institution code or uses an email address with its domain.

After sign-in, the user chooses an institution only from active memberships. The selected tenant is application navigation context, not a security credential. Every Firestore query, callable function and protected page must verify membership on the server/rules side.

The active institution context must not be trusted from query parameters, local storage, a browser-supplied institution ID or a client-writable user profile field. Client state may remember the last selected institution for convenience, but authorization must be re-evaluated on every protected operation.

## Student and staff provisioning

Initial institution-controlled onboarding:

1. Institution owner/admin imports or creates an admission/staff invitation using a trusted backend workflow.
2. The invitation is tied to one institution and a verified institutional record (admission number, staff number, verified email or approved external SIS reference).
3. The user signs in or creates one global Firebase Auth identity.
4. The trusted workflow binds that identity to the invitation and creates the institution membership.
5. Membership becomes active only after required verification/approval.
6. Suspension, graduation, transfer or departure changes that membership only; it does not delete the global identity or other memberships.

Prevent duplicate memberships for the same person/institution. Define a verified account-linking and recovery process for students who already have a personal Academy account. Do not merge accounts based only on matching names or unverified email addresses.

## Tenant isolation and authorization

Firestore Rules and trusted backend services must enforce tenant isolation. UI filtering is not a security boundary.

For each institution-scoped document:
- Store an immutable institutionId (or derive tenant from a protected parent path).
- Permit access only when the signed-in UID has an active canonical membership for that exact institution and the membership role permits the action.
- Validate both source and destination tenant IDs on moves, assignments, enrollment and relationship writes.
- Deny client writes to membership, role, verification, ownership, billing and institution approval records.
- Ensure collection queries are constrained so every returned document satisfies the same tenant predicate.
- Protect nested lessons, assessments, submissions, grades, attendance, certificates, discussions, files and reports—not just the course catalogue.
- Use trusted server-side authorization for cross-tenant operations, bulk imports, account linking and administrative overrides.
- Record sensitive membership changes and cross-tenant administrative access in immutable audit events.

Platform Founder/Admin access remains governed by existing privileged policy and audit requirements. Institution owners/admins are not platform admins and cannot access another institution.

## Course access interaction

Course ownership, visibility and learner entitlement are separate dimensions.

- Institution-private course: available only to active members of the owning institution who meet course assignment/enrollment policy.
- Public Academy marketplace course: visible in the shared catalogue; lesson access requires the applicable enrollment, purchase or other entitlement.
- Restricted/shared course: visible/accessibile only to explicitly authorized institutions or users.
- An institution course becomes public only after its owner authorizes public distribution and Academy moderation approves publication.
- An instructor may publish independently owned work separately from an institution catalogue, provided ownership and distribution rights are confirmed.
- Student access to external public courses follows the institution's configured policy (open, approval required, or restricted) plus the course entitlement rules.

A marketplace listing is not itself permission to read course lessons. Entitlements must be checked against the course and user; institution memberships alone do not grant paid-course access.

## Migration and compatibility

The current production rules use a single users/{uid}.institutionId field and existing institutions/{institutionId}/members/{uid} documents. Do not remove or reinterpret those fields in one step.

Migration stages:

1. Inventory existing institution member documents, legacy user fields, institution owners, team accounts, institution courses and all institution-scoped collections.
2. Define canonical membership fields and validate existing documents; produce a dry-run report of missing, duplicate or conflicting memberships.
3. Backfill canonical membership documents for existing approved institution users using trusted tooling. Preserve existing institution IDs and role/status semantics; do not infer membership from email domain or user-entered profile data.
4. Add membership-aware helper functions and rules in a reviewed rules change. During a limited compatibility period, allow legacy fallback only for verified records that have been explicitly reconciled.
5. Test positive and negative access cases with the Firebase Emulator Suite, including cross-institution reads, writes, queries, nested content and revoked memberships.
6. Deploy rules only after tests pass and a rollback copy is retained.
7. Update sign-in, account switcher and portals to resolve membership lists and require explicit tenant context.
8. Remove legacy single-institution authorization only after all records and pages have migrated and production telemetry confirms no remaining dependency.

Do not modify production Firestore rules or live user documents as part of the architecture-only stage.

## Phased delivery

### Phase A — Design and inventory
- Record the identity/membership model and migration plan.
- Inventory existing login redirects, user profile fields, institution member documents, callable functions and all tenant-scoped collections.
- Identify every page that assumes one institutionId.

### Phase B — Membership backend
- Provision/invitation and account-linking callables.
- Canonical membership lifecycle and audit events.
- Account membership index, if justified.
- Emulator tests and security rules migration.

### Phase C — Login gateway and account switcher
- General login with available destinations.
- Institution-branded routing with membership verification.
- Active institution selector and safe context switching.
- Session revalidation when membership is suspended or revoked.

### Phase D — Portal tenant context
- Student, Instructor and Institution portals become membership-aware.
- Course, assignment, assessment, grade, messaging and report queries are institution-scoped.
- Keep Admin and Founder cross-tenant tools separately privileged and audited.

### Phase E — Federation and scale
- Institution custom domains and branding.
- OpenID Connect/SAML SSO integrations.
- SIS import/export and roster synchronization.
- Multi-country identity, privacy and retention policies.

## Platform constraints and release gates

- Firebase project is currently on the Spark/free plan. Do not assume callable Cloud Functions or trusted provisioning can be deployed until billing plan and deployment capability are confirmed.
- Do not implement secure membership creation using unrestricted client-side Firestore writes.
- Do not enable institutional login routing until server/rules enforcement and emulator isolation tests are complete.
- GitHub Pages is static hosting; hiding portal links or adding a client-side institution code is not sufficient security.
- This document defines the approved target architecture. It does not claim that multi-institution identity, login routing, membership provisioning or new rules are implemented or deployed.


---

## Confirmed product decisions — institution hybrid identity, dual enrolment, shared marketplace

These decisions refine the target architecture above and are the product contract for subsequent implementation.

### 1. Hybrid institution identity

An institution is a first-class organisation identity, while every human who operates or studies within it retains one personal Academy identity.

**Organisation identity**
- `institutions/{institutionId}` is the authoritative organisation record.
- It owns the institution's legal/display identity, verified contacts, branding, status, subscription, limits, usage counters, policies and marketplace distribution settings.
- It may exist in a restricted provisional state before verification.
- Its stable ID is not a user UID, admission number, email address, URL slug or institution code.
- The institution may have multiple owners/admins over time. Ownership transfer is a trusted, audited operation.

**Human identity**
- `users/{uid}` represents a person and their Academy-wide profile.
- Firebase Authentication UID remains the stable identity key.
- A human may belong to several institutions and may also enrol in independent Academy courses.
- Institution-specific role, student number, staff number, programme and permissions live only in that institution's membership record.
- A person does not create a second Firebase Auth account to join another institution.

**Link between them**
- `institutions/{institutionId}/members/{uid}` is the canonical relationship and authorization grant.
- Owner, administrator, instructor and student are institution-scoped membership types/roles, not global account roles.
- Institution registration creates a provisional organisation and pending owner membership through trusted backend provisioning. Verification and approval activate the organisation and owner membership according to the institution's payment policy.
- Institution codes, branded URLs, email domains and invitation links help locate the organisation; none grants access by itself.

This is the hybrid: separate organisation identity plus shared human identities linked through explicit memberships.

### 2. Student enrolment: both institution-managed and independent

Spark Stack Academy supports two enrolment channels that converge on the same global student identity and learning entitlement model.

**Institution-managed enrolment**
1. An authorised institution manager imports a roster, creates an invitation, or approves an admission.
2. A trusted backend validates the institution, the manager's role, the roster/invitation and duplicate membership constraints.
3. The learner signs in or creates a global Academy account.
4. The backend links that UID to the institution and creates a pending or active institution membership.
5. The institution may assign institution-owned courses and define programme/cohort requirements.
6. The learner sees institution courses in their institution learning space. Institution membership alone does not grant paid marketplace course access unless the institution has issued a valid course entitlement.

**Independent Academy enrolment**
1. A learner browses the shared Academy marketplace using their global Academy account.
2. A free course may be self-enrolled only when the course is published, approved, explicitly free and its rules permit open enrolment.
3. A paid course requires a verified payment/entitlement created by a trusted backend.
4. The learner can take the course without joining an institution.
5. If the learner already belongs to one or more institutions, the independent enrolment remains attached to the same UID and does not silently add the course to an institution roster.

**Unified entitlement**
- A canonical enrolment/entitlement identifies the learner UID, course ID, source channel, payment/entitlement state and, when relevant, institution ID.
- Suggested source values: `institution_assignment`, `institution_sponsored`, `academy_free`, `academy_purchase`, `scholarship`.
- The backend must distinguish who pays, who owns the course, who receives settlement and who is entitled to learn.
- A learner can have more than one entitlement source only where duplicate enrolment policy allows it. Do not create duplicate progress records for the same learner/course.
- Progress, grades, certificates and completion belong to the learner/course relationship; institution reporting may read them only through an authorised tenant relationship and policy.
- Revoking an institution membership must not delete the person's global account or automatically revoke a separately purchased independent Academy entitlement. Institution-sponsored access may be revoked according to the sponsor's agreement.

### 3. Shared course marketplace

The Academy marketplace is one shared catalogue, not a separate marketplace per institution.

**Catalogue**
- Independent instructors and verified institutions can submit courses to one shared marketplace.
- A listing records its source owner/type, canonical course ID, distribution rights, price/currency, visibility, moderation state and settlement policy.
- Institution courses may remain institution-private, be shared with selected audiences, or be submitted for public Academy distribution.
- Public visibility requires owner authorization and Academy moderation approval.
- Institution-private course metadata and learning content must not leak into public catalogue queries.
- A public listing is a discovery and purchase surface, not lesson access permission.

**Ownership and commercial controls**
- Course ownership remains with the creator/institution as recorded by trusted provisioning; publishing to the marketplace does not transfer ownership.
- Institution admins cannot claim another institution's course or change the payout destination.
- Price, discounts, revenue share, commission, tax treatment and settlement destination are controlled by trusted server policy and immutable purchase snapshots.
- The institution's merchant settlement configuration is distinct from the learner's entitlement.
- A course may be purchased by a learner outside its owning institution if the owner has authorised public distribution.
- A course can be visible in the shared marketplace while institution reporting remains tenant-scoped.

**Content access**
- Public catalogue: readable by unauthenticated or authenticated visitors according to catalogue policy.
- Preview lessons: readable only when explicitly marked as preview and the course is published/approved.
- Full lessons: require a valid learner entitlement or explicit institution assignment.
- Institution-only content: requires active membership in the owning institution plus any course-specific assignment/enrolment rule.
- Cross-institution access is denied unless a specific shared distribution grant or learner entitlement exists.

### 4. Canonical data ownership

| Data | Canonical location | Who provisions/changes it |
|---|---|---|
| Person identity/profile | `users/{uid}` | User for safe profile fields; trusted backend for account state/roles |
| Organisation | `institutions/{institutionId}` | Trusted institution workflow / authorised platform staff |
| Membership | `institutions/{institutionId}/members/{uid}` | Trusted backend only |
| Membership discovery index | `users/{uid}/institutionMemberships/{institutionId}` (optional) | Trusted backend only |
| Institution application | `institutionApplications/{applicationId}` | Trusted application callable; reviewer workflow |
| Course | `courses/{courseId}` | Instructor/institution workflow under ownership and review rules |
| Shared listing | `marketplaceItems/{itemId}` | Trusted publication workflow |
| Learner entitlement | `enrollments/{uid}_{courseId}` or a future canonical entitlement collection | Trusted purchase/sponsorship workflow; narrowly scoped free-enrolment rule |
| Learning progress | Existing canonical progress/submission records keyed by UID and course | Learner/instructor/backend under field-level restrictions |
| Payment and settlement | Server-owned payment/ledger collections | Trusted payment functions only |
| Audit event | Append-only audit collection | Trusted backend only |

### 5. Required state transitions

**Institution:** `application_submitted → pending_review → approved_awaiting_payment → active`, or `rejected`. If payment is not required before activation, approval may transition directly to `active` with an outstanding onboarding invoice tracked separately. A provisional workspace is restricted and never treated as an active tenant.

**Membership:** `invited → pending_verification → active → suspended/revoked`. Reinstatement and role changes require trusted authorization and audit events. A pending membership grants only the minimum self-read needed to show application status.

**Course publication:** `draft → submitted → under_review → approved/published`, or `rejected/withdrawn`. Publication status cannot be self-awarded by an untrusted browser client.

**Enrolment:** `requested/pending_payment → active → completed`, or `cancelled/revoked/refunded`. Payment confirmation is server-verified; client-supplied `paid` status is never authoritative.

### 6. Security and release gates

- Firestore rules protect direct database access; callable functions re-check UID, canonical membership, tenant status, course ownership and operation-specific permission.
- No client may create institution memberships, approve applications, assign owner/admin roles, mark payments paid, publish a course as approved, or create paid entitlements.
- Every institution-scoped query must be constrained by institution ID and tested against a second tenant.
- Test nested course modules/lessons, assignments, submissions, grades, files, certificates, messages and reports—not only institution root documents.
- Storage rules must independently enforce the same tenant membership and path ownership.
- The current single-`institutionId` profile fields are migration compatibility only. They are not the target multi-institution model.
- The implementation branch currently adds provisional owner provisioning, canonical membership checks, a restricted applicant view and a limited emulator test suite. It does **not** yet implement full multi-institution switching, student roster/invitation enrolment, the unified entitlement service, marketplace seller onboarding or all nested tenant-aware queries.
- No production Firestore rules, Functions or Storage rules are deployed by a GitHub merge. Each Firebase deployment is a separate release action after emulator tests and environment review.
