# SSA Security Edge Worker

This Worker is an optional edge collector for Academy security telemetry. It stores client-reported security signals and edge-observed rate-limit events in Cloudflare D1. It does not replace Firebase Authentication, Firestore rules, Storage rules, Firebase App Check, or Google Cloud audit logging.

## What it captures

- Server receipt timestamp (UTC).
- Request IP and Cloudflare country/region/city estimates.
- User agent and requested portal/path.
- Firebase UID/email when a valid Firebase ID token is supplied.
- Whether an event was client-reported or observed by the Worker itself.

Unauthenticated events are limited to login/MFA failures. The Worker rate-limits event ingestion by source IP and retains records for 30 days.

## Setup

1. Create a Cloudflare D1 database named `ssa-security-events`.
2. Run `schema.sql` against that database.
3. Put the database ID into `wrangler.toml`.
4. Set `FIREBASE_PROJECT_ID=spark-stack-academy`.
5. Set `ALLOWED_ORIGINS` to the exact deployed Academy origins (comma-separated). Add the production custom domain only if one is configured.
6. Deploy with Wrangler from this directory: `npx wrangler deploy`.
7. Confirm `GET /health` returns `{"status":"ok","service":"ssa-security-edge"}`.
8. Set `window.SSA_SECURITY_API_BASE` in the shared app configuration to the deployed Worker origin.

## Important limitations

- This endpoint receives only signals explicitly sent to it. It cannot see every direct Firebase request or every Firestore/Storage rules denial.
- Enable Google Cloud Audit Logs / Identity Platform monitoring for authoritative backend activity. Enable Firebase App Check for supported web clients.
- Client-reported events are evidence of a browser signal, not proof that a person performed the action. A valid Firebase token ties an event to an account; an unauthenticated event remains unattributed.
- IP geolocation is approximate and may identify a VPN, proxy, mobile carrier gateway or corporate network rather than a person's physical location.
- D1 is private to the Worker binding. Incident reads require a Firebase ID token and a live Firestore Founder profile with role=founder and status=active.
- Do not put service-account credentials, private API keys or encryption secrets in frontend files.
- This Worker has not been deployed or penetration-tested from this repository branch.
