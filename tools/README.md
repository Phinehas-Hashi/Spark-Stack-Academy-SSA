# Staff account provisioning

`provision-staff.js` is the trusted setup utility for the two privileged SSA roles:

- `founder` — Founder OS access and full founder controls.
- `admin` — Admin/Moderator Console access.

The normal web client must never be allowed to create or promote these roles. Firebase custom claims are assigned only by the Firebase Admin SDK from this trusted environment. Firebase documents custom claims as the mechanism for role-based access control and states that they must be set from a privileged server environment. citeturn0search4

## 1. Install the Admin SDK

From the repository root:

```bash
npm install firebase-admin
```

Do **not** commit `node_modules`, a service-account JSON file, passwords, or private keys.

## 2. Configure Firebase Admin credentials

In Firebase Console, create/download a service-account key and keep it outside the repository. Then set:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/service-account.json"
```

## 3. Create the Founder and Admin accounts

Use the emails/names you want for the real accounts:

```bash
export FOUNDER_EMAIL="your-founder-email@example.com"
export FOUNDER_NAME="Your Founder Name"
export FOUNDER_PASSWORD="your-strong-password"

export ADMIN_EMAIL="your-admin-email@example.com"
export ADMIN_NAME="Your Admin Name"
export ADMIN_PASSWORD="your-strong-password"

node tools/provision-staff.js
```

Passwords are only used when a Firebase Auth account does not already exist. Existing account passwords are not changed.

If a password variable is omitted while creating a new account, the script generates a strong temporary password and prints it once. Store it securely and change it through the normal password flow afterward.

## What the script creates

For the Founder:

- Firebase Authentication account
- `users/{uid}` with `role: "founder"`
- `founder/{uid}` with `role: "founder"` and `status: "active"`
- trusted claims `{ role: "founder", founder: true, admin: true }`

For the Admin:

- Firebase Authentication account
- `users/{uid}` with `role: "admin"`
- trusted claim `{ role: "admin", admin: true }`

The existing login flow already routes `founder` to `founder/dashboard.html` and `admin` to `admin/dashboard.html`.

After provisioning, sign out and sign back in so the newly issued ID token contains the claims.
