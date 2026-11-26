# Founder security rollout checklist

This branch adds the client-side MFA flow, strict Founder page gate, read-only historical audit view, and an optional Cloudflare D1 incident collector. The controls are not fully active until the external configuration below is completed.

## 1. Enable Firebase TOTP MFA

The web implementation uses Firebase Authentication's TOTP multi-factor APIs (the repository currently loads Firebase JS SDK 10.12.2).

1. Open Firebase Console for project `spark-stack-academy`.
2. Upgrade/enable Identity Platform if the console requires it for MFA.
3. Open Authentication > Settings / Multi-factor authentication.
4. Enable TOTP as a second-factor provider.
5. Confirm the Academy production domain is in Authorized domains.
6. Ensure the Founder account has a verified email address.
7. Sign in as Founder and open Founder > Security.
8. Enrol an authenticator using the setup key, then verify with the current six-digit code.
9. Sign out and sign in again to verify the MFA challenge is required.

Do not treat the UI as proof that MFA is enabled. Confirm the factor is present in Firebase Authentication for the Founder user. Keep recovery access to the authenticator; the current first release does not yet implement a separate recovery-code service.

Official Firebase guide: https://firebase.google.com/docs/auth/web/totp-mfa

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
