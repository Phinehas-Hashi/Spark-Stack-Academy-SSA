import "./smart-connectivity.js?v=20261124-recovery2";
import "./online-action-guard.js";
import "./ui-runtime.js";
import "./ui-polish.js";
import "./splash-screen.js";
import "./security-config.js";
import { installSecurityTelemetry } from "./security-telemetry.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBAXM3aTLHSifnpidG0VAqfpSIQJjx-XcI",
    authDomain: "spark-stack-academy-ssa.firebaseapp.com",
    projectId: "spark-stack-academy-ssa",
    storageBucket: "spark-stack-academy-ssa.firebasestorage.app",
    messagingSenderId: "375725708498",
    appId: "1:375725708498:web:828c7c1875e06c87de490b",
    measurementId: "G-8NG22QC3SF"
};

const app = initializeApp(firebaseConfig);
let appCheck = null;
try {
    if (window.SSA_RECAPTCHA_V3_SITE_KEY) {
        appCheck = initializeAppCheck(app, { provider: new ReCaptchaV3Provider(window.SSA_RECAPTCHA_V3_SITE_KEY), isTokenAutoRefreshEnabled: true });
    }
} catch (error) {
    console.error("[SSA SECURITY] App Check initialization failed; configure the reCAPTCHA site key before enforcing App Check.", error);
}
const db = getFirestore(app);
const auth = getAuth(app);
installSecurityTelemetry(auth);
const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence).catch(error => {
    console.error("Firebase Auth persistence:", error);
});

export { app, auth, db, storage, appCheck };
