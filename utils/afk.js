const { QuickDB } = require('quick.db');
const db = new QuickDB();

// ── DB Key Convention ──────────────────────────────────────────────────────
// afk_<guildId>_<userId>  →  { status, reason, timestamp, originalNickname }

/**
 * Saves an AFK entry for a user in a guild.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {string} reason
 * @param {string|null} originalNickname  The nickname before [AFK] was prepended (null if not changed)
 */
async function setAfk(guildId, userId, reason, originalNickname = null) {
  await db.set(`afk_${guildId}_${userId}`, {
    status: true,
    reason,
    timestamp: Date.now(),
    originalNickname,
  });
}

/**
 * Retrieves the AFK entry for a user in a guild, or null if not AFK.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<{ status: boolean, reason: string, timestamp: number, originalNickname: string|null }|null>}
 */
async function getAfk(guildId, userId) {
  return (await db.get(`afk_${guildId}_${userId}`)) || null;
}

/**
 * Removes the AFK entry for a user in a guild.
 *
 * @param {string} guildId
 * @param {string} userId
 */
async function clearAfk(guildId, userId) {
  await db.delete(`afk_${guildId}_${userId}`);
}

/**
 * Formats a duration in milliseconds into a human-readable string.
 * e.g.  "2 hours and 15 minutes"  |  "45 minutes"  |  "just now"
 *
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours        = Math.floor(totalSeconds / 3600);
  const minutes      = Math.floor((totalSeconds % 3600) / 60);
  const seconds      = totalSeconds % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0)                 return `${hours} hour${hours !== 1 ? 's' : ''}`;
  if (minutes > 0)               return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  if (seconds > 0)               return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  return 'just now';
}

module.exports = { setAfk, getAfk, clearAfk, formatDuration };
