const { QuickDB } = require('quick.db');
const db = new QuickDB();

// ── DB Key Convention ──────────────────────────────────────────────────────
// modroles_<guildId>  →  string[]  (array of allowed role IDs)

/**
 * Returns the list of whitelisted mod role IDs for a given guild.
 *
 * @param {string} guildId
 * @returns {Promise<string[]>}
 */
async function getModRoles(guildId) {
  return (await db.get(`modroles_${guildId}`)) || [];
}

/**
 * Saves an updated list of mod role IDs for a given guild.
 *
 * @param {string} guildId
 * @param {string[]} roles
 */
async function setModRoles(guildId, roles) {
  await db.set(`modroles_${guildId}`, roles);
}

/**
 * Checks if a guild member is authorized to run moderation commands.
 *
 * Authorization hierarchy:
 *  1. Guild Owner → always authorized, bypasses all checks.
 *  2. Holds at least one role from the guild's mod-role whitelist in the DB.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<boolean>}
 */
async function isAuthorized(member, guild) {
  // Tier 1: Server owner always wins
  if (member.id === guild.ownerId) return true;

  // Tier 2: Check against stored mod roles for this guild
  const modRoles = await getModRoles(guild.id);
  return modRoles.some((id) => member.roles.cache.has(id));
}

module.exports = { isAuthorized, getModRoles, setModRoles };
