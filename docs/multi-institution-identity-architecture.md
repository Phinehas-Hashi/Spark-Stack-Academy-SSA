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
