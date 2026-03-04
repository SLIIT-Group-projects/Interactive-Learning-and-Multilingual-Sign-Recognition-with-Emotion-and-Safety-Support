import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
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
 * Add XP after an answer and update Firestore
 * Rules: correct +20, partial (confidence >= 0.7) +10, wrong +0. 5 correct in a row +50 bonus.
 * @param {string} childId
 * @param {Object} options - { correct: boolean, confidence?: number }
 * @returns {Promise<{ progress: Object, xpGained: number, leveledUp: boolean, newLevel?: number }>}
 */
export async function addXP(childId, options = {}) {
  const { correct = false, confidence = 0 } = options;
  if (!db || !childId) {
    return { progress: { ...DEFAULT_PROGRESS }, xpGained: 0, leveledUp: false };
  }

  const ref = doc(db, 'children', childId);
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : { ...DEFAULT_PROGRESS };

  let totalXP = current.totalXP ?? 0;
  let streakCount = current.streakCount ?? 0;
  let correctAnswers = current.correctAnswers ?? 0;
  let xpGained = 0;
  let leveledUp = false;
  let newLevel = null;

  if (correct) {
    xpGained += XP_CORRECT;
    streakCount += 1;
    correctAnswers += 1;
    if (streakCount >= STREAK_REQUIRED) {
      xpGained += XP_STREAK_BONUS;
      streakCount = 0;
    }
  } else if (confidence >= PARTIAL_CONFIDENCE_THRESHOLD) {
    xpGained += XP_PARTIAL;
    streakCount = 0;
  } else {
    streakCount = 0;
  }

  const previousLevel = getLevelFromTotalXP(totalXP).level;
  totalXP += xpGained;
  const { level, currentLevelXP } = getLevelFromTotalXP(totalXP);
  const unlockedGames = getUnlockedGamesForLevel(level);
  if (level > previousLevel) {
    leveledUp = true;
    newLevel = level;
  }

  const payload = {
    totalXP,
    level,
    currentLevelXP,
    correctAnswers,
    streakCount,
    unlockedGames,
    updatedAt: serverTimestamp(),
  };

  if (snap.exists()) {
    await updateDoc(ref, payload);
  } else {
    await setDoc(ref, {
      ...DEFAULT_PROGRESS,
      ...payload,
      gamesPlayed: current.gamesPlayed ?? 0,
    });
  }

  const progress = await getChildProgress(childId);
  return { progress, xpGained, leveledUp, newLevel };
}

/**
 * Increment gamesPlayed when a game session is completed
 * @param {string} childId
 */
export async function incrementGamesPlayed(childId) {
  try {
    if (!db || !childId) return;
    const ref = doc(db, 'children', childId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        gamesPlayed: increment(1),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...DEFAULT_PROGRESS,
        gamesPlayed: 1,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('❌ incrementGamesPlayed:', error);
  }
}
