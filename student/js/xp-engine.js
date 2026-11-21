// Spark Stack Academy — shared XP calculations.
// Pure helpers only: Firestore reads/writes and UI rendering live in achievements.js.
export const XP_REWARDS = Object.freeze({
    lesson: 20,
    quiz: 30,
    assignment: 40,
    course: 50,
    project: 75
});

export function calculateLevel(xp = 0) {
    return Math.floor(Math.max(0, Number(xp) || 0) / 100) + 1;
}

export function getLevelData(xp = 0) {
    const value = Math.max(0, Number(xp) || 0);
    const level = calculateLevel(value);
    const currentLevelXP = (level - 1) * 100;
    const nextLevelXP = level * 100;
    return {
        level,
        currentLevelXP,
        nextLevelXP,
        progress: Math.min(100, Math.round(((value - currentLevelXP) / 100) * 100))
    };
}

export function getLevelTitle(level = 1) {
    const titles = [
        "Spark Starter",
        "Curious Builder",
        "Growing Builder",
        "Skilled Builder",
        "Rising Builder",
        "Advanced Builder",
        "Expert Builder",
        "Elite Builder",
        "Master Builder",
        "Legend Builder"
    ];
    const index = Math.max(0, Math.min(titles.length - 1, Number(level) - 1));
    return titles[index] || titles[0];
}
