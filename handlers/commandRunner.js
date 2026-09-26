const { LEVEL_INFO, hasLevel, formatPermissionNames } = require('../utils/permissions');
const { errorEmbed } = require('../utils/embeds');

/**
 * The single gate every command passes through — slash and prefix alike.
 *
 *  1. Permission level check (derived from the member's Discord permissions)
 *  2. Bot channel permission check (command.botPermissions)
 *  3. Execute, with a catch-all error reply
 *
 * @param {object} command
 * @param {import('../utils/context').CommandContext} ctx
 */
async function runCommand(command, ctx) {
  const name = command.data.name;

  if (!ctx.member || !ctx.channel) {
    return ctx.reply({
      embeds: [errorEmbed('❌ Unavailable', 'I could not load this server or channel. Please try again.')],
      ephemeral: true,
    });
  }

  // ── 1. Permission level ─────────────────────────────────────────────
  if (!hasLevel(ctx.member, command.level)) {
    const info = LEVEL_INFO[command.level];
    return ctx.reply({
      embeds: [
        errorEmbed(
          '🚫 Access Denied',
          `\`${name}\` requires **${info.label}** level — ${info.requirement}.`
        ),
      ],
      ephemeral: true,
    });
  }

  // ── 2. Bot permissions in this channel ──────────────────────────────
  if (command.botPermissions?.length) {
    const missing = ctx.channel.permissionsFor(ctx.guild.members.me).missing(command.botPermissions);
    if (missing.length) {
      return ctx.reply({
        embeds: [
          errorEmbed(
            '🤖 Missing Permissions',
            `I need ${formatPermissionNames(missing)} in this channel to run \`${name}\`.`
          ),
        ],
        ephemeral: true,
      });
    }
  }

  // ── 3. Execute ──────────────────────────────────────────────────────
  try {
    await command.execute(ctx);
  } catch (error) {
    console.error(`[CommandRunner] ❌  Error executing ${name}:`, error);
    await ctx
      .reply({
        embeds: [
          errorEmbed(
            '⚠️ Something went wrong',
            'An unexpected error occurred while processing your command. Please try again later.'
          ),
        ],
        ephemeral: true,
      })
      .catch(() => {});
  }
}

module.exports = { runCommand };
