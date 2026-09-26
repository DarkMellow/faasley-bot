const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setAfk, getAfk } = require('../../utils/afk');
const { warnEmbed, mutedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('💤 Go AFK — anyone who mentions you is told you are away.')
    .addStringOption((opt) =>
      opt
        .setName('reason')
        .setDescription('Why are you going AFK? (optional)')
        .setRequired(false)
        .setMaxLength(200)
    ),
  level: 'everyone',

  /**
   * Marks the executor as AFK in quick.db.
   * Optionally prepends [AFK] to their server nickname if the bot can manage it.
   *
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { guild, member } = ctx;
    const reason = ctx.options.getString('reason') || 'AFK';

    // ── Already AFK check ────────────────────────────────────────────────
    const existing = await getAfk(guild.id, member.id);
    if (existing) {
      return ctx.reply({
        embeds: [
          warnEmbed(
            '⚠️ Already AFK',
            `You're already marked as AFK with reason: **${existing.reason}**\n` +
            `Send any message to clear it, then set a new one.`
          ),
        ],
        ephemeral: true,
      });
    }

    // ── Nickname Sync (optional) ─────────────────────────────────────────
    // member.manageable covers the role hierarchy and the server owner.
    const originalNickname = member.nickname; // null if using username
    let nicknameChanged = false;

    if (
      member.manageable &&
      guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames) &&
      !member.displayName.startsWith('[AFK]')
    ) {
      try {
        await member.setNickname(`[AFK] ${member.displayName}`.slice(0, 32)); // Discord nick limit: 32 chars
        nicknameChanged = true;
      } catch {
        // Nickname change is optional
      }
    }

    // ── Save AFK state ───────────────────────────────────────────────────
    await setAfk(guild.id, member.id, { reason, originalNickname, nicknameChanged });

    await ctx.reply({
      embeds: [
        mutedEmbed(
          '💤 You\'re now AFK',
          `**Reason:** ${reason}\n\n` +
          `I'll let people know you're away if they mention you.\n` +
          `Send any message when you're back and I'll remove your AFK status automatically.`
        ).setFooter({ text: `AFK set in ${guild.name}` }),
      ],
    });
  },
};
