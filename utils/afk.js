const db = require('./db');

// ── DB Key Convention ──────────────────────────────────────────────────────
// afk_<guildId>_<userId>  →  { status, reason, timestamp, originalNickname, nicknameChanged }

/**
 * Saves an AFK entry for a user in a guild.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {object} data
 * @param {string} data.reason
 * @param {string|null} data.originalNickname  Nickname before [AFK] was prepended (null = username)
 * @param {boolean} data.nicknameChanged       Whether the bot actually changed the nickname
 */
async function setAfk(guildId, userId, { reason, originalNickname = null, nicknameChanged = false }) {
  await db.set(`afk_${guildId}_${userId}`, {
    status: true,
    reason,
    timestamp: Date.now(),
    originalNickname,
    nicknameChanged,
  });
}

/**
 * Retrieves the AFK entry for a user in a guild, or null if not AFK.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<{ status: boolean, reason: string, timestamp: number, originalNickname: string|null, nicknameChanged?: boolean }|null>}
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
 * e.g.  "2d 4h"  |  "2h 15m"  |  "45 minutes"  |  "just now"
 *
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days         = Math.floor(totalSeconds / 86400);
  const hours        = Math.floor((totalSeconds % 86400) / 3600);
  const minutes      = Math.floor((totalSeconds % 3600) / 60);
  const seconds      = totalSeconds % 60;

  if (days > 0)                  return hours > 0 ? `${days}d ${hours}h` : `${days} day${days !== 1 ? 's' : ''}`;
  if (hours > 0 && minutes > 0)  return `${hours}h ${minutes}m`;
  if (hours > 0)                 return `${hours} hour${hours !== 1 ? 's' : ''}`;
  if (minutes > 0)               return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  if (seconds > 0)               return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  return 'just now';
}

module.exports = { setAfk, getAfk, clearAfk, formatDuration };
