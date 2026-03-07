import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

/** XP per level threshold. level = floor(totalXP / XP_PER_LEVEL) + 1 */
export const XP_PER_LEVEL = 200;

/** XP rewards */
export const XP_CORRECT = 20;
export const XP_PARTIAL = 10;
export const XP_WRONG = 0;
export const XP_STREAK_BONUS = 50;
export const STREAK_REQUIRED = 5;
export const PARTIAL_CONFIDENCE_THRESHOLD = 0.7;

/** Timed mode XP rewards (speed-based) */
export const XP_TIMED_FAST = 20; // < 3 seconds
export const XP_TIMED_MEDIUM = 15; // < 5 seconds
export const XP_TIMED_BASE = 10; // >= 5 seconds

/** Game IDs unlocked by level (level 1 = basic, 2 = timed, etc.) */
export const GAME_IDS_BY_LEVEL = ['basic', 'timed', 'similar', 'speed', 'mixed'];

/**
 * Get level and current level XP from total XP
 * level = floor(totalXP / 200) + 1
 * currentLevelXP = total XP within current level (0 to XP_PER_LEVEL - 1)
 */
export function getLevelFromTotalXP(totalXP) {
  const total = Math.max(0, totalXP);
  const level = Math.floor(total / XP_PER_LEVEL) + 1;
  const currentLevelXP = total % XP_PER_LEVEL;
  const xpForNextLevel = XP_PER_LEVEL - currentLevelXP;
  return { level, currentLevelXP, xpForNextLevel };
}

/**
 * Get list of unlocked game IDs for a given level
 */
export function getUnlockedGamesForLevel(level) {
  const l = Math.max(1, level);
  return GAME_IDS_BY_LEVEL.slice(0, Math.min(l, GAME_IDS_BY_LEVEL.length));
}

const DEFAULT_PROGRESS = {
  totalXP: 0,
  level: 1,
  currentLevelXP: 0,
  gamesPlayed: 0,
  correctAnswers: 0,
  streakCount: 0,
  unlockedGames: ['basic'],
  updatedAt: null,
};

/**
 * Get child progress document from Firestore (collection: children, docId: childId)
 * @param {string} childId - Child UID
 * @returns {Promise<Object|null>} Progress object or null
 */
export async function getChildProgress(childId) {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - getChildProgress');
      return { ...DEFAULT_PROGRESS };
    }
    if (!childId) return null;
    const ref = doc(db, 'children', childId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { ...DEFAULT_PROGRESS };
    }
    const data = snap.data();
    const totalXP = data.totalXP ?? 0;
    const { level, currentLevelXP, xpForNextLevel } = getLevelFromTotalXP(totalXP);
    return {
      id: snap.id,
      totalXP,
      level,
      currentLevelXP,
      xpForNextLevel,
      gamesPlayed: data.gamesPlayed ?? 0,
      correctAnswers: data.correctAnswers ?? 0,
      streakCount: data.streakCount ?? 0,
      unlockedGames: Array.isArray(data.unlockedGames) ? data.unlockedGames : ['basic'],
      updatedAt: data.updatedAt ?? null,
    };
  } catch (error) {
    console.error('❌ getChildProgress:', error);
    throw error;
  }
}

/**
 * Ensure child has a progress document; create with defaults if missing
 * @param {string} childId
 * @returns {Promise<Object>} Current progress
 */
export async function ensureChildProgress(childId) {
  if (!db || !childId) return { ...DEFAULT_PROGRESS };
  const ref = doc(db, 'children', childId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return getChildProgress(childId);
  }
  const { level, currentLevelXP } = getLevelFromTotalXP(0);
  await setDoc(ref, {
    totalXP: 0,
    level: 1,
    currentLevelXP: 0,
    gamesPlayed: 0,
    correctAnswers: 0,
    streakCount: 0,
    unlockedGames: ['basic'],
    updatedAt: serverTimestamp(),
  });
  return getChildProgress(childId);
}

/**
 * Add XP after an answer and update Firestore atomically.
 * Uses runTransaction + updateDoc() + increment() to avoid race conditions.
 * Rules: 
 *   - Basic mode: correct +20, wrong +0. 5 correct in a row +50 bonus.
 *   - Timed mode: correct +10-20 (speed-based), wrong +0. No streak bonus in timed mode.
 * @param {string} childId
 * @param {Object} options - { correct: boolean, confidence?: number, timedModeXP?: number }
 * @returns {Promise<{ progress: Object, xpGained: number, leveledUp: boolean, newLevel?: number }>}
 */
export async function addXP(childId, options = {}) {
  const { correct = false, confidence = 0, timedModeXP = null } = options;
  if (!db || !childId) {
    return { progress: { ...DEFAULT_PROGRESS }, xpGained: 0, leveledUp: false };
  }

  const ref = doc(db, 'children', childId);
  let result = { progress: { ...DEFAULT_PROGRESS }, xpGained: 0, leveledUp: false, newLevel: null };

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists() ? snap.data() : { ...DEFAULT_PROGRESS };

    let totalXP = current.totalXP ?? 0;
    let streakCount = current.streakCount ?? 0;
    let xpGained = 0;

    if (correct) {
      // Timed mode: use speed-based XP (no streak bonus)
      if (timedModeXP !== null) {
        xpGained += timedModeXP;
        // Reset streak in timed mode
        streakCount = 0;
      } else {
        // Basic mode: standard XP with streak bonus
        xpGained += XP_CORRECT;
        const newStreak = streakCount + 1;
        if (newStreak >= STREAK_REQUIRED) {
          xpGained += XP_STREAK_BONUS;
          streakCount = 0;
        } else {
          streakCount = newStreak;
        }
      }
    } else {
      // No XP for incorrect answers
      streakCount = 0;
    }

    const previousLevel = getLevelFromTotalXP(totalXP).level;
    const newTotalXP = totalXP + xpGained;
    const { level, currentLevelXP } = getLevelFromTotalXP(newTotalXP);
    const unlockedGames = getUnlockedGamesForLevel(level);
    const leveledUp = level > previousLevel;

    const updatePayload = {
      totalXP: increment(xpGained),
      correctAnswers: increment(correct ? 1 : 0),
      level,
      currentLevelXP,
      streakCount,
      unlockedGames,
      updatedAt: serverTimestamp(),
    };

    if (snap.exists()) {
      transaction.update(ref, updatePayload);
    } else {
      transaction.set(ref, {
        totalXP: xpGained,
        level,
        currentLevelXP,
        gamesPlayed: 0,
        correctAnswers: correct ? 1 : 0,
        streakCount,
        unlockedGames,
        updatedAt: serverTimestamp(),
      });
    }

    result = {
      progress: {
        ...current,
        totalXP: newTotalXP,
        level,
        currentLevelXP,
        correctAnswers: (current.correctAnswers ?? 0) + (correct ? 1 : 0),
        streakCount,
        unlockedGames,
      },
      xpGained,
      leveledUp,
      newLevel: leveledUp ? level : null,
    };
  });

  result.progress = await getChildProgress(childId);
  return result;
}

/**
 * Increment gamesPlayed when a game session is completed.
 * Uses runTransaction + updateDoc() + increment(1) for atomic update.
 * @param {string} childId
 */
export async function incrementGamesPlayed(childId) {
  try {
    if (!db || !childId) return;
    const ref = doc(db, 'children', childId);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists()) {
        transaction.update(ref, {
          gamesPlayed: increment(1),
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.set(ref, {
          ...DEFAULT_PROGRESS,
          gamesPlayed: 1,
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    console.error('❌ incrementGamesPlayed:', error);
  }
}
