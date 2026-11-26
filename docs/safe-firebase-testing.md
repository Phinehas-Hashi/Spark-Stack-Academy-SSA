# Safe Firebase Testing Plan

## Project decision

The production Firebase project is `spark-stack-academy-ssa`. The repository's `.firebaserc` maps the default alias to this project.

## Mandatory safety rule

Do not run `firebase deploy`, `firebase deploy --only firestore:rules`, or deploy Cloud Functions to the existing project as part of routine development testing. Firestore and Storage rules apply project-wide, and deployed Functions can affect real workflows.

Do not use real student, instructor, institution, or finance accounts for test scenarios. Do not use live M-Pesa credentials or trigger real payment prompts during tests.

## Local emulator environment

The repository's `firebase.json` configures local emulators:

- Authentication: `127.0.0.1:9099`
- Functions: `127.0.0.1:5001`
- Firestore: `127.0.0.1:8080`
- Storage: `127.0.0.1:9199`
- Emulator UI: `127.0.0.1:4000`

The emulator uses the isolated demo project ID `demo-spark-stack-academy-ssa-tests` locally; it does not connect to or modify the live project.

## Start local emulators

Install Node.js 20 or later, Firebase CLI, and the repository dependencies. From the repository root:

```bash
npm install --prefix functions
firebase emulators:start --project demo-spark-stack-academy-ssa-tests
```

If the Firebase CLI is not installed:

```bash
npm install -g firebase-tools
firebase login
```

The emulator UI is available at `http://127.0.0.1:4000` on the same machine or development environment.

## Application configuration requirement

A local app build must explicitly connect Firebase Auth, Firestore, Functions, and Storage SDKs to the emulator endpoints before testing. Do not assume that setting the project ID alone activates emulators. Keep emulator connection logic behind a development-only environment flag and ensure production builds cannot accidentally point at localhost.

## Test accounts and data

Create disposable emulator-only accounts for:
- Founder / Super Admin
- Admin reviewer
- Institution owner
- Institution admin
- Instructor
- Student

Use synthetic data and clearly label records as test data. Never import production user documents, credentials, payment records, or private files into the emulator.

## Test sequence

1. Authentication and role routing.
2. Founder / Super Admin authorization and denial of privileged actions to other roles.
3. Institution application, review, approval, rejection, and trial timing.
4. Institution team limits: 20 instructors and 10 admin accounts including the owner.
5. Institution course limit: 100 courses.
6. Institution student limit: 5,000 students.
7. Course submission, Admin review, Founder moderation, archive/soft-delete and marketplace publication.
8. Marketplace item creation, pricing, publication, visibility and archive.
9. Student catalogue browsing and enrolment using emulator-only data.
10. Financial ledger and checkout simulations using mocked payment provider responses only.
11. Firestore and Storage security rules, including cross-tenant access denial.
12. Offline, reconnect and duplicate-request/idempotency scenarios.

## Before any live deployment

A separate deployment review is required. It must include a backup/restore plan, rules diff review, Functions impact review, environment and secret verification, emulator test results, and explicit owner approval. Production deployment must be a deliberate release step, not part of routine testing.
