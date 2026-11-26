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
    apiKey: "AIzaSyBlPs-9EU_YYiP4qZ6gFF9ZorJbbktXqC4",
    authDomain: "spark-stack-academy.firebaseapp.com",
    databaseURL: "https://spark-stack-academy-default-rtdb.firebaseio.com",
    projectId: "spark-stack-academy",
    storageBucket: "spark-stack-academy.firebasestorage.app",
    messagingSenderId: "691304828755",
    appId: "1:691304828755:web:b78b4c47ad007a5be39ba6",
    measurementId: "G-2CJ4RW1PNZ"
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
