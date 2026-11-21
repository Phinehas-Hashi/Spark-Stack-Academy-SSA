import { populateCountrySelect } from "../../js/countries.js";
import { auth, db } from "../../js/firebase.js";
import { createUserWithEmailAndPassword, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById("institutionRegistrationForm");
const button = document.getElementById("submitInstitutionApplication");
const message = document.getElementById("registrationMessage");
const countrySelect = document.getElementById("institutionCountry");
populateCountrySelect(countrySelect, "KE");
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
    const email = value("email").toLowerCase();
    const credential = await createUserWithEmailAndPassword(auth, email, value("password"));
    createdUser = credential.user;
    await updateProfile(createdUser, { displayName: value("ownerName") });

    const application = {
      institutionOwnerUid: createdUser.uid,
      institutionName: value("institutionName"),
      institutionType: value("institutionType"),
      countryCode: value("countryCode"),\n      country: countrySelect?.selectedOptions?.[0]?.textContent || "",
      website: value("website"),
      learnerRange: value("learnerRange"),
      institutionPhone: value("institutionPhone"),
      ownerName: value("ownerName"),
      ownerEmail: email,
      ownerPosition: value("ownerPosition"),
      status: "pending_review",
      submittedAt: serverTimestamp(),
      source: "institution_registration"
    };
    await setDoc(doc(db, "institutionApplications", createdUser.uid), application);
    await signOut(auth);
    report("Application submitted. Our team will review your institution details. Your institution workspace will become available after approval.", "success");
    form.reset();
    const country = form.elements.namedItem("country");
    if (country) country.value = "Kenya";
  } catch (error) {
    console.error("Institution application submission failed:", error);
    if (createdUser) {
      try { await signOut(auth); } catch (signOutError) { console.error("Sign-out after failed application:", signOutError); }
    }
    const messages = {
      "auth/email-already-in-use": "An account already exists with this email. Try signing in or use another email.",
      "auth/weak-password": "Choose a stronger password with at least 8 characters.",
      "permission-denied": "The application could not be saved because the database permission rules are not yet deployed. Please contact the Academy team; do not repeatedly submit.",
      "auth/invalid-email": "Enter a valid email address."
    };
    report(messages[error.code] || "We could not submit the application. Please check your connection and try again. If an account was created, contact support before retrying.", "error");
  } finally {
    button.disabled = false;
  }
});