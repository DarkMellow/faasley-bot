// ── Duration Parsing ───────────────────────────────────────────────────────
// Accepts compact durations such as "30s", "10m", "2h", "1d", "1w" and
// combinations like "1h30m" or "2d 12h".

const UNITS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * @param {string} input
 * @returns {number|null} Milliseconds, or null if the input isn't a valid duration
 */
function parseDuration(input) {
  const text = input.toLowerCase().replace(/\s+/g, '');
  if (!/^(\d+[smhdw])+$/.test(text)) return null;

  let total = 0;
  for (const [, amount, unit] of text.matchAll(/(\d+)([smhdw])/g)) {
    total += Number(amount) * UNITS[unit];
  }
  return total > 0 ? total : null;
}

/**
 * Formats milliseconds as a compact duration, e.g. "1d 2h 30m".
 *
 * @param {number} ms
 * @returns {string}
 */
function formatShortDuration(ms) {
  const parts = [];
  let rest = Math.round(ms / 1000);
  for (const [unit, seconds] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) {
    const amount = Math.floor(rest / seconds);
    if (amount > 0) parts.push(`${amount}${unit}`);
    rest %= seconds;
  }
  return parts.join(' ') || '0s';
}

module.exports = { parseDuration, formatShortDuration };
