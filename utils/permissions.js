const { PermissionFlagsBits } = require('discord.js');

// ── Permission Levels ──────────────────────────────────────────────────────
// Access is derived purely from the member's native Discord permissions —
// servers don't configure anything. Each level includes every level below it.
const LEVELS = {
  everyone: 0,
  mod: 1,
  admin: 2,
  owner: 3,
};

const LEVEL_INFO = {
  everyone: { label: 'Everyone', requirement: 'No permission needed',        permission: null },
  mod:      { label: 'Mod',      requirement: 'Timeout Members permission',  permission: PermissionFlagsBits.ModerateMembers },
  admin:    { label: 'Admin',    requirement: 'Manage Server permission',    permission: PermissionFlagsBits.ManageGuild },
  owner:    { label: 'Owner',    requirement: 'Server owner only',           permission: PermissionFlagsBits.Administrator },
};

/**
 * Resolves a member's bot permission level from their Discord permissions.
 * Administrator implies every permission, so admins always resolve to "admin".
 *
 * @param {import('discord.js').GuildMember} member
 * @returns {number} One of the LEVELS values
 */
function getMemberLevel(member) {
  if (member.id === member.guild.ownerId) return LEVELS.owner;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return LEVELS.admin;
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return LEVELS.mod;
  return LEVELS.everyone;
}

/**
 * @param {import('discord.js').GuildMember} member
 * @param {keyof LEVELS} level
 * @returns {boolean}
 */
function hasLevel(member, level) {
  return getMemberLevel(member) >= LEVELS[level];
}

/**
 * A "staff role" is any role that grants Mod or Admin level. Used by lock/hide
 * to keep staff access. Administrator roles are skipped — they bypass channel
 * overwrites anyway.
 *
 * @param {import('discord.js').Role} role
 * @returns {boolean}
 */
function isStaffRole(role) {
  if (role.id === role.guild.id) return false; // @everyone
  const perms = role.permissions;
  if (perms.has(PermissionFlagsBits.Administrator)) return false;
  return (
    perms.has(PermissionFlagsBits.ModerateMembers, false) ||
    perms.has(PermissionFlagsBits.ManageGuild, false)
  );
}

/**
 * Turns permission flag names like "ManageRoles" into "Manage Roles".
 *
 * @param {string[]} names
 * @returns {string}
 */
function formatPermissionNames(names) {
  return names.map((n) => `**${n.replace(/([a-z])([A-Z])/g, '$1 $2')}**`).join(', ');
}

module.exports = {
  LEVELS,
  LEVEL_INFO,
  getMemberLevel,
  hasLevel,
  isStaffRole,
  formatPermissionNames,
};
