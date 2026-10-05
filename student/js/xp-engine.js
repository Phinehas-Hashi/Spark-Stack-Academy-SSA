// ============================================================
// SPARK STACK ACADEMY
// ACHIEVEMENT OS V3
// BADGES • STREAKS • LEADERBOARD • ACTIVITY
// ============================================================

import {
    db,
    auth
} from "../../js/firebase.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
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


// ============================================================
// DOM HELPER
// ============================================================

const $ = id => document.getElementById(id);

export const XP_REWARDS = Object.freeze({ lesson: 20, quiz: 30, assignment: 40, course: 50, project: 75 });

export function calculateLevel(xp = 0) {
    return Math.floor(Math.max(0, Number(xp) || 0) / 100) + 1;
}

export function getLevelData(xp = 0) {
    const value = Math.max(0, Number(xp) || 0);
    const level = calculateLevel(value);
    const currentLevelXP = (level - 1) * 100;
    const nextLevelXP = level * 100;
    return { level, currentLevelXP, nextLevelXP, progress: Math.min(100, Math.round(((value - currentLevelXP) / 100) * 100)) };
}

export function getLevelTitle(level = 1) {
    const titles = ["Spark Starter", "Curious Builder", "Growing Builder", "Skilled Builder", "Rising Builder", "Advanced Builder", "Expert Builder", "Elite Builder", "Master Builder", "Legend Builder"];
    return titles[Math.max(0, Math.min(titles.length - 1, Number(level) - 1))] || titles[0];
}


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
// ACTIVITY ENGINE
// ============================================================

async function createActivity(userId, data) {

    if (!userId)
        return;

    try {

        const activityRef = doc(
            collection(
                db,
                "students",
                userId,
                "activity"
            )
        );

        await setDoc(
            activityRef,
            {
                ...data,
                createdAt: serverTimestamp()
            }
        );

    }

    catch (error) {

        console.error(
            "❌ Activity write failed:",
            error
        );

    }

}


// ============================================================
// STREAK ENGINE
// ============================================================

export async function updateLearningStreak(userId) {

    if (!userId)
        return 0;

    try {

        const studentRef = doc(
            db,
            "students",
            userId
        );

        const snapshot = await getDoc(
            studentRef
        );

        if (!snapshot.exists())
            return 0;

        const student = snapshot.data();

        const today =
            new Date()
                .toISOString()
                .split("T")[0];

        const lastActive =
            student.lastActiveDate || null;

        let streak =
            Number(student.streak || 0);


        // ----------------------------------------------------
        // FIRST ACTIVITY
        // ----------------------------------------------------

        if (!lastActive) {

            streak = 1;

        }


        // ----------------------------------------------------
        // ALREADY ACTIVE TODAY
        // ----------------------------------------------------

        else if (
            lastActive === today
        ) {

            return streak;

        }


        // ----------------------------------------------------
        // NEW DAY
        // ----------------------------------------------------

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
                        current - previous
                    ) / 86400000
                );


            if (difference === 1) {

                streak++;

            }

            else {

                streak = 1;

            }

        }


        // ----------------------------------------------------
        // SAVE STREAK
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // BADGES
        // ----------------------------------------------------

        await processBadges(
            userId,
            {
                ...student,
                streak
            }
        );


        return streak;

    }

    catch (error) {

        console.error(
            "❌ Streak update failed:",
            error
        );

        return 0;

    }

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

    if (lessons >= 1)
        eligible.push("first_lesson");


    // FIRST QUIZ

    if (quizzes >= 1)
        eligible.push("first_quiz");


    // QUIZ MASTER

    if (quizzes >= 10)
        eligible.push("quiz_master");


    // FIRST COURSE

    if (courses >= 1)
        eligible.push("first_course");


    // CODER

    if (
        student.codingStarted === true ||
        student.skill === "coding"
    ) {

        eligible.push("coder");

    }


    // PROJECT BUILDER

    if (projects >= 1)
        eligible.push("project_builder");


    // STREAKS

    if (streak >= 7)
        eligible.push("streak_7");

    if (streak >= 30)
        eligible.push("streak_30");


    // LEVELS

    if (level >= 5)
        eligible.push("level_5");

    if (level >= 10)
        eligible.push("level_10");


    return eligible;

}


// ============================================================
// BADGE PROCESSOR
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
                !existing.includes(badge)
        );


    if (!newBadges.length)
        return existing;


    const updatedBadges = [
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
            badges: updatedBadges
        }
    );


    for (const badgeId of newBadges) {

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
            `🏆 Badge unlocked: ${badge.name}`
        );

    }


    return updatedBadges;

}


// ============================================================
// RENDER LEVEL
// ============================================================

function renderLevel(student) {

    const xp =
        Number(student.xp || 0);

    const levelData =
        getLevelData(xp);

    const title =
        getLevelTitle(
            levelData.level
        );


    if ($("studentLevel")) {

        $("studentLevel").textContent =
            levelData.level;

    }


    if ($("studentXP")) {

        $("studentXP").textContent =
            xp.toLocaleString();

    }


    if ($("nextXP")) {

        $("nextXP").textContent =
            levelData.nextLevelXP.toLocaleString();

    }


    if ($("xpProgress")) {

        $("xpProgress").style.width =
            `${levelData.progress}%`;

    }


    if ($("statXP")) {

        $("statXP").textContent =
            xp.toLocaleString();

    }


    if ($("studentRank")) {

        $("studentRank").textContent =
            title;

    }

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


    Object.entries(BADGES).forEach(
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


            container.appendChild(card);

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

    try {

        const studentsRef =
            collection(
                db,
                "students"
            );


        const leaderboardQuery =
            query(
                studentsRef,
                orderBy(
                    "xp",
                    "desc"
                ),
                limit(10)
            );


        const snapshot =
            await getDocs(
                leaderboardQuery
            );


        const leaders =
            snapshot.docs.map(
                (item, index) => ({

                    id:
                        item.id,

                    rank:
                        index + 1,

                    ...item.data()

                })
            );


        renderLeaderboard(
            leaders
        );


        await renderCurrentUserRank();

    }

    catch (error) {

        console.error(
            "❌ Leaderboard error:",
            error
        );

    }

}


// ============================================================
// CURRENT USER RANK
// ============================================================

async function renderCurrentUserRank() {

    const user =
        auth.currentUser;

    if (!user)
        return;


    try {

        const currentStudent =
            await getDoc(
                doc(
                    db,
                    "students",
                    user.uid
                )
            );


        if (!currentStudent.exists())
            return;


        const currentXP =
            Number(
                currentStudent.data().xp || 0
            );


        const snapshot =
            await getDocs(
                collection(
                    db,
                    "students"
                )
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


                if (xp > currentXP) {

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

    catch (error) {

        console.error(
            "❌ Rank calculation failed:",
            error
        );

    }

}


// ============================================================
// RENDER LEADERBOARD
// ============================================================

function renderLeaderboard(leaders) {

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

                    ${escapeHTML(name)}

                </span>

                <strong>

                    ⚡
                    ${Number(
                        student.xp || 0
                    ).toLocaleString()}
                    XP

                </strong>

            `;


            container.appendChild(card);

        }
    );

}


// ============================================================
// RECENT ACTIVITY
// ============================================================

async function loadRecentActivity(userId) {

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


                switch (
                    activity.type
                ) {

                    case "xp_earned":

                        icon = "⚡";

                        title =
                            `+${activity.amount} XP`;

                        description =
                            activity.reason ||
                            "Learning activity";

                        break;


                    case "level_up":

                        icon = "🎉";

                        title =
                            `Level ${activity.to} reached`;

                        description =
                            `You advanced from Level ${activity.from}.`;

                        break;


                    case "badge_unlocked":

                        icon = "🏆";

                        title =
                            activity.badgeName ||
                            "Badge unlocked";

                        description =
                            "New achievement unlocked.";

                        break;

                }


                item.innerHTML = `

                    <span class="recent-icon">

                        ${icon}

                    </span>

                    <div>

                        <strong>

                            ${escapeHTML(title)}

                        </strong>

                        <p>

                            ${escapeHTML(description)}

                        </p>

                    </div>

                `;


                container.appendChild(item);

            }
        );

    }

    catch (error) {

        console.error(
            "❌ Recent activity error:",
            error
        );

    }

}


// ============================================================
// LOAD ACHIEVEMENT OS
// ============================================================

async function loadAchievementOS(user) {

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
                "⚠️ Student profile not found."
            );

            return;

        }


        const student =
            snapshot.data();


        renderLevel(
            student
        );

        renderStreak(
            student
        );

        renderBadges(
            student
        );

        renderFeaturedBadge(
            student
        );


        await loadLeaderboard();

        await loadRecentActivity(
            user.uid
        );


        console.log(
            "🚀 Achievement OS ready"
        );

    }

    catch (error) {

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

    updateLearningStreak,

    calculateLevel,

    getLevelData,

    getLevelTitle,

    reload: () => {

        if (!auth.currentUser)
            return null;

        return loadAchievementOS(
            auth.currentUser
        );

    }

};


// ============================================================
// READY
// ============================================================

console.log(
    "🚀 Spark Achievement OS V3 loaded"
);