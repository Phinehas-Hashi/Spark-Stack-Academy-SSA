import "./ui-runtime.js";
import "./ui-polish.js";
import "./splash-screen.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlPs-9EU_YYiP4qZ6gFF9ZorJbbktxC4",
    authDomain: "spark-stack-academy.firebaseapp.com",
    databaseURL: "https://spark-stack-academy-default-rtdb.firebaseio.com",
    projectId: "spark-stack-academy",
    storageBucket: "spark-stack-academy.firebasestorage.app",
    messagingSenderId: "691304828755",
    appId: "1:691304828755:web:dcb92043eb1a308ce39ba6",
    measurementId: "G-GYS3P7ZVYJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence);

export { auth, db, storage };
