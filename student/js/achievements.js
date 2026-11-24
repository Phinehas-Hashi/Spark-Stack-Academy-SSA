// ============================================================
// SPARK STACK ACADEMY
// ACHIEVEMENT OS V3
// CORE GAMIFICATION ENGINE
// ============================================================

import {
    db,
    auth
} from "../../js/firebase.js";

import {
    doc,
    getDoc,
    updateDoc,
    increment,
    serverTimestamp,
    collection,
    query,
    orderBy,
    limit,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    calculateLevel,
    getLevelData,
    getLevelTitle
} from "./xp-engine.js";


// ============================================================
// DOM HELPER
// ============================================================

const $ = id =>
    document.getElementById(id);


// ============================================================
// BADGE DEFINITIONS
// ============================================================

const BADGES = {

    first_lesson: {
        icon: "📚",
        name: "First Spark",
        description: "Completed your first lesson."
    },

    first_quiz: {
        icon: "🧠",
        name: "Quiz Starter",
        description: "Completed your first quiz."
    },

    quiz_master: {
        icon: "🎯",
        name: "Quiz Master",
        description: "Completed 10 quizzes."
    },

    first_course: {
        icon: "🌱",
        name: "First Builder",
        description: "Completed your first course."
    },

    coder: {
        icon: "💻",
        name: "Code Builder",
        description: "Started your coding journey."
    },

    project_builder: {
        icon: "🚀",
        name: "Project Builder",
        description: "Submitted your first project."
    },

    streak_7: {
        icon: "🔥",
        name: "7 Day Flame",
        description: "Maintained a 7-day learning streak."
    },

    streak_30: {
        icon: "⚡",
        name: "30 Day Storm",
        description: "Maintained a 30-day learning streak."
    },

    level_5: {
        icon: "🏆",
        name: "Rising Builder",
        description: "Reached Level 5."
    },

    level_10: {
        icon: "👑",
        name: "Elite Builder",
        description: "Reached Level 10."
    }

};


// ============================================================
// RENDER LEVEL
// ============================================================

function renderLevel(student) {

    const xp =
        Number(student.xp || 0);

    const data =
        getLevelData(xp);

    const title =
        getLevelTitle(data.level);


    // LEVEL

    if ($("studentLevel")) {

        $("studentLevel").textContent =
            data.level;

    }


    // CURRENT XP

    if ($("studentXP")) {

        $("studentXP").textContent =
            xp.toLocaleString();

    }


    // NEXT LEVEL XP

    if ($("nextXP")) {

        $("nextXP").textContent =
            data.nextLevelXP.toLocaleString();

    }


    // XP BAR

    if ($("xpProgress")) {
        const progress = Math.min(100, Math.max(0, Number(data.progress) || 0));
        $("xpProgress").style.width = `${progress}%`;
        const progressTrack = $("xpProgress").closest('[role="progressbar"]');
        progressTrack?.setAttribute("aria-valuenow", String(Math.round(progress)));
    }


    // TOTAL XP

    if ($("statXP")) {

        $("statXP").textContent =
            xp.toLocaleString();

    }


    // RANK / LEVEL TITLE

    if ($("studentRank")) {

        $("studentRank").textContent =
            title;

    }


    console.log(
        `⚡ Level ${data.level} — ${title} — ${xp} XP`
    );

}


// ============================================================
// AWARD XP
// ============================================================

export async function awardXP(
    userId,
    amount,
    reason = "Learning activity",
    source = "system"
) {

    if (!userId) {

        throw new Error(
            "Missing user ID."
        );

    }


    amount =
        Number(amount);


    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {

        throw new Error(
            "Invalid XP amount."
        );

    }


    const studentRef =
        doc(
            db,
            "students",
            userId
        );


    const snapshot =
        await getDoc(
            studentRef
        );


    if (!snapshot.exists()) {

        throw new Error(
            "Student profile not found."
        );

    }


    const student =
        snapshot.data();


    const oldXP =
        Number(student.xp || 0);

    const oldLevel =
        calculateLevel(oldXP);


    const newXP =
        oldXP + amount;

    const newLevel =
        calculateLevel(newXP);


    // ========================================================
    // UPDATE STUDENT XP
    // ========================================================

    await updateDoc(
        studentRef,
        {

            xp:
                increment(amount),

            lastXPReward:
                serverTimestamp(),

            lastXPReason:
                reason

        }
    );


    // ========================================================
    // XP ACTIVITY
    // ========================================================

    await createActivity(
        userId,
        {

            type:
                "xp_earned",

            amount,

            reason,

            source,

            previousXP:
                oldXP,

            newXP,

            previousLevel:
                oldLevel,

            newLevel

        }
    );


    // ========================================================
    // LEVEL UP
    // ========================================================

    if (newLevel > oldLevel) {

        await handleLevelUp(
            userId,
            oldLevel,
            newLevel
        );

    }


    // ========================================================
    // BADGES
    // ========================================================

    await processBadges(
        userId,
        {
            ...student,
            xp: newXP
        }
    );


    return {

        xpAdded:
            amount,

        oldXP,

        newXP,

        oldLevel,

        newLevel,

        levelUp:
            newLevel > oldLevel

    };

}


// ============================================================
// ACTIVITY CREATOR
// ============================================================

async function createActivity(
    userId,
    data
) {

    await updateActivityCollection(
        userId,
        data
    );

}


// ============================================================
// WRITE ACTIVITY
// ============================================================

async function updateActivityCollection(
    userId,
    data
) {

    const activityRef =
        doc(
            collection(
                db,
                "students",
                userId,
                "activity"
            )
        );


    await updateDocSafe(
        activityRef,
        {

            ...data,

            createdAt:
                serverTimestamp()

        }
    );

}


// ============================================================
// SAFE ACTIVITY WRITE
// ============================================================

async function updateDocSafe(
    reference,
    data
) {

    const {
        setDoc
    } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );


    await setDoc(
        reference,
        data
    );

}


// ============================================================
// LEVEL UP
// ============================================================

async function handleLevelUp(
    userId,
    oldLevel,
    newLevel
) {

    const studentRef =
        doc(
            db,
            "students",
            userId
        );


    await updateDoc(
        studentRef,
        {

            lastLevelUp:
                newLevel,

            lastLevelUpAt:
                serverTimestamp()

        }
    );


    await createActivity(
        userId,
        {

            type:
                "level_up",

            from:
                oldLevel,

            to:
                newLevel

        }
    );


    console.log(
        `🎉 LEVEL UP: ${oldLevel} → ${newLevel}`
    );

}


// ============================================================
// LEARNING STREAK
// ============================================================

export async function updateLearningStreak(
    userId
) {

    const studentRef =
        doc(
            db,
            "students",
            userId
        );


    const snapshot =
        await getDoc(
            studentRef
        );


    if (!snapshot.exists())
        return 0;


    const student =
        snapshot.data();


    const today =
        new Date()
            .toISOString()
            .split("T")[0];


    const lastActive =
        student.lastActiveDate || null;


    let streak =
        Number(
            student.streak || 0
        );


    // First activity

    if (!lastActive) {

        streak = 1;

    }


    // Already active today

    else if (
        lastActive === today
    ) {

        return streak;

    }


    // New day

    else {

        const previous =
            new Date(
                `${lastActive}T00:00:00`
            );

        const current =
            new Date(
                `${today}T00:00:00`
            );


        const difference =
            Math.floor(
                (
                    current -
                    previous
                ) / 86400000
            );


        if (difference === 1) {

            streak++;

        }

        else {

            streak = 1;

        }

    }


    await updateDoc(
        studentRef,
        {

            streak,

            lastActiveDate:
                today,

            lastActiveAt:
                serverTimestamp()

        }
    );


    await processBadges(
        userId,
        {
            ...student,
            streak
        }
    );


    return streak;

}


// ============================================================
// BADGE ELIGIBILITY
// ============================================================

function getEligibleBadges(student) {

    const eligible = [];


    const xp =
        Number(student.xp || 0);

    const level =
        calculateLevel(xp);


    const streak =
        Number(student.streak || 0);


    const lessons =
        Number(
            student.lessonsCompleted ??
            student.completedLessonsCount ??
            0
        );


    const quizzes =
        Number(
            student.quizzesCompleted ??
            student.completedQuizzes ??
            0
        );


    const courses =
        Number(
            student.coursesCompleted ??
            student.completedCourses ??
            0
        );


    const projects =
        Number(
            student.projectsSubmitted ??
            student.completedProjects ??
            0
        );


    // FIRST LESSON

    if (lessons >= 1) {

        eligible.push(
            "first_lesson"
        );

    }


    // FIRST QUIZ

    if (quizzes >= 1) {

        eligible.push(
            "first_quiz"
        );

    }


    // QUIZ MASTER

    if (quizzes >= 10) {

        eligible.push(
            "quiz_master"
        );

    }


    // FIRST COURSE

    if (courses >= 1) {

        eligible.push(
            "first_course"
        );

    }


    // CODER

    if (
        student.codingStarted === true ||
        student.skill === "coding"
    ) {

        eligible.push(
            "coder"
        );

    }


    // PROJECT

    if (projects >= 1) {

        eligible.push(
            "project_builder"
        );

    }


    // STREAKS

    if (streak >= 7) {

        eligible.push(
            "streak_7"
        );

    }


    if (streak >= 30) {

        eligible.push(
            "streak_30"
        );

    }


    // LEVELS

    if (level >= 5) {

        eligible.push(
            "level_5"
        );

    }


    if (level >= 10) {

        eligible.push(
            "level_10"
        );

    }


    return eligible;

}


// ============================================================
// PROCESS BADGES
// ============================================================

async function processBadges(
    userId,
    student
) {

    const existing =
        Array.isArray(student.badges)
            ? student.badges
            : [];


    const eligible =
        getEligibleBadges(student);


    const newBadges =
        eligible.filter(
            badge =>
                !existing.includes(
                    badge
                )
        );


    if (!newBadges.length) {

        return existing;

    }


    const updated =
        [
            ...existing,
            ...newBadges
        ];


    const studentRef =
        doc(
            db,
            "students",
            userId
        );


    await updateDoc(
        studentRef,
        {

            badges:
                updated

        }
    );


    // ========================================================
    // CREATE BADGE ACTIVITY
    // ========================================================

    for (
        const badgeId
        of newBadges
    ) {

        const badge =
            BADGES[badgeId];


        if (!badge)
            continue;


        await createActivity(
            userId,
            {

                type:
                    "badge_unlocked",

                badgeId,

                badgeName:
                    badge.name

            }
        );


        console.log(
            `🏆 BADGE UNLOCKED: ${badge.name}`
        );

    }


    return updated;

}


// ============================================================
// RENDER BADGES
// ============================================================

function renderBadges(student) {

    const container =
        $("badgeContainer");


    if (!container)
        return;


    const unlocked =
        Array.isArray(student.badges)
            ? student.badges
            : [];


    container.innerHTML = "";
    container.setAttribute("aria-busy", "false");


    Object.entries(BADGES)
        .forEach(
            ([id, badge]) => {

                const isUnlocked =
                    unlocked.includes(id);


                const card =
                    document.createElement(
                        "article"
                    );


                card.className =
                    `badge-item ${
                        isUnlocked
                            ? "unlocked"
                            : "locked"
                    }`;


                card.innerHTML = `

                    <div class="badge-icon">

                        ${
                            isUnlocked
                                ? badge.icon
                                : "🔒"
                        }

                    </div>

                    <h3>

                        ${
                            isUnlocked
                                ? badge.name
                                : "Locked Achievement"
                        }

                    </h3>

                    <p>

                        ${
                            isUnlocked
                                ? badge.description
                                : "Keep learning to unlock this."
                        }

                    </p>

                    <small>

                        ${
                            isUnlocked
                                ? "✓ UNLOCKED"
                                : "LOCKED"
                        }

                    </small>

                `;


                container.appendChild(
                    card
                );

            }
        );


    if ($("statBadges")) {
        $("statBadges").textContent = String(unlocked.length);
    }

}


// ============================================================
// FEATURED BADGE
// ============================================================

function renderFeaturedBadge(student) {

    const element =
        $("featuredBadgeName");


    if (!element)
        return;


    const badges =
        Array.isArray(student.badges)
            ? student.badges
            : [];


    if (!badges.length) {

        element.textContent =
            "No Badge Yet";

        return;

    }


    const latestBadge =
        badges[badges.length - 1];


    const badge =
        BADGES[latestBadge];


    element.textContent =
        badge
            ? badge.name
            : "Achievement Unlocked";

}


// ============================================================
// RENDER STREAK
// ============================================================

function renderStreak(student) {

    const streak =
        Number(
            student.streak || 0
        );


    if ($("streakDays")) {

        $("streakDays").textContent =
            streak;

    }

}


// ============================================================
// LEADERBOARD
// ============================================================

async function loadLeaderboard() {
    // Firestore rules intentionally restrict listing student profiles to staff.
    // Do not attempt a client-side collection read or expose other students' data.
    const container = document.querySelector(".leaderboard");
    if (container) {
        container.innerHTML = `
            <div class="empty-state" role="status">
                Academy rankings are currently private. Your personal XP and level remain available above.
            </div>
        `;
        container.setAttribute("aria-busy", "false");
    }

    if ($("rankPosition")) $("rankPosition").textContent = "Private";
    if ($("rankNumber")) $("rankNumber").textContent = "Private";
}


// ============================================================
// CURRENT USER RANK
// ============================================================

async function renderCurrentUserRank() {

    const user =
        auth.currentUser;


    if (!user)
        return;


    const currentStudentRef =
        doc(
            db,
            "students",
            user.uid
        );


    const currentSnapshot =
        await getDoc(
            currentStudentRef
        );


    if (!currentSnapshot.exists())
        return;


    const currentXP =
        Number(
            currentSnapshot.data().xp || 0
        );


    const studentsRef =
        collection(
            db,
            "students"
        );


    const snapshot =
        await getDocs(
            studentsRef
        );


    let rank = 1;


    snapshot.forEach(
        studentDoc => {

            if (
                studentDoc.id ===
                user.uid
            ) {

                return;

            }


            const xp =
                Number(
                    studentDoc.data().xp || 0
                );


            if (
                xp > currentXP
            ) {

                rank++;

            }

        }
    );


    if ($("rankPosition")) {

        $("rankPosition").textContent =
            `#${rank}`;

    }


    if ($("rankNumber")) {

        $("rankNumber").textContent =
            `#${rank}`;

    }

}


// ============================================================
// RENDER LEADERBOARD
// ============================================================

function renderLeaderboard(
    leaders
) {

    const container =
        document.querySelector(
            ".leaderboard"
        );


    if (!container)
        return;


    container.innerHTML = "";


    if (!leaders.length) {

        container.innerHTML = `

            <div class="empty-state">

                No builders ranked yet.

            </div>

        `;

        return;

    }


    leaders.forEach(
        (student, index) => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                `leader-card ${
                    index === 0
                        ? "first"
                        : ""
                }`;


            const name =
                student.displayName ||
                student.name ||
                "Student";


            const avatar =
                index === 0
                    ? "👑"
                    : index === 1
                        ? "🔥"
                        : "⚡";


            card.innerHTML = `

                <span class="leader-rank">

                    ${String(
                        index + 1
                    ).padStart(2, "0")}

                </span>


                <div class="leader-avatar">

                    ${avatar}

                </div>


                <span>

                    ${escapeHTML(
                        name
                    )}

                </span>


                <strong>

                    ⚡
                    ${Number(
                        student.xp || 0
                    ).toLocaleString()}
                    XP

                </strong>

            `;


            container.appendChild(
                card
            );

        }
    );

}


// ============================================================
// RECENT ACTIVITY
// ============================================================

async function loadRecentActivity(
    userId
) {

    const container =
        $("recentUnlocks");


    if (!container)
        return;


    try {

        const activityRef =
            collection(
                db,
                "students",
                userId,
                "activity"
            );


        const activityQuery =
            query(
                activityRef,
                orderBy(
                    "createdAt",
                    "desc"
                ),
                limit(8)
            );


        const snapshot =
            await getDocs(
                activityQuery
            );


        container.innerHTML = "";


        if (snapshot.empty) {

            container.innerHTML = `

                <div class="empty-state">

                    Your achievements will appear here.

                </div>

            `;

            return;

        }


        snapshot.forEach(
            activityDoc => {

                const activity =
                    activityDoc.data();


                const item =
                    document.createElement(
                        "div"
                    );


                item.className =
                    "recent-item";


                let icon = "⚡";
                let title = "Activity";
                let description = "";


                if (
                    activity.type ===
                    "xp_earned"
                ) {

                    icon = "⚡";

                    title =
                        `+${activity.amount} XP`;

                    description =
                        activity.reason ||
                        "Learning activity";

                }


                else if (
                    activity.type ===
                    "level_up"
                ) {

                    icon = "🎉";

                    title =
                        `Level ${activity.to} reached`;

                    description =
                        `You advanced from Level ${activity.from}.`;

                }


                else if (
                    activity.type ===
                    "badge_unlocked"
                ) {

                    icon = "🏆";

                    title =
                        activity.badgeName ||
                        "Badge unlocked";

                    description =
                        "New achievement unlocked.";

                }


                item.innerHTML = `

                    <span class="recent-icon">

                        ${icon}

                    </span>


                    <div>

                        <strong>

                            ${escapeHTML(
                                title
                            )}

                        </strong>


                        <p>

                            ${escapeHTML(
                                description
                            )}

                        </p>

                    </div>

                `;


                container.appendChild(
                    item
                );

            }
        );

    }

    catch(error) {
        console.error("Recent activity error:", error);
        container.innerHTML = `
            <div class="empty-state" role="status">
                Recent activity is temporarily unavailable.
            </div>
        `;
        container.setAttribute("aria-busy", "false");
    }

}



function showAchievementProfileUnavailable() {
    const messages = {
        badgeContainer: "Your achievement record is not available yet.",
        recentUnlocks: "Your activity will appear here when your student profile is ready."
    };

    Object.entries(messages).forEach(([id, message]) => {
        const container = $(id);
        if (!container) return;
        container.textContent = message;
        container.setAttribute("aria-busy", "false");
    });

    const leaderboard = document.querySelector(".leaderboard");
    if (leaderboard) {
        leaderboard.textContent = "Academy rankings are currently private.";
        leaderboard.setAttribute("aria-busy", "false");
    }

    ["studentLevel", "studentXP", "statXP", "statBadges", "streakDays"].forEach(id => {
        const element = $(id);
        if (element) element.textContent = "—";
    });

    if ($("studentRank")) $("studentRank").textContent = "Profile unavailable";
    if ($("featuredBadgeName")) $("featuredBadgeName").textContent = "No achievement record";
    if ($("rankPosition")) $("rankPosition").textContent = "Private";
    if ($("rankNumber")) $("rankNumber").textContent = "Private";
}

// ============================================================
// LOAD ACHIEVEMENT OS
// ============================================================

async function loadAchievementOS(
    user
) {

    try {

        console.log(
            "⚡ Loading Achievement OS..."
        );


        const studentRef =
            doc(
                db,
                "students",
                user.uid
            );


        const snapshot =
            await getDoc(
                studentRef
            );


        if (!snapshot.exists()) {
            console.warn("Student profile not found.");
            showAchievementProfileUnavailable();
            return;
        }


        const student =
            snapshot.data();


        // CORE

        renderLevel(
            student
        );


        renderStreak(
            student
        );


        // BADGES

        renderBadges(
            student
        );


        renderFeaturedBadge(
            student
        );


        // RANKINGS

        await loadLeaderboard();


        // ACTIVITY

        await loadRecentActivity(
            user.uid
        );

        ["badgeContainer", "recentUnlocks"].forEach(id => {
            $(id)?.setAttribute("aria-busy", "false");
        });

        console.log(
            "🚀 Achievement OS ready"
        );

    }

    catch(error) {

        console.error(
            "❌ Achievement OS failed:",
            error
        );

    }

}


// ============================================================
// AUTH
// ============================================================

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            console.log(
                "🔐 No authenticated student."
            );

            return;

        }


        await loadAchievementOS(
            user
        );

    }
);


// ============================================================
// GLOBAL API
// ============================================================

window.SparkAchievements = {

    awardXP,

    updateLearningStreak,

    calculateLevel,

    getLevelData,

    getLevelTitle,

    reload: () => {

        if (
            auth.currentUser
        ) {

            return loadAchievementOS(
                auth.currentUser
            );

        }

        return null;

    }

};


console.log(
    "🚀 Spark Achievement OS V3 loaded"
);