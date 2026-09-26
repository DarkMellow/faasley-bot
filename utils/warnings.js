const db = require('./db');

// ── DB Key Convention ──────────────────────────────────────────────────────
// warns_<guildId>_<userId>  →  [{ reason, moderatorId, timestamp }]  (oldest first)

/**
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<{ reason: string, moderatorId: string, timestamp: number }[]>}
 */
async function getWarnings(guildId, userId) {
  return (await db.get(`warns_${guildId}_${userId}`)) || [];
}

/**
 * Adds a warning and returns the updated list.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {{ reason: string, moderatorId: string }} warning
 */
async function addWarning(guildId, userId, { reason, moderatorId }) {
  const warnings = await getWarnings(guildId, userId);
  warnings.push({ reason, moderatorId, timestamp: Date.now() });
  await db.set(`warns_${guildId}_${userId}`, warnings);
  return warnings;
}

/**
 * Removes one warning by its 1-based number, or all of them when `number`
 * is omitted. Returns the number of warnings removed.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {number} [number]
 * @returns {Promise<number>}
 */
async function removeWarnings(guildId, userId, number) {
  const warnings = await getWarnings(guildId, userId);

  if (number === undefined || number === null) {
    await db.delete(`warns_${guildId}_${userId}`);
    return warnings.length;
  }

  if (number < 1 || number > warnings.length) return 0;
  warnings.splice(number - 1, 1);
  if (warnings.length) {
    await db.set(`warns_${guildId}_${userId}`, warnings);
  } else {
    await db.delete(`warns_${guildId}_${userId}`);
  }
  return 1;
}

module.exports = { getWarnings, addWarning, removeWarnings };
