# Institution People Management

Status: implementation proposal reflected by PR #39; not production deployed.

## Scope

The Institution Portal has a tenant-scoped People & Access directory. It manages the institution membership relationship, not the person's global Academy identity. All access checks are based on:

`institutions/{institutionId}/members/{uid}`

The institution ID supplied by a browser is routing context only. Firestore rules and callable functions revalidate the signed-in UID against the canonical membership record for the requested institution.

## Institution roles and permissions

| Institution role | View member directory | Add ordinary members | Change/suspend/revoke members | Appoint leadership | Institution finance |
|---|---:|---:|---:|---:|---:|
| Owner | Yes | Yes | Yes, except owner/self | Yes | Yes |
| Administrator | Yes | Yes | Yes, except owner and other leadership | No | Yes |
| Moderator | Yes | No | No | No | No |
| Department manager | Yes | No | No | No | No |
| Instructor | No | No | No | No | No |
| Other staff | No | No | No | No | No |
| Student | Own membership only | No | No | No | No |

A moderator's directory access is read-only. Department managers can use the institution course-management permission already defined by the course workflow, but do not receive finance access. Platform-wide Founder/Admin roles remain separate from institution roles.

## Member categories

Supported membership roles:
- `institution_owner`
- `institution_admin`
- `institution_moderator`
- `department_manager`
- `institution_staff`
- `instructor`
- `student`

The global `users/{uid}` profile retains the existing portal-routing role during this migration. It is not the source of institution authorization. Institution role and status are authoritative only in the canonical membership record.

## Counts and capacity

The directory displays:
- Total membership records, including suspended and revoked records.
- Active students.
- Active instructors.
- Active owners and administrators.
- Active moderators.
- Active department managers and other staff.

The current institution plan capacity buckets are:
- `students`: student memberships.
- `instructors`: instructor memberships.
- `adminAccounts`: owner, administrators, moderators, department managers and other staff.

Current approved default capacity values in institution approval are 5,000 students, 20 instructors and 10 administrative/staff seats including the owner. These values are read from the institution's server-managed `limits` object; browser values are never trusted.

## Member lifecycle

- New account: a trusted callable creates the Firebase Auth identity, global profile and institution membership. Student accounts also receive the `students/{uid}` portal profile.
- Role change: only supported non-owner roles may be assigned. Leadership role assignments are owner-only.
- Suspend: sets the institution membership status to `suspended`; the global Firebase Auth account remains enabled.
- Reactivate: restores an eligible membership to `active`, subject to capacity.
- Revoke: marks the membership `revoked`; the person's global Academy account and other institution memberships are not deleted.

Membership changes are recorded in `audit_logs`. Direct browser writes to canonical membership documents remain denied.

## Account creation and linking

This first iteration creates new accounts using a temporary password of at least 12 characters. The institution manager must deliver that password securely and require the member to change it.

If the email already belongs to an Academy Auth account, creation is rejected. Existing-account linking, email-delivered invitations, one-time invitation acceptance, roster CSV import, bulk admissions and identity recovery require a separate trusted workflow. Never link an account solely because a user-entered email or name matches.

## Current implementation boundaries

- The institution portal currently uses the existing profile's `institutionId` as a default routing hint. Canonical membership is rechecked for access. A full multi-institution account switcher is not part of this change.
- Institution-managed student membership is created here, but bulk admissions, course assignment, programme/cohort management, attendance, grades, certificates and institution-wide student reporting are separate follow-up modules.
- The role UI is permission-aware, but backend callables remain the enforcement boundary.
- Cloud Functions deployment may require Firebase Blaze billing. No production Firebase rules or functions are deployed by merging this code.
