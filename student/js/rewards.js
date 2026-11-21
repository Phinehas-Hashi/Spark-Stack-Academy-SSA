// Shared student XP compatibility layer.
// All XP is stored on the canonical students/{uid} profile.
import { awardXP, XP_REWARDS, calculateLevel, getLevelData } from "./achievements.js";

export { XP_REWARDS };

export function getLevelFromXP(xp = 0) {
    return calculateLevel(xp);
}

export function getLevelProgress(xp = 0) {
    return getLevelData(xp).progress;
}

export async function giveReward(userId, amount, reason, source = "system") {
    return awardXP(userId, amount, reason || "Learning activity", source);
}
