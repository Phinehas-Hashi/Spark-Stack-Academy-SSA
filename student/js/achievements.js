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
    serverTimestamp,
    collection,
    query,
    orderBy,
    limit,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

import {
    XP_REWARDS,
    calculateLevel,
    getLevelData,
    getLevelTitle
} from "./xp-engine.js";


// ============================================================
// DOM HELPER
// ============================================================

const $ = id =>
    document.getElementById(id);

export { XP_REWARDS };


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

    assignment_starter: {
        icon: "📝",
        name: "Assignment Starter",
        description: "Submitted your first assignment."
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
            (xp - data.currentLevelXP).toLocaleString();

    }


    // NEXT LEVEL XP

    if ($("nextXP")) {

        $("nextXP").textContent =
            (data.nextLevelXP - data.currentLevelXP).toLocaleString();

    }


    // XP BAR

    if ($("xpProgress")) {

        $("xpProgress").style.width =
            `${data.progress}%`;

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

export async function awardXP(userId, amount, reason = "Learning activity", source = "system") {
    if (!userId || auth.currentUser?.uid !== userId) throw new Error("XP can only be awarded to the signed-in student.");
    const sourceKey = String(source || "").trim();
    if (!sourceKey) throw new Error("Missing learning activity source.");

    const award = httpsCallable(getFunctions(), "awardStudentXP");
    const response = await award({
        source: sourceKey,
        reason: String(reason || "Learning activity").slice(0, 180)
    });
    const result = response.data || {};

    if (result.duplicate) {
        if (result.student) await processBadges(userId, result.student);
        return {
            duplicate: true,
            xp: Number(result.student?.xp || result.xp || 0),
            level: Number(result.student?.level || result.level || 1)
        };
    }

    if (result.student) {
        await processBadges(userId, result.student);
    }
    return result;
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


    // ASSIGNMENTS
    if (Number(student.assignmentsSubmitted || 0) >= 1) eligible.push("assignment_starter");

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


    const eligible = getEligibleBadges(student);

    // Count quiz completion events without exposing other student profiles.
    if (!eligible.includes("quiz_master")) {
        try {
            const activitySnapshot = await getDocs(query(
                collection(db, "students", userId, "activity"),
                where("type", "==", "xp_earned"),
                limit(100)
            ));
            const quizCount = activitySnapshot.docs.filter(item =>
                String(item.data().source || "").startsWith("quiz_")
            ).length;
            if (quizCount >= 10) eligible.push("quiz_master");
        } catch (error) {
            console.warn("Quiz badge count could not be refreshed:", error);
        }
    }


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

        $("statBadges").textContent =
            unlocked.length;

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
    const container = document.querySelector(".leaderboard");
    if (container) container.innerHTML = '<div class="leaderboard-message">Loading verified rankings…</div>';
    try {
        const snapshot = await getDocs(query(collection(db, "leaderboardPublic"), orderBy("xp", "desc"), limit(10)));
        const leaders = snapshot.docs.map((item, index) => ({ id: item.id, rank: index + 1, ...item.data() }));
        renderLeaderboard(leaders);
        await renderCurrentUserRank();
    } catch (error) {
        console.warn("Verified leaderboard is not available:", error);
        if (container) container.innerHTML = '<div class="leaderboard-message">Global rankings are waiting for the secure leaderboard service to be enabled. Your personal XP and badges remain available.</div>';
        if ($("rankPosition")) $("rankPosition").textContent = "—";
        if ($("ranknumber")) $("ranknumber").textContent = "Not ranked";
    }
}


// CURRENT USER RANK — PUBLIC OPT-IN ENTRIES ONLY
async function renderCurrentUserRank() {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const ownEntry = await getDoc(doc(db, "leaderboardPublic", user.uid));
        if (!ownEntry.exists()) {
            if ($("rankPosition")) $("rankPosition").textContent = "—";
            if ($("ranknumber")) $("ranknumber").textContent = "Not ranked";
            return;
        }
        const currentXP = Number(ownEntry.data().xp || 0);
        const higher = await getDocs(query(collection(db, "leaderboardPublic"), where("xp", ">", currentXP)));
        const rank = higher.size + 1;
        if ($("rankPosition")) $("rankPosition").textContent = "#" + rank;
        if ($("ranknumber")) $("ranknumber").textContent = "#" + rank;
    } catch (error) {
        console.warn("Personal public rank unavailable:", error);
        if ($("rankPosition")) $("rankPosition").textContent = "—";
        if ($("ranknumber")) $("ranknumber").textContent = "Not ranked";
    }
}


// ============================================================
// RENDER LEADERBOARD
// ============================================================

function escapeHTML(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

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

            <div class="leaderboard-message">The ranking board is ready. Verified rankings will appear when the secure public leaderboard is connected.</div>

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
                student.publicName ||
                student.displayName ||
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

        console.error(
            "❌ Recent activity error:",
            error
        );

    }

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

            console.warn(
                "Student profile not found."
            );

            return;

        }


        const student =
            snapshot.data();

        const displayName = student.displayName || student.name || student.fullName || user.displayName || "Builder";
        if ($("achievementStudentName")) $("achievementStudentName").textContent = displayName;
        if ($("achievementStudentAvatar")) $("achievementStudentAvatar").textContent = displayName.trim().charAt(0).toUpperCase() || "S";

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


        if (document.querySelector(".achievements-page")) {
            await loadAchievementOS(user);
        }

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