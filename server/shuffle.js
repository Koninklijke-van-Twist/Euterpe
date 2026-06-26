/** Shuffle with spacing rule: last 3 of previous round not in first 5 of next. */
export function shuffleWithSpacing(trackIds, previousTail) {
  if (trackIds.length <= 1) return [...trackIds];

  const forbidden = new Set(previousTail.slice(-3));
  for (let attempt = 0; attempt < 200; attempt++) {
    const shuffled = [...trackIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (trackIds.length < 8 || forbidden.size === 0) return shuffled;
    const firstFive = new Set(shuffled.slice(0, 5));
    if (![...forbidden].some((id) => firstFive.has(id))) return shuffled;
  }

  const fallback = [...trackIds];
  for (let i = fallback.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fallback[i], fallback[j]] = [fallback[j], fallback[i]];
  }
  return fallback;
}
