# Founder security rollout checklist

This branch adds the client-side MFA flow, strict Founder page gate, read-only historical audit view, and an optional Cloudflare D1 incident collector. The controls are not fully active until the external configuration below is completed.

## 1. Founder sign-in and identity checks

Founder sign-in does not require TOTP or another multi-factor challenge. After Firebase Authentication succeeds, the portal verifies the Founder document, role, active status and email-verification state. Firestore, Storage and privileged callable operations apply the same Founder authorization checks at their respective boundaries.

An authenticator already enrolled on a Firebase user is managed in Firebase Authentication / Identity Platform. Repository changes do not remove factors from live user records. Use a trusted Firebase Admin operation to remove a factor from a specific account only after verifying the account owner and intended UID.

## 2. Deploy the security edge collector

See `security-worker/README.md`.

1. Create the D1 database and run `security-worker/schema.sql`.
2. Set the D1 database ID in `security-worker/wrangler.toml`.
3. Set exact production origins in `ALLOWED_ORIGINS`.
4. Install dependencies and deploy with Wrangler from `security-worker/`.
5. Check the Worker's `/health` endpoint.
6. Copy the deployed Worker origin into `window.SSA_SECURITY_API_BASE` in `js/security-config.js`.
7. Redeploy the static site and verify a test login failure appears in Founder > Security / Command Center.

The collector labels browser-originated signals as `client_reported`. It cannot independently prove that the described browser action occurred. Edge rate-limit events are labelled `edge_observed`.

## 3. Firebase and Google Cloud protection

- Register the SSA web app with Firebase App Check and select an appropriate reCAPTCHA provider.
- Monitor App Check metrics before enforcing it; then enforce for Firestore and Storage where supported.
- Enable Cloud Audit Logs / Data Access logging for Firestore in Google Cloud Logging.
- Configure Identity Platform / Firebase Authentication monitoring and alerting for sign-in failures, account changes and MFA events.
- Review Firestore and Storage rules after every privileged workflow change.
- Keep all Admin SDK credentials and Worker secrets outside the repository and browser bundle.

Firebase App Check: https://firebase.google.com/docs/app-check/web/recaptcha-provider

## 4. Current boundaries

- The Worker sees only events sent to its endpoints. It does not automatically observe all direct Firebase SDK calls or every Firestore/Storage rules denial.
- IP geolocation is approximate. VPNs, proxies, mobile carrier gateways and corporate networks can make it misleading.
- The Worker stores source IPs and coarse location in private D1 for 30 days. Restrict Cloudflare account access accordingly and reflect this collection in the privacy notice.
- The browser cannot revoke all other Firebase sessions by itself. Global refresh-token revocation requires trusted server-side Admin SDK authority.
- File encryption is a separate next phase. Sensitive files should not be encrypted with a browser-only hard-coded key. We need to agree on key recovery and access model before implementing encrypted uploads.
- No live Firebase, Cloudflare or production penetration test has been run by this repository change.
