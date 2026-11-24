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

import {
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// CONFIG
// ============================================================

const DEFAULT_SETTINGS = {
    platformTaxPercent: 0,
    withdrawalFeePercent: 0,
    minimumWithdrawal: 100,
    premiumMonthlyPrice: 999
};


// ============================================================
// STATE
// ============================================================

let currentInstructor = null;
let earningsSettings = {
    ...DEFAULT_SETTINGS
};

let currentBalance = 0;
let withdrawalTrigger = null;
let previousBodyOverflow = "";


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

        const ref =
            doc(
                db,
                "platformSettings",
                "earnings"
            );

        const snap =
            await getDoc(ref);


        if (snap.exists()) {

            earningsSettings = {
                ...DEFAULT_SETTINGS,
                ...snap.data()
            };

        }


        console.log(
            "✓ Earnings settings loaded",
            earningsSettings
        );


    } catch (error) {

        console.error(
            "❌ Failed loading earnings settings:",
            error
        );

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

        const q =
            query(
                collection(db, "instructorEarnings"),
                where(
                    "instructorId",
                    "==",
                    currentInstructor.uid
                ),
                orderBy(
                    "createdAt",
                    "desc"
                )
            );


        const withdrawalQuery = query(
            collection(db, "withdrawalRequests"),
            where("instructorId", "==", currentInstructor.uid)
        );
        const [snapshot, withdrawalSnapshot] = await Promise.all([
            getDocs(q),
            getDocs(withdrawalQuery)
        ]);
        const withdrawals = withdrawalSnapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        })).sort((a, b) => {
            const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
        });

        let total = 0;
        let monthTotal = 0;
        let transactions = [];


        const now = new Date();

        snapshot.forEach(item => {

            const data = item.data();

            const amount =
                Number(data.netAmount ?? data.amount ?? data.total ?? data.earnings ?? 0);

            total += amount;


            const date =
                data.createdAt?.toDate
                    ? data.createdAt.toDate()
                    : null;


            if (
                date &&
                date.getMonth() === now.getMonth() &&
                date.getFullYear() === now.getFullYear()
            ) {

                monthTotal += amount;

            }


            transactions.push({
                id: item.id,
                ...data
            });

        });


        const reservedStatuses = new Set(["pending", "approved", "processing", "paid"]);
        const reservedAmount = withdrawals.reduce((sum, item) => {
            const status = String(item.status || "pending").trim().toLowerCase();
            return sum + (reservedStatuses.has(status) ? Number(item.amount || 0) : 0);
        }, 0);
        const pendingAmount = withdrawals.reduce((sum, item) => {
            return sum + (String(item.status || "pending").trim().toLowerCase() === "pending" ? Number(item.amount || 0) : 0);
        }, 0);

        currentBalance = Math.max(total - reservedAmount, 0);

        updateMoney("availableBalance", currentBalance);
        updateMoney("pendingBalance", pendingAmount);
        updateMoney("monthlyEarnings", monthTotal);
        updateMoney("lifetimeEarnings", total);
        updateMoney("revenueTotal", total);
        setText("totalSales", transactions.length);
        setText("balanceStatus", currentBalance >= Number(earningsSettings.minimumWithdrawal || 100)
            ? "Available for withdrawal"
            : "Below minimum withdrawal");
        setText("withdrawalStatus", currentBalance >= Number(earningsSettings.minimumWithdrawal || 100)
            ? "Withdrawal available"
            : "Minimum not reached");
        setText("withdrawalMessage", currentBalance >= Number(earningsSettings.minimumWithdrawal || 100)
            ? "Your available balance is ready for an M-Pesa withdrawal request."
            : "Your available balance has not reached the minimum withdrawal threshold.");
        updateMoney("minimumWithdrawal", Number(earningsSettings.minimumWithdrawal || 100));
        setText("withdrawalFee", `${Number(earningsSettings.withdrawalFeePercent || 0)}%`);
        setText("platformTax", `${Number(earningsSettings.platformTaxPercent || 0)}%`);

        renderTransactions(transactions);
        renderWithdrawalHistory(withdrawals);


    } catch (error) {

        console.error(
            "❌ Failed loading earnings:",
            error
        );

        showEarningsError();

    }

}


function renderWithdrawalHistory(items) {
    const container = $("withdrawalHistory");
    if (!container) return;

    if (!items.length) {
        container.innerHTML = '<div class="earnings-empty"><i data-lucide="banknote"></i><p>No withdrawals yet.</p></div>';
        refreshIcons();
        return;
    }

    container.innerHTML = items.map(item => {
        const status = String(item.status || "pending").trim().toLowerCase();
        const label = status.charAt(0).toUpperCase() + status.slice(1);
        return `<div class="withdrawal-item">
            <div class="transaction-info">
                <div class="transaction-icon"><i data-lucide="wallet"></i></div>
                <div><strong>${formatMoney(item.amount)}</strong><span>M-Pesa • ${escapeHTML(item.account || "Phone not recorded")} • ${formatDate(item.createdAt)}</span></div>
            </div>
            <strong class="withdrawal-status-badge ${escapeHTML(status)}">${escapeHTML(label)}</strong>
        </div>`;
    }).join("");
    refreshIcons();
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
                Number(item.netAmount || 0);


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


// ============================================================
// WITHDRAWAL WINDOW
// ============================================================

function openWithdrawalWindow(event) {
    const modal = $("withdrawalModal");
    if (!modal || !modal.classList.contains("hidden")) return;

    withdrawalTrigger = event?.currentTarget || document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    $("modalAvailableBalance").textContent = formatMoney(currentBalance);
    $("withdrawalAmount").max = String(currentBalance);
    $("withdrawalAmount").value = "";
    $("withdrawalAccount").value = "";
    updateWithdrawalPreview();

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    $("withdrawalAmount")?.focus();
}


function closeWithdrawalWindow() {
    const modal = $("withdrawalModal");
    if (!modal || modal.classList.contains("hidden")) return;

    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = previousBodyOverflow;
    if (withdrawalTrigger?.isConnected) withdrawalTrigger.focus();
}


// ============================================================
// WITHDRAWAL PREVIEW
// ============================================================

function updateWithdrawalPreview() {
    const input = $("withdrawalAmount");
    if (!input) return;

    const amount = Math.max(0, Number(input.value || 0));
    const tax = calculatePlatformTax(amount);
    const fee = calculateWithdrawalFee(amount);
    const receive = Math.max(amount - tax - fee, 0);

    updateMoney("summaryGross", amount);
    updateMoney("summaryTax", tax);
    updateMoney("summaryFee", fee);
    updateMoney("summaryNet", receive);
}


// ============================================================
// FEE
// ============================================================

function calculateWithdrawalFee(amount) {

    return (
        Number(amount || 0) *
        Number(
            earningsSettings.withdrawalFeePercent || 0
        ) /
        100
    );

}

function calculatePlatformTax(amount) {
    return Number(amount || 0) * Number(earningsSettings.platformTaxPercent || 0) / 100;
}


// ============================================================
// SUBMIT WITHDRAWAL
// ============================================================

async function submitWithdrawal(event) {

    event.preventDefault();


    if (!currentInstructor) return;


    const amount =
        Number(
            $("withdrawalAmount")?.value || 0
        );


    const method = "M-Pesa";


    const account =
        $("withdrawalAccount")?.value.trim() || "";


    const minimum =
        Number(
            earningsSettings.minimumWithdrawal || 100
        );


    if (amount < minimum) {

        alert(
            `Minimum withdrawal is ${formatMoney(minimum)}.`
        );

        return;

    }


    if (amount > currentBalance) {

        alert(
            "Insufficient available balance."
        );

        return;

    }


    if (!method || !account) {

        alert(
            "Please complete your withdrawal details."
        );

        return;

    }


    const tax = calculatePlatformTax(amount);
    const fee = calculateWithdrawalFee(amount);
    const netAmount = Math.max(amount - tax - fee, 0);

    const normalizedPhone = account.replace(/[\\s-]/g, "");
    if (!/^(?:\\+?254|0)(?:7|1)\\d{8}$/.test(normalizedPhone)) {
        alert("Enter a valid Kenyan M-Pesa phone number.");
        return;
    }


    const button =
        $("confirmWithdrawalBtn");


    try {

        if (button) {

            button.disabled = true;

            button.textContent =
                "Submitting...";

        }


        await addDoc(
            collection(
                db,
                "withdrawalRequests"
            ),
            {

                instructorId:
                    currentInstructor.uid,

                amount,

                withdrawalFee:
                    fee,

                platformTax:
                    tax,

                netAmount,

                method,

                account,

                status:
                    "pending",

                createdAt:
                    serverTimestamp()

            }
        );


        alert(
            "Withdrawal request submitted successfully."
        );


        $("withdrawForm")?.reset();

        closeWithdrawalWindow();
        await loadEarnings();


    } catch (error) {

        console.error(
            "❌ Withdrawal failed:",
            error
        );

        alert(
            "Unable to submit withdrawal request."
        );


    } finally {

        if (button) {

            button.disabled = false;

            button.innerHTML = '<i data-lucide="shield-check"></i> Confirm Withdrawal';
            refreshIcons();

        }

    }

}


// ============================================================
// PREMIUM INSTRUCTOR
// ============================================================

function setupPremiumInstructor() {
    const button = $("premiumInstructorBtn");
    if (!button) return;

    const instructor = currentInstructor || {};
    const premium = instructor.instructorPremium === true || instructor.premiumInstructor === true;

    updateMoney("premiumPrice", earningsSettings.premiumMonthlyPrice);

    if (premium) {
        button.textContent = "Premium Active";
        button.disabled = true;
        button.classList.add("premium-active");
        return;
    }

    button.addEventListener("click", () => {
        window.location.href = "payments.html?upgrade=premium";
    });
}


// ============================================================
// EVENTS
// ============================================================

function setupEvents() {
    $("withdrawBtn")?.addEventListener("click", openWithdrawalWindow);
    $("heroWithdrawBtn")?.addEventListener("click", openWithdrawalWindow);
    $("closeWithdrawalModal")?.addEventListener("click", closeWithdrawalWindow);
    $("withdrawalAmount")?.addEventListener("input", updateWithdrawalPreview);
    $("withdrawForm")?.addEventListener("submit", submitWithdrawal);

    $("withdrawalModal")?.addEventListener("click", event => {
        if (event.target.classList.contains("modal-backdrop")) closeWithdrawalWindow();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !$("withdrawalModal")?.classList.contains("hidden")) {
            event.preventDefault();
            closeWithdrawalWindow();
        }
    });
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