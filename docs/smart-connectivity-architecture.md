# Spark Stack Academy — Smart Connectivity Architecture

## 1. Purpose

Provide a shared, mobile-first connectivity layer across Student, Instructor, Institution, Admin and Founder portals. The platform must remain usable during intermittent connectivity without allowing offline activity to bypass authentication, permissions, financial controls or academic assessment rules.

## 2. Connectivity states

The shared engine exposes these states:

- `online`: browser reports connectivity and the application can reach its service health endpoint.
- `weak`: connectivity exists but measured requests are slow or repeatedly fail.
- `offline`: the browser reports offline or the service health check cannot be reached.
- `reconnecting`: connectivity has returned and the engine is validating the session and pending work.
- `syncing`: eligible queued records are being submitted.
- `sync-error`: one or more eligible records need retry or user attention.

The browser `navigator.onLine` value is only a signal, not proof that Firebase or the internet is reachable. The engine must combine browser events with a lightweight network health check and actual request outcomes.

## 3. Offline access policy

### Allowed offline

- Previously downloaded or cached course lessons and learning materials.
- Previously opened learning content that is safe to cache.
- Locally saved notes, bookmarks and learning drafts.
- Supported learning progress events that can be safely queued for later server validation.
- Non-sensitive portal shell assets and static help content.

### Online only

- Quizzes and assignments, including attempts and submissions.
- Payments, M-Pesa STK Push, refunds, withdrawals and wallet operations.
- Account creation, role changes, approvals, permission changes and MFA operations.
- Course publication, moderation and institution administration.
- Any operation that changes financial balances, entitlements or privileged access.

Offline mode must never imply that a protected action succeeded. Protected actions should show a clear online-required message and remain unsubmitted.

## 4. Shared architecture

One shared client runtime is consumed by all five portals:

1. Connectivity monitor — browser online/offline events, request health checks, latency and failure tracking.
2. Service Worker — versioned application-shell and static-asset caching, update lifecycle and offline fallback.
3. IndexedDB — user-scoped downloaded content metadata, local notes/drafts and eligible pending progress events.
4. Cache API — static shell assets and explicitly approved cacheable GET resources.
5. Sync manager — ordered retries, idempotency keys, backoff, session validation and conflict handling.
6. Portal UI — shared status indicator, weak-network banner, offline page, sync progress and data controls.

Firebase Authentication remains the identity provider. Firestore and Storage remain the platform data services. Server-side validation is authoritative for any queued write that affects trusted application state.

## 5. Data safety and synchronization

Every queued item must include a unique operation ID, authenticated UID, operation type, entity ID, payload version, creation time and retry metadata. Do not store passwords, ID tokens, refresh tokens, payment credentials or other secrets in the queue.

The sync manager must:

- Partition local records by authenticated UID.
- Never replay one user's queue under another user's session.
- Revalidate the current Firebase user before synchronization.
- Confirm the user still has permission for the target resource.
- Submit only explicitly allowlisted progress/draft operations.
- Use idempotency keys to prevent duplicate writes.
- Preserve local data until the server confirms acceptance.
- Detect stale versions and conflicts instead of silently overwriting newer server data.
- Apply bounded exponential backoff and expose retry failures to the user.
- Purge user-specific cached data and pending operations on sign-out, account switch or access revocation, subject to a clear export/recovery policy for unsynced user-created work.

A local queue is not a trusted ledger. Never queue financial, access-control, assessment or publication actions for later execution.

## 6. Storage and cache policy

- Cache the minimum content needed for an offline learning session.
- Cache only content the authenticated user is authorised to access.
- Do not cache privileged admin data, financial records, private messages or sensitive personal records by default.
- Include content version, owner/resource ID, download timestamp and expiry metadata.
- Provide storage usage, downloaded-item management and a clear-cache control.
- Use bounded cache sizes and remove expired or least-recently-used content.
- Treat Service Worker caches as shared by the browser origin; user-specific content must not be placed in a broad shared cache without a strict isolation strategy.

## 7. User experience

Shared UI elements:

- Persistent connectivity indicator.
- Weak-connection warning with data-saving guidance.
- Offline-mode banner and clear explanation of available features.
- Reconnecting and synchronisation progress.
- Sync completed and sync needs attention states.
- Offline library/download manager.
- Data usage and storage monitor.
- Online-only assessment notice.
- Settings for downloads, automatic downloads and data-saving behaviour.

Use the approved visual system: Deep Navy `#071B49`, Electric Blue `#0878F9`, white/ice-blue surfaces, green/amber/red connectivity states and purple accents for AI-related features. Design mobile-first and keep controls accessible.

## 8. Browser and hosting constraints

The current application is a static HTML/CSS/JavaScript application hosted on GitHub Pages under the repository path `/Spark-Stack-Academy-SSA/`. Service Worker registration, cache paths, manifest URLs and offline fallbacks must respect this subpath; root-absolute URLs can break on GitHub Pages.

Background Sync is an enhancement only and is not consistently supported. The application must also sync when the app is reopened or connectivity returns while the page is active.

The Firebase web SDK and current Firestore rules must be reviewed before enabling any offline write path. Do not enable broad Firestore offline writes as a substitute for the allowlisted sync protocol. Deploying Firebase Cloud Functions requires an eligible billing plan; until trusted server functions are deployed, do not claim that client-side checks provide server-grade validation for privileged operations.

## 9. Implementation sequence

1. Audit existing portal bootstraps, Firebase rules, asset paths and hosting base path.
2. Add shared connectivity monitor and status UI without changing business workflows.
3. Add root-scoped Service Worker and versioned static-shell caching.
4. Add IndexedDB storage and download manager for approved learning materials.
5. Add local notes/drafts and narrowly allowlisted progress queue.
6. Add authenticated, idempotent synchronization and conflict handling.
7. Add portal integration, storage controls and accessible offline screens.
8. Test on Android Chrome under online, slow, offline, reconnect, sign-out, account-switch and stale-session scenarios.
9. Expand only after security and data-integrity tests pass.

## 10. Acceptance criteria

- All five portals show the same accurate connectivity state.
- Cached shell and explicitly downloaded learning materials open offline.
- Quizzes and assignments remain inaccessible for attempts/submission offline.
- No payment, wallet, approval, role, publication or other privileged operation can be queued offline.
- Local work survives reloads and reconnects safely.
- A queued item is never synced as a different user.
- Duplicate retries do not duplicate accepted progress.
- Conflicts are visible and never silently overwrite newer server data.
- User-specific caches are isolated and are cleared appropriately on sign-out/account switch.
- The application works under the GitHub Pages repository subpath on Android Chrome.
