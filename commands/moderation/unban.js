const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DEFAULT_REASON, auditReason } = require('../../utils/moderation');
const { warnEmbed, makeEmbed, COLORS } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('🔓 Unban a user by their user ID.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to unban (paste their user ID)').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Why they are being unbanned').setMaxLength(400)
    ),
  level: 'admin',
  botPermissions: [PermissionFlagsBits.BanMembers],

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { guild } = ctx;
    const user = ctx.options.getUser('user');
    const reason = ctx.options.getString('reason') || DEFAULT_REASON;

    const ban = await guild.bans.fetch(user.id).catch(() => null);
    if (!ban) {
      return ctx.reply({ embeds: [warnEmbed('⚠️ Not Banned', `<@${user.id}> is not banned.`)], ephemeral: true });
    }

    await guild.bans.remove(user.id, auditReason(ctx, reason));

    await ctx.reply({
      embeds: [
        makeEmbed(COLORS.success, '🔓 User Unbanned')
          .addFields(
            { name: 'User',      value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: 'Moderator', value: `<@${ctx.user.id}>`,           inline: true },
            { name: 'Reason',    value: reason }
          ),
      ],
    });
  },
};
