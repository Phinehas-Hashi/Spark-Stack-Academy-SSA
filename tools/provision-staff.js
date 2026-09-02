#!/usr/bin/env node
/**
 * Spark Stack Academy — privileged staff provisioning
 *
 * Creates or upgrades Firebase Authentication users for the Founder/Admin
 * roles, writes their Firestore profile, and assigns trusted custom claims.
 *
 * NEVER put a Firebase service-account JSON file, password, or private key
 * in this repository.
 *
 * Required environment:
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json
 *   FOUNDER_EMAIL=founder@example.com
 *   FOUNDER_NAME=Founder Name
 *   FOUNDER_PASSWORD=...        (only required when creating the account)
 *   ADMIN_EMAIL=admin@example.com
 *   ADMIN_NAME=Admin Name
 *   ADMIN_PASSWORD=...          (only required when creating the account)
 *
 * If an account already exists, its password is NOT changed.
 */

const crypto = require("crypto");
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const auth = admin.auth();
const db = admin.firestore();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function generatedPassword() {
  return `${crypto.randomBytes(18).toString("base64url")}!A9`;
}

async function getOrCreateUser({ email, name, password }) {
  try {
    return { user: await auth.getUserByEmail(email), created: false, password: null };
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    const finalPassword = password || generatedPassword();
    const user = await auth.createUser({
      email,
      password: finalPassword,
      displayName: name,
      emailVerified: false,
      disabled: false
    });
    return { user, created: true, password: finalPassword };
  }
}

async function provisionStaff({ role, email, name, password }) {
  const result = await getOrCreateUser({ email, name, password });
  const { user } = result;

  const claims = role === "founder"
    ? { role: "founder", founder: true, admin: true }
    : { role: "admin", admin: true };

  await auth.setCustomUserClaims(user.uid, claims);

  const profile = {
    uid: user.uid,
    fullName: name || user.displayName || role,
    email: user.email || email,
    role,
    active: true,
    verified: user.emailVerified,
    accountType: "staff",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (result.created) profile.createdAt = admin.firestore.FieldValue.serverTimestamp();

  await db.collection("users").doc(user.uid).set(profile, { merge: true });

  if (role === "founder") {
    await db.collection("founder").doc(user.uid).set({
      uid: user.uid,
      email: user.email || email,
      fullName: name || user.displayName || "Founder",
      role: "founder",
      status: "active",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(result.created ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {})
    }, { merge: true });
  }

  return { ...result, uid: user.uid };
}

async function main() {
  const founder = await provisionStaff({
    role: "founder",
    email: required("FOUNDER_EMAIL"),
    name: required("FOUNDER_NAME"),
    password: process.env.FOUNDER_PASSWORD?.trim() || null
  });

  const adminAccount = await provisionStaff({
    role: "admin",
    email: required("ADMIN_EMAIL"),
    name: required("ADMIN_NAME"),
    password: process.env.ADMIN_PASSWORD?.trim() || null
  });

  console.log("\n✅ Staff provisioning complete");
  console.log(`Founder: ${founder.user.email} (${founder.uid})${founder.created ? " — created" : " — existing account upgraded"}`);
  console.log(`Admin:   ${adminAccount.user.email} (${adminAccount.uid})${adminAccount.created ? " — created" : " — existing account upgraded"}`);

  if (founder.created && founder.password) {
    console.log(`\nFounder generated password: ${founder.password}`);
    console.log("Store it securely; it will not be printed again by this script.");
  }
  if (adminAccount.created && adminAccount.password) {
    console.log(`Admin generated password: ${adminAccount.password}`);
    console.log("Store it securely; it will not be printed again by this script.");
  }

  console.log("\nImportant: custom claims appear in newly issued ID tokens. Sign out/in (or refresh the ID token) after provisioning.");
}

main().catch((error) => {
  console.error("❌ Staff provisioning failed:", error.message);
  process.exitCode = 1;
});
