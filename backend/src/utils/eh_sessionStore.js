const sessions = new Map();

/**
 * Create a new reading session
 */
export function startSession(sessionId) {
  sessions.set(sessionId, {
    startedAt: Date.now(),
    emotions: [],
    hands: [],
    final: null,
  });
}

/**
 * Save emotion output
 */
export function addEmotion(sessionId, item) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.emotions.push({ ...item, t: Date.now() });
}

/**
 * Save hand output
 */
export function addHand(sessionId, item) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.hands.push({ ...item, t: Date.now() });
}

/**
 * Get session data
 */
export function getSession(sessionId) {
  return sessions.get(sessionId);
}

/**
 * Finalize session - save final result
 */
export function finalize(sessionId, finalData) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.final = finalData;
}

/**
 * Clear session (optional cleanup)
 */
export function endSession(sessionId) {
  sessions.delete(sessionId);
}

// Legacy exports for backward compatibility
export const ehStartSession = startSession;
export const ehAddEmotion = addEmotion;
export const ehAddHand = addHand;
export const ehGetSession = getSession;
export const ehEndSession = endSession;
