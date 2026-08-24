import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { 
    getAuth,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import {
    getStorage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";


const firebaseConfig = {

    apiKey: "AIzaSyBlPs-9EU_YYiP4qZ6gFF9ZorJbbktXqC4",

    authDomain: "spark-stack-academy.firebaseapp.com",

    projectId: "spark-stack-academy",

    storageBucket: "spark-stack-academy.firebasestorage.app",

    messagingSenderId: "691304828755",

    appId: "1:691304828755:web:b78b4c47ad007a5be39ba6",

    measurementId: "G-2CJ4RW1PNZ"

};


const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const auth = getAuth(app);

const storage = getStorage(app);

// Keep users logged in after refresh
setPersistence(
    auth,
    browserLocalPersistence
);


export {
    auth,
    db,
    storage
};