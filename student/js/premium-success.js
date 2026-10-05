// =====================================
// SPARK STACK ACADEMY
// PREMIUM PAYMENT VERIFICATION
// premium-success.js
// =====================================

import {
    auth
} from "../../js/firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


const API_BASE_URL = window.SSA_LEGACY_PAYMENT_API_BASE_URL || "";


const statusElement =
    document.getElementById(
        "paymentStatus"
    );


const continueBtn =
    document.getElementById(
        "continueBtn"
    );


const params =
    new URLSearchParams(
        window.location.search
    );


const reference =
    params.get("reference");


console.log(
    "💎 Premium payment callback"
);


onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            window.location.href =
                "../login.html";

            return;

        }


        if (!reference) {

            showError(
                "Payment reference was not found."
            );

            return;

        }


        await verifyPayment();

    }
);


// =====================================
// VERIFY
// =====================================

async function verifyPayment() {

    try {

        if (!API_BASE_URL) {
            throw new Error("The legacy premium verification endpoint is disabled.");
        }

        setStatus(
            "Verifying your payment..."
        );


        const response =
            await fetch(

                `${API_BASE_URL}/api/payments/verify/${encodeURIComponent(reference)}`

            );


        const data =
            await response.json();


        if (!data.success) {

            throw new Error(
                data.message ||
                "Payment verification failed"
            );

        }


        if (
            data.status !==
            "success"
        ) {

            showError(
                `Payment status: ${data.status}`
            );

            return;

        }


        setStatus(
            "Premium activated successfully! 🎉"
        );


        continueBtn.style.display =
            "inline-block";


        console.log(
            "✅ Premium payment verified:",
            reference
        );


    }

    catch (error) {

        console.error(
            "Premium verification failed:",
            error
        );


        showError(
            "We couldn't confirm the payment yet. Please try again."
        );

    }

}


// =====================================
// STATUS
// =====================================

function setStatus(message) {

    if (statusElement) {

        statusElement.textContent =
            message;

    }

}


// =====================================
// ERROR
// =====================================

function showError(message) {

    if (statusElement) {

        statusElement.textContent =
            message;

    }

}