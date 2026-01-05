const sessions = new Map();

/**
 * Create a new reading session
 */
export function ehStartSession(sessionId) {
  sessions.set(sessionId, {
    emotions: [],
    hand: [],
    startedAt: Date.now()
  });
}

/**
 * Save emotion output
 */
export function ehAddEmotion(sessionId, data) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.emotions.push({ ...data, t: Date.now() });
}

/**
 * Save hand output
 */
export function ehAddHand(sessionId, data) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.hand.push({ ...data, t: Date.now() });
}

/**
 * Get session data
 */
export function ehGetSession(sessionId) {
  return sessions.get(sessionId);
}

/**
 * Clear session
 */
export function ehEndSession(sessionId) {
  sessions.delete(sessionId);
}
