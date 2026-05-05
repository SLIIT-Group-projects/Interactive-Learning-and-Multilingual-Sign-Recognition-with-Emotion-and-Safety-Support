/**
 * Word Practice round — temporarily fixed to these three words only.
 */
export const WORD_PRACTICE_FIXED = ['KEY', 'WAY', 'VAN'];

export const WORDS_PER_ROUND = 3;

export function getWordRoundWords() {
  const pool = [...WORD_PRACTICE_FIXED];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
