const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('./embeds');

// ── Shared Helpers for Member Actions (timeout, warn, kick, ban) ───────────

const DEFAULT_REASON = 'No reason provided';

/**
 * Checks whether the executor may act on the target member. Returns an error
 * message, or null if the action is allowed.
 *
 * Rules (fixed safety rules, not settings):
 *  - Nobody can target themselves, the bot, or the server owner.
 *  - Unless the executor is the server owner, the target's highest role must
 *    be strictly below the executor's highest role.
 *  - The target's highest role must be strictly below the bot's highest role.
 *
 * @param {import('./context').CommandContext} ctx
 * @param {import('discord.js').GuildMember} target
 * @param {string} verb  e.g. "timeout", "warn"
 * @returns {string|null}
 */
function checkTarget(ctx, target, verb) {
  const { guild, member: executor } = ctx;

  if (target.id === executor.id) return `You can't ${verb} yourself.`;
  if (target.id === ctx.client.user.id) return `I can't ${verb} myself.`;
  if (target.id === guild.ownerId) return `The server owner can't be targeted.`;

  if (
    executor.id !== guild.ownerId &&
    target.roles.highest.position >= executor.roles.highest.position
  ) {
    return `You can't ${verb} <@${target.id}> because their highest role is at or above yours.`;
  }

  if (target.roles.highest.position >= guild.members.me.roles.highest.position) {
    return `I can't ${verb} <@${target.id}> because their highest role is at or above mine. ` +
      'Move my role higher in Server Settings → Roles.';
  }

  return null;
}

/**
 * Builds an audit log reason that records who ran the command.
 * Discord limits audit log reasons to 512 characters.
 *
 * @param {import('./context').CommandContext} ctx
 * @param {string} reason
 */
function auditReason(ctx, reason) {
  return `${reason} — by ${ctx.user.tag}`.slice(0, 512);
}

/**
 * DMs a member about an action taken against them. Returns true if the DM was
 * delivered. Must be called before kick/ban, since DMs fail once they've left.
 *
 * @param {import('discord.js').User} user
 * @param {import('discord.js').Guild} guild
 * @param {{ title: string, reason: string, fields?: object[] }} notice
 * @returns {Promise<boolean>}
 */
async function notifyUser(user, guild, { title, reason, fields = [] }) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.warn)
    .setTitle(title)
    .setDescription(`**Server:** ${guild.name}\n**Reason:** ${reason}`)
    .addFields(fields)
    .setTimestamp();

  try {
    await user.send({ embeds: [embed] });
    return true;
  } catch {
    return false; // DMs closed
  }
}

module.exports = { DEFAULT_REASON, checkTarget, auditReason, notifyUser };
