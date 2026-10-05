// =====================================
// SPARK STACK ACADEMY
// PREMIUM SUBSCRIPTION CONTROLLER V1
// premium.js
// =====================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// =====================================
// CONFIG
// =====================================

const API_BASE_URL = window.SSA_LEGACY_PAYMENT_API_BASE_URL || "";


// =====================================
// STATE
// =====================================

let currentUser = null;


// =====================================
// DOM
// =====================================

const currentPlan =
    document.getElementById(
        "currentPlan"
    );

const subscriptionStatus =
    document.getElementById(
        "subscriptionStatus"
    );

const premiumMessage =
    document.getElementById(
        "premiumMessage"
    );

const planButtons =
    document.querySelectorAll(
        ".premium-plan-btn"
    );


// =====================================
// INIT
// =====================================

console.log(
    "💎 Premium Controller Loaded"
);


onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            window.location.href =
                "../login.html";

            return;
        }

        currentUser = user;

        console.log(
            "👨‍🎓 Premium Student:",
            user.email
        );

        await loadSubscription();

    }
);


// =====================================
// LOAD SUBSCRIPTION
// =====================================

async function loadSubscription() {

    try {

        const subscriptionRef =
            doc(
                db,
                "premiumSubscriptions",
                currentUser.uid
            );

        const snapshot =
            await getDoc(
                subscriptionRef
            );


        if (!snapshot.exists()) {

            setFreePlan();

            return;
        }


        const data =
            snapshot.data();


        const status =
            data.status || "inactive";


        if (
            status !== "active"
        ) {

            setFreePlan();

            return;
        }


        // ---------------------------------
        // ACTIVE PREMIUM
        // ---------------------------------

        const plan =
            formatPlanName(
                data.plan
            );


        if (currentPlan) {

            currentPlan.textContent =
                `Premium — ${plan}`;

        }


        if (subscriptionStatus) {

            subscriptionStatus.textContent =
                data.expiresAt
                    ? `Active until ${formatDate(data.expiresAt)}`
                    : "Your premium subscription is active.";

        }


        // Disable purchase buttons
        planButtons.forEach(
            button => {

                button.disabled = true;

                button.textContent =
                    "Premium Active";

            }
        );


        console.log(
            "💎 Premium active:",
            data
        );

    }

    catch (error) {

        console.error(
            "Subscription loading failed:",
            error
        );

        setFreePlan();

    }

}


// =====================================
// FREE PLAN
// =====================================

function setFreePlan() {

    if (currentPlan) {

        currentPlan.textContent =
            "Free Student";

    }


    if (subscriptionStatus) {

        subscriptionStatus.textContent =
            "Upgrade to unlock premium benefits.";

    }

}


// =====================================
// PLAN BUTTONS
// =====================================

planButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            async () => {

                const plan =
                    button.dataset.plan;

                const price =
                    Number(
                        button.dataset.price
                    );


                if (
                    !plan ||
                    !price
                ) {

                    return;
                }


                await initializePremiumPayment(
                    plan,
                    price,
                    button
                );

            }
        );

    }
);


// =====================================
// INITIALIZE PREMIUM PAYMENT
// =====================================

async function initializePremiumPayment(
    plan,
    price,
    button
) {

    try {

        if (!API_BASE_URL) {
            throw new Error("The legacy premium payment endpoint is disabled. Use the SSA payment service when it is configured.");
        }

        setPaymentMessage(
            "Preparing your premium payment..."
        );


        button.disabled = true;


        const response =
            await fetch(
                `${API_BASE_URL}/api/payments/initialize`,
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        email:
                            currentUser.email,

                        amount:
                            price,

                        userId:
                            currentUser.uid,

                        type:
                            "premium_subscription",

                        plan:

                            plan,

                        product:
                            "SSA Premium Subscription"

                    })

                }
            );


        const data =
            await response.json();


        if (!data.success) {

            throw new Error(
                data.message ||
                "Unable to initialize payment"
            );

        }


        console.log(
            "💳 Premium payment initialized:",
            data.reference
        );


        // Redirect to Paystack
        window.location.href =
    `${data.authorization_url}`;

    }

    catch (error) {

        console.error(
            "Premium payment error:",
            error
        );


        button.disabled = false;


        setPaymentMessage(
            "Unable to start payment. Please try again."
        );

    }

}


// =====================================
// PAYMENT MESSAGE
// =====================================

function setPaymentMessage(message) {

    if (!premiumMessage) return;


    premiumMessage.style.display =
        "flex";


    const text =
        premiumMessage.querySelector(
            "span"
        );


    if (text) {

        text.textContent =
            message;

    }

}


// =====================================
// PLAN NAME
// =====================================

function formatPlanName(plan) {

    const names = {

        monthly:
            "Monthly",

        quarterly:
            "3 Months",

        biannual:
            "6 Months"

    };


    return names[plan] ||
        "Premium";

}


// =====================================
// DATE FORMAT
// =====================================

function formatDate(value) {

    try {

        let date;


        if (
            value?.toDate
        ) {

            date =
                value.toDate();

        }

        else {

            date =
                new Date(value);

        }


        return date.toLocaleDateString(
            "en-KE",
            {
                day: "numeric",
                month: "short",
                year: "numeric"
            }
        );

    }

    catch {

        return "";

    }

}