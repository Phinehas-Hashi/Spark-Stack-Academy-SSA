// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR EARNINGS ENGINE
// ============================================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

import {
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// CONFIG
// ============================================================

const DEFAULT_SETTINGS = {
    platformTaxPercent: 0,
    withdrawalFeePercent: 0,
    minimumWithdrawal: 1000,
    premiumMonthlyPrice: 999,
    withdrawalsEnabled: true,
    mpesaWithdrawalsEnabled: true,
    withdrawalApproval: true
};


// ============================================================
// STATE
// ============================================================

let currentInstructor = null;
let earningsSettings = {
    ...DEFAULT_SETTINGS
};

let currentBalance = 0;


// ============================================================
// DOM
// ============================================================

const $ = id => document.getElementById(id);


// ============================================================
// FORMATTERS
// ============================================================

function formatMoney(amount = 0) {

    return `KSh ${Number(amount || 0).toLocaleString(
        "en-KE",
        {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }
    )}`;

}


function formatDate(timestamp) {

    if (!timestamp) return "Recently";

    const date =
        timestamp.toDate
            ? timestamp.toDate()
            : new Date(timestamp);

    return date.toLocaleDateString(
        "en-KE",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );

}


// ============================================================
// FIRESTORE SETTINGS
// ============================================================

async function loadEarningsSettings() {
    try {
        const getSettings = httpsCallable(getFunctions(), "getInstructorEarningsSettings");
        const result = await getSettings();
        earningsSettings = {
            ...DEFAULT_SETTINGS,
            ...(result.data || {})
        };
        console.log("Instructor earnings settings loaded", earningsSettings);
    } catch (error) {
        console.error("Failed loading instructor earnings settings:", error);
        earningsSettings = { ...DEFAULT_SETTINGS };
    }
}

// ============================================================
// LOAD INSTRUCTOR PROFILE
// ============================================================

async function loadInstructorProfile(uid) {

    const ref =
        doc(
            db,
            "users",
            uid
        );

    const snap =
        await getDoc(ref);


    if (!snap.exists()) {

        throw new Error(
            "Instructor profile not found."
        );

    }


    currentInstructor = {
        uid,
        ...snap.data()
    };


    return currentInstructor;

}


// ============================================================
// LOAD EARNINGS
// ============================================================

async function loadEarnings() {
    if (!currentInstructor) return;

    try {
        const earningsQuery = query(
            collection(db, "instructorEarnings"),
            where("instructorId", "==", currentInstructor.uid)
        );
        const earningsSnapshot = await getDocs(earningsQuery);
        const now = new Date();
        let lifetime = 0;
        let monthTotal = 0;
        const transactions = [];

        earningsSnapshot.forEach(record => {
            const data = record.data();
            const amount = Number(data.netAmount ?? data.amount ?? data.total ?? data.earnings ?? 0);
            lifetime += amount;
            const date = data.createdAt?.toDate ? data.createdAt.toDate() : null;
            if (date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
                monthTotal += amount;
            }
            transactions.push({ id: record.id, ...data });
        });

        const withdrawalQuery = query(
            collection(db, "withdrawalRequests"),
            where("instructorId", "==", currentInstructor.uid)
        );
        const withdrawalSnapshot = await getDocs(withdrawalQuery);
        const withdrawals = withdrawalSnapshot.docs.map(record => ({ id: record.id, ...record.data() }));
        const releasedStatuses = ["rejected", "declined", "cancelled", "canceled", "failed"];
        const pendingStatuses = ["pending", "processing", "under_review"];
        const reserved = withdrawals.reduce((sum, item) => {
            const status = String(item.status || "pending").trim().toLowerCase();
            return releasedStatuses.includes(status) ? sum : sum + Number(item.amount || 0);
        }, 0);
        const pending = withdrawals.reduce((sum, item) => {
            const status = String(item.status || "pending").trim().toLowerCase();
            return pendingStatuses.includes(status) ? sum + Number(item.amount || 0) : sum;
        }, 0);

        currentBalance = Math.max(0, lifetime - reserved);
        updateMoney("availableBalance", currentBalance);
        updateMoney("pendingBalance", pending);
        updateMoney("monthlyEarnings", monthTotal);
        updateMoney("lifetimeEarnings", lifetime);
        setText("totalSales", transactions.length);
        updateMoney("minimumWithdrawal", earningsSettings.minimumWithdrawal);
        setText("withdrawalFee", `${Number(earningsSettings.withdrawalFeePercent || 0)}%`);
        setText("platformTax", `${Number(earningsSettings.platformTaxPercent || 0)}%`);
        updateMoney("premiumPrice", earningsSettings.premiumMonthlyPrice);

        const status = $("withdrawalStatus");
        const message = $("withdrawalMessage");
        const withdrawalsEnabled = earningsSettings.withdrawalsEnabled !== false
            && earningsSettings.mpesaWithdrawalsEnabled !== false
            && earningsSettings.withdrawalApproval !== false;
        const canWithdraw = withdrawalsEnabled && currentBalance >= Number(earningsSettings.minimumWithdrawal || 100);
        if (status) status.textContent = !withdrawalsEnabled
            ? "M-Pesa withdrawals disabled"
            : canWithdraw ? "Withdrawal available" : "Minimum balance not reached";
        if (message) message.textContent = !withdrawalsEnabled
            ? "The Founder has disabled M-Pesa withdrawals or manual payout approval."
            : canWithdraw
                ? "Your available balance is ready for an M-Pesa payout request."
                : `You need ${formatMoney(Math.max(0, Number(earningsSettings.minimumWithdrawal || 100) - currentBalance))} more to reach the withdrawal minimum.`;
        ["withdrawBtn", "heroWithdrawBtn"].forEach(id => {
            const button = $(id);
            if (button) button.disabled = !canWithdraw;
        });

        renderTransactions(transactions);
        renderWithdrawalHistory(withdrawals);
    } catch (error) {
        console.error("Failed loading instructor earnings and withdrawals:", error);
        showEarningsError();
        const history = $("withdrawalHistory");
        if (history) history.textContent = "Withdrawal history could not be loaded.";
    }
}


// ============================================================
// UPDATE MONEY
// ============================================================

function updateMoney(id, amount) {

    const element = $(id);

    if (element) {

        element.textContent =
            formatMoney(amount);

    }

}


// ============================================================
// TEXT
// ============================================================

function setText(id, value) {

    const element = $(id);

    if (element) {

        element.textContent = value;

    }

}


// ============================================================
// TRANSACTIONS
// ============================================================

function renderTransactions(items) {

    const container =
        $("transactionList");

    if (!container) return;


    if (!items.length) {

        container.innerHTML = `

            <div class="earnings-empty">

                <i data-lucide="receipt"></i>

                <span>
                    No earnings transactions yet.
                </span>

            </div>

        `;

        refreshIcons();

        return;

    }


    container.innerHTML =
        items.slice(0, 20).map(item => {

            const amount =
                Number(item.netAmount ?? item.amount ?? item.total ?? item.earnings ?? 0);


            return `

                <div class="transaction-item">

                    <div class="transaction-info">

                        <div class="transaction-icon">

                            <i data-lucide="arrow-down-left"></i>

                        </div>

                        <div>

                            <strong>
                                ${escapeHTML(
                                    item.description ||
                                    "Course payment"
                                )}
                            </strong>

                            <span>
                                ${formatDate(
                                    item.createdAt
                                )}
                            </span>

                        </div>

                    </div>


                    <strong class="transaction-amount">

                        +${formatMoney(amount)}

                    </strong>

                </div>

            `;

        }).join("");


    refreshIcons();

}


function renderWithdrawalHistory(items) {
    const container = $("withdrawalHistory");
    if (!container) return;
    if (!items.length) {
        container.innerHTML = '<div class="earnings-empty"><i data-lucide="banknote"></i><p>No withdrawals yet.</p></div>';
        refreshIcons();
        return;
    }
    const ordered = [...items].sort((a, b) => {
        const dateOf = value => value?.toDate ? value.toDate().getTime() : new Date(value || 0).getTime();
        return dateOf(b.createdAt) - dateOf(a.createdAt);
    });
    container.innerHTML = ordered.slice(0, 20).map(item => {
        const status = String(item.status || "pending").toLowerCase();
        const phone = String(item.account || "");
        const maskedPhone = phone.length > 4 ? `${phone.slice(0, 4)}••••${phone.slice(-2)}` : phone;
        return `
            <div class="transaction-item withdrawal-history-item">
                <div class="transaction-info">
                    <div class="transaction-icon"><i data-lucide="smartphone"></i></div>
                    <div>
                        <strong>M-Pesa · ${escapeHTML(maskedPhone)}</strong>
                        <span>${formatDate(item.createdAt)}</span>
                    </div>
                </div>
                <div class="withdrawal-history-meta">
                    <strong>${formatMoney(item.amount || 0)}</strong>
                    <span class="withdrawal-status-pill status-${escapeHTML(status.replace(/[^a-z0-9_-]/g, ""))}">${escapeHTML(status.replaceAll("_", " "))}</span>
                </div>
            </div>
        `;
    }).join("");
    refreshIcons();
}


// ============================================================
// WITHDRAWAL WINDOW
// ============================================================

let withdrawalTrigger = null;
let previousBodyOverflow = "";

function openWithdrawalWindow() {
    const modal = $("withdrawalModal");
    if (!modal) return;
    if (earningsSettings.withdrawalsEnabled === false || earningsSettings.mpesaWithdrawalsEnabled === false || earningsSettings.withdrawalApproval === false) {
        alert("M-Pesa withdrawals are currently disabled by the Founder.");
        return;
    }
    if (currentBalance < Number(earningsSettings.minimumWithdrawal || 100)) return;
    withdrawalTrigger = document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    const available = $("modalAvailableBalance");
    if (available) available.textContent = formatMoney(currentBalance);
    const amount = $("withdrawalAmount");
    if (amount) {
        amount.min = String(Number(earningsSettings.minimumWithdrawal || 100));
        amount.max = String(currentBalance);
        amount.value = "";
    }
    updateWithdrawalPreview();
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    $("withdrawalAccount")?.focus();
}

function closeWithdrawalWindow() {
    const modal = $("withdrawalModal");
    if (!modal || modal.classList.contains("hidden")) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = previousBodyOverflow;
    if (withdrawalTrigger?.isConnected) withdrawalTrigger.focus();
}

function updateWithdrawalPreview() {
    const amount = Math.max(0, Number($("withdrawalAmount")?.value || 0));
    const tax = amount * Number(earningsSettings.platformTaxPercent || 0) / 100;
    const fee = amount * Number(earningsSettings.withdrawalFeePercent || 0) / 100;
    const receive = Math.max(0, amount - tax - fee);
    updateMoney("summaryGross", amount);
    updateMoney("summaryTax", tax);
    updateMoney("summaryFee", fee);
    updateMoney("summaryNet", receive);
}

function normalizeMpesaPhone(value) {
    const digits = String(value || "").replace(/[^0-9]/g, "");
    if (/^0[17][0-9]{8}$/.test(digits)) return `+254${digits.slice(1)}`;
    if (/^254[17][0-9]{8}$/.test(digits)) return `+${digits}`;
    if (/^[17][0-9]{8}$/.test(digits)) return `+254${digits}`;
    return null;
}

async function submitWithdrawal() {
    if (!currentInstructor) return;
    const amount = Number($("withdrawalAmount")?.value || 0);
    const phone = normalizeMpesaPhone($("withdrawalAccount")?.value);
    const minimum = Number(earningsSettings.minimumWithdrawal || 100);
    if (!Number.isFinite(amount) || amount < minimum) {
        alert(`Minimum withdrawal is ${formatMoney(minimum)}.`);
        return;
    }
    if (amount > currentBalance) {
        alert("Insufficient available balance.");
        return;
    }
    if (!phone) {
        alert("Enter a valid Kenyan M-Pesa number, such as 0712345678 or +254712345678.");
        $("withdrawalAccount")?.focus();
        return;
    }

    const tax = amount * Number(earningsSettings.platformTaxPercent || 0) / 100;
    const fee = amount * Number(earningsSettings.withdrawalFeePercent || 0) / 100;
    const netAmount = Math.max(0, amount - tax - fee);
    const button = $("confirmWithdrawalBtn");
    if (button) {
        button.disabled = true;
        button.textContent = "Submitting request…";
    }
    try {
        const requestWithdrawal = httpsCallable(getFunctions(), "requestInstructorWithdrawal");
        await requestWithdrawal({ amount, phone });
        await loadEarnings();
        closeWithdrawalWindow();
        alert("Your M-Pesa withdrawal request has been submitted for review.");
    } catch (error) {
        console.error("Withdrawal request failed:", error);
        alert(error?.message || "Unable to submit the withdrawal request. Please try again.");
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i data-lucide="shield-check"></i> Confirm Withdrawal';
            refreshIcons();
        }
    }
}

function bindWithdrawalModalKeyboard() {
    const modal = $("withdrawalModal");
    if (!modal) return;
    document.addEventListener("keydown", event => {
        if (modal.classList.contains("hidden")) return;
        if (event.key === "Escape") {
            event.preventDefault();
            closeWithdrawalWindow();
            return;
        }
        if (event.key !== "Tab") return;
        const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
            .filter(element => element.getClientRects().length);
        if (!focusable.length) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

// ============================================================
// PREMIUM INSTRUCTOR
// ============================================================

function setupPremiumInstructor() {

    const button =
        $("premiumInstructorBtn");

    if (!button) return;


    const instructor =
        currentInstructor || {};


    const premium =
        instructor.instructorPremium === true ||
        instructor.premiumInstructor === true;


    if (premium) {

        button.textContent =
            "Premium Active";

        button.disabled = true;

        button.classList.add(
            "premium-active"
        );

        return;

    }


    button.addEventListener(
        "click",
        () => {

            const price =
                formatMoney(
                    earningsSettings.premiumMonthlyPrice
                );


            button.addEventListener(
    "click",
    () => {

        window.location.href =
            "payments.html?upgrade=premium";

    }
);

        }
    );

}


// ============================================================
// EVENTS
// ============================================================

function setupEvents() {
    $("withdrawBtn")?.addEventListener("click", openWithdrawalWindow);
    $("heroWithdrawBtn")?.addEventListener("click", openWithdrawalWindow);
    $("closeWithdrawalModal")?.addEventListener("click", closeWithdrawalWindow);
    $("confirmWithdrawalBtn")?.addEventListener("click", submitWithdrawal);
    $("withdrawalAmount")?.addEventListener("input", updateWithdrawalPreview);
    $("withdrawalModal")?.addEventListener("click", event => {
        if (event.target === $("withdrawalModal") || event.target.classList.contains("modal-backdrop")) {
            closeWithdrawalWindow();
        }
    });
    bindWithdrawalModalKeyboard();
}


// ============================================================
// HTML SAFETY
// ============================================================

function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// ============================================================
// ERROR
// ============================================================

function showEarningsError() {

    const list =
        $("transactionList");

    if (!list) return;


    list.innerHTML = `

        <div class="earnings-empty">

            <i data-lucide="alert-circle"></i>

            <span>
                Earnings could not be loaded.
            </span>

        </div>

    `;

    refreshIcons();

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

    refreshIcons();


    onAuthStateChanged(
        auth,
        async user => {

            if (!user) return;


            try {

                await loadInstructorProfile(
                    user.uid
                );


                await loadEarningsSettings();


                await loadEarnings();


                setupPremiumInstructor();


                refreshIcons();


                console.log(
                    "✓ Instructor earnings loaded"
                );


            } catch (error) {

                console.error(
                    "❌ Earnings boot failed:",
                    error
                );

            }

        }
    );

}


boot();