// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR PRO ENGINE
// ============================================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// CONFIG
// ============================================================

const BACKEND_URL = window.SSA_LEGACY_PAYMENT_API_BASE_URL || "";

const DEFAULT_PRICE = 999;


// ============================================================
// STATE
// ============================================================

let currentUser = null;
let premiumPrice = DEFAULT_PRICE;
let processing = false;


// ============================================================
// DOM
// ============================================================

const $ = id => document.getElementById(id);


// ============================================================
// MONEY
// ============================================================

function formatMoney(amount = 0) {

    return `KSh ${Number(amount).toLocaleString(
        "en-KE"
    )}`;

}


// ============================================================
// LOAD SETTINGS
// ============================================================

async function loadSettings() {

    try {

        const ref = doc(
            db,
            "platformSettings",
            "earnings"
        );

        const snap = await getDoc(ref);

        if (snap.exists()) {

            const data = snap.data();

            premiumPrice =
                Number(
                    data.premiumMonthlyPrice ||
                    DEFAULT_PRICE
                );

        }

    } catch (error) {

        console.error(
            "❌ Failed loading Pro settings:",
            error
        );

    }


    updatePriceUI();

}


// ============================================================
// PRICE UI
// ============================================================

function updatePriceUI() {

    const price =
        $("proPrice");

    if (price) {

        price.textContent =
            premiumPrice.toLocaleString("en-KE");

    }


    const button =
        $("upgradeProBtn");

    if (button && !button.disabled) {

        button.innerHTML = `

            <i data-lucide="zap"></i>

            Upgrade to Pro — ${formatMoney(
                premiumPrice
            )}

        `;

        refreshIcons();

    }

}


// ============================================================
// CHECK PREMIUM
// ============================================================

async function checkPremium(uid) {

    const ref =
        doc(
            db,
            "users",
            uid
        );

    const snap =
        await getDoc(ref);


    if (!snap.exists()) return false;


    const data =
        snap.data();


    return (
        data.instructorPremium === true ||
        data.premiumInstructor === true
    );

}


// ============================================================
// ACTIVATE PREMIUM
// ============================================================

async function activatePremium(uid) {

    const ref =
        doc(
            db,
            "users",
            uid
        );


    await updateDoc(
        ref,
        {

            instructorPremium: true,

            premiumInstructor: true,

            instructorPremiumActivatedAt:
                serverTimestamp(),

            instructorPremiumPrice:
                premiumPrice

        }
    );

}


// ============================================================
// START PAYMENT
// ============================================================

async function startPayment() {

    if (
        !currentUser ||
        processing
    ) return;


    processing = true;


    const button =
        $("upgradeProBtn");


    try {

        if (!BACKEND_URL) {
            throw new Error("The legacy Instructor Pro payment endpoint is disabled until the unified SSA payment service is configured.");
        }

        if (button) {

            button.disabled = true;

            button.innerHTML = `

                <span class="pro-button-loader"></span>

                Connecting to payment...

            `;

        }


        const response =
            await fetch(
                `${BACKEND_URL}/api/payments/instructor-pro`,
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        userId:
                            currentUser.uid,

                        email:
                            currentUser.email,

                        amount:
                            premiumPrice,

                        currency:
                            "KES"

                    })

                }
            );


        if (!response.ok) {

            throw new Error(
                "Payment initialization failed."
            );

        }


        const data =
            await response.json();


        if (
            !data.authorization_url
        ) {

            throw new Error(
                "Payment URL was not returned."
            );

        }


        /*
         * Save reference temporarily.
         */

        localStorage.setItem(
            "ssaInstructorProReference",
            data.reference || ""
        );


        /*
         * Redirect to Paystack.
         */

        window.location.href =
            data.authorization_url;


    } catch (error) {

        console.error(
            "❌ Pro payment failed:",
            error
        );


        alert(
            "Unable to start payment. Please try again."
        );


        processing = false;


        if (button) {

            button.disabled = false;

            updatePriceUI();

        }

    }

}


// ============================================================
// PAYMENT CALLBACK / VERIFICATION
// ============================================================

async function verifyPayment() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    const reference =
        params.get("reference") ||
        params.get("trxref") ||
        localStorage.getItem(
            "ssaInstructorProReference"
        );


    if (!reference || !currentUser) {
        return;
    }


    try {

        const response =
            await fetch(
                `${BACKEND_URL}/api/payments/verify/${encodeURIComponent(
                    reference
                )}`
            );


        const result =
            await response.json();


        if (
            result.status !== "success"
        ) {

            alert(
                "Payment could not be verified."
            );

            return;

        }


        /*
         * Only verified payment activates Pro.
         */

        await activatePremium(
            currentUser.uid
        );


        localStorage.removeItem(
            "ssaInstructorProReference"
        );


        alert(
            "🔥 Instructor Pro activated successfully!"
        );


        window.history.replaceState(
            {},
            document.title,
            window.location.pathname
        );


        updatePremiumUI();


    } catch (error) {

        console.error(
            "❌ Payment verification failed:",
            error
        );

        alert(
            "Payment verification failed. Please contact support."
        );

    }

}


// ============================================================
// PREMIUM UI
// ============================================================

function updatePremiumUI() {

    const button =
        $("upgradeProBtn");


    if (!button) return;


    button.disabled = true;

    button.classList.add(
        "premium-active"
    );


    button.innerHTML = `

        <i data-lucide="badge-check"></i>

        Instructor Pro Active

    `;


    const status =
        $("proStatus");


    if (status) {

        status.textContent =
            "Active";

        status.classList.add(
            "active"
        );

    }


    refreshIcons();

}


// ============================================================
// EVENTS
// ============================================================

function setupEvents() {

    $("upgradeProBtn")
        ?.addEventListener(
            "click",
            startPayment
        );

}


// ============================================================
// ICONS
// ============================================================

function refreshIcons() {

    if (
        window.lucide &&
        typeof window.lucide.createIcons ===
        "function"
    ) {

        window.lucide.createIcons();

    }

}


// ============================================================
// BOOT
// ============================================================

async function boot() {

    setupEvents();

    await loadSettings();


    onAuthStateChanged(
        auth,
        async user => {

            if (!user) {

                window.location.href =
                    "../login.html";

                return;

            }


            currentUser = user;


            try {

                const premium =
                    await checkPremium(
                        user.uid
                    );


                if (premium) {

                    updatePremiumUI();

                }


                /*
                 * Handle Paystack return.
                 */

                await verifyPayment();


            } catch (error) {

                console.error(
                    "❌ Pro boot failed:",
                    error
                );

            }

        }
    );

}


boot();