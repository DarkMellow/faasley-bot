const db = require('./db');

const DEFAULT_PREFIX = '?';
const DEFAULT_WARN_LIMIT = 3;  // warnings before an automatic kick
const MAX_WARN_LIMIT = 20;
const BROADCAST_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 1 broadcast per 6 hours per server

// Prefixes are read on every message, so keep them in memory after first load.
const prefixCache = new Map();

/**
 * @param {string} guildId
 * @returns {Promise<string>}
 */
async function getPrefix(guildId) {
  if (prefixCache.has(guildId)) return prefixCache.get(guildId);
  const prefix = (await db.get(`prefix_${guildId}`)) ?? DEFAULT_PREFIX;
  prefixCache.set(guildId, prefix);
  return prefix;
}

/**
 * @param {string} guildId
 * @param {string} prefix
 */
async function setPrefix(guildId, prefix) {
  if (prefix === DEFAULT_PREFIX) {
    await db.delete(`prefix_${guildId}`);
  } else {
    await db.set(`prefix_${guildId}`, prefix);
  }
  prefixCache.set(guildId, prefix);
}

/**
 * Returns the timestamp at which the next broadcast is allowed, or null if a
 * broadcast is allowed right now.
 *
 * @param {string} guildId
 * @returns {Promise<number|null>}
 */
async function getNextBroadcastTime(guildId) {
  const last = await db.get(`broadcast_last_${guildId}`);
  if (!last) return null;
  const next = last + BROADCAST_COOLDOWN_MS;
  return next > Date.now() ? next : null;
}

/**
 * Starts the broadcast cooldown for a guild.
 *
 * @param {string} guildId
 */
async function startBroadcastCooldown(guildId) {
  await db.set(`broadcast_last_${guildId}`, Date.now());
}

/**
 * Clears the broadcast cooldown (used when a broadcast found no recipients).
 *
 * @param {string} guildId
 */
async function clearBroadcastCooldown(guildId) {
  await db.delete(`broadcast_last_${guildId}`);
}

/**
 * Number of warnings at which a member is automatically kicked (0 = never).
 *
 * @param {string} guildId
 * @returns {Promise<number>}
 */
async function getWarnLimit(guildId) {
  return (await db.get(`warnlimit_${guildId}`)) ?? DEFAULT_WARN_LIMIT;
}

/**
 * @param {string} guildId
 * @param {number} limit  0 disables auto-kick
 */
async function setWarnLimit(guildId, limit) {
  await db.set(`warnlimit_${guildId}`, limit);
}

module.exports = {
  DEFAULT_PREFIX,
  DEFAULT_WARN_LIMIT,
  MAX_WARN_LIMIT,
  BROADCAST_COOLDOWN_MS,
  getPrefix,
  setPrefix,
  getWarnLimit,
  setWarnLimit,
  getNextBroadcastTime,
  startBroadcastCooldown,
  clearBroadcastCooldown,
};
