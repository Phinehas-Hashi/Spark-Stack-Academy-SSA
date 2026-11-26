import { auth } from "../../js/firebase.js";
import { createUserWithEmailAndPassword, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const EXPECTED_FIREBASE_PROJECT_ID = "spark-stack-academy-ssa";
const functions = getFunctions(auth.app, "us-central1");
const submitInstitutionApplication = httpsCallable(functions, "submitInstitutionApplication");

console.info("[SSA INSTITUTION REGISTRATION] Firebase project:", auth.app.options.projectId);

const form = document.getElementById("institutionRegistrationForm");
const button = document.getElementById("submitInstitutionApplication");
const message = document.getElementById("registrationMessage");
const value = name => String(new FormData(form).get(name) || "").trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function report(text, kind = "") {
  message.textContent = text;
  message.className = "registration-message " + kind;
}

function validate() {
  if (!form.reportValidity()) return false;
  if (!emailPattern.test(value("email"))) return report("Enter a valid work email address.", "error"), false;
  if (value("password").length < 8) return report("Use a password with at least 8 characters.", "error"), false;
  if (value("password") !== value("confirmPassword")) return report("The passwords do not match.", "error"), false;
  if (value("website") && !/^https?:\/\//i.test(value("website"))) return report("Website must start with https:// or http://.", "error"), false;
  return true;
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!validate()) return;
  button.disabled = true;
  report("Submitting your application securely…");
  let createdUser = null;
  try {
    if (auth.app.options.projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
      throw new Error("Institution registration is connected to an unexpected Firebase project. Refresh the page and contact support if this continues.");
    }
    const email = value("email").toLowerCase();
    const credential = await createUserWithEmailAndPassword(auth, email, value("password"));
    createdUser = credential.user;
    await updateProfile(createdUser, { displayName: value("ownerName") });

    await submitInstitutionApplication({
      institutionName: value("institutionName"),
      institutionType: value("institutionType"),
      country: value("country"),
      website: value("website"),
      learnerRange: value("learnerRange"),
      institutionPhone: value("institutionPhone"),
      ownerName: value("ownerName"),
      ownerPosition: value("ownerPosition")
    });
    await signOut(auth);
    report("Application submitted. A restricted provisional workspace has been reserved. Full institution access begins after Academy verification and approval.", "success");
    form.reset();
    const country = form.elements.namedItem("country");
    if (country) country.value = "Kenya";
  } catch (error) {
    console.error("Institution application submission failed:", {
      code: error.code || "unknown",
      message: error.message || String(error),
      firebaseProjectId: auth.app.options.projectId
    });
    if (createdUser) {
      try { await signOut(auth); } catch (signOutError) { console.error("Sign-out after failed application:", signOutError); }
    }
    const messages = {
      "auth/email-already-in-use": "An account already exists with this email. Try signing in or use another email.",
      "auth/weak-password": "Choose a stronger password with at least 8 characters.",
      "permission-denied": "The Academy could not verify the institution application request. Contact support with the error code; do not repeatedly create accounts.",
      "auth/invalid-email": "Enter a valid email address."
    };
    report(messages[error.code] || "We could not submit the application. Please check your connection and try again. If an account was created, contact support before retrying.", "error");
  } finally {
    button.disabled = false;
  }
});