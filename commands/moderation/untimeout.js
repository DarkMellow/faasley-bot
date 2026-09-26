const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DEFAULT_REASON, checkTarget, auditReason } = require('../../utils/moderation');
const { errorEmbed, warnEmbed, makeEmbed, COLORS } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('✅ Remove a member\'s timeout early.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to remove the timeout from').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Why the timeout is being removed').setMaxLength(400)
    ),
  level: 'mod',
  botPermissions: [PermissionFlagsBits.ModerateMembers],

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { guild } = ctx;
    const user = ctx.options.getUser('user');
    const reason = ctx.options.getString('reason') || DEFAULT_REASON;

    const target = ctx.options.getMember('user') ?? (await guild.members.fetch(user.id).catch(() => null));
    if (!target) {
      return ctx.reply({ embeds: [errorEmbed('❌ Member Not Found', 'That user is not in this server.')], ephemeral: true });
    }

    if (!target.isCommunicationDisabled()) {
      return ctx.reply({ embeds: [warnEmbed('⚠️ Not Timed Out', `<@${user.id}> is not timed out.`)], ephemeral: true });
    }

    const targetError = checkTarget(ctx, target, 'remove the timeout from');
    if (targetError) {
      return ctx.reply({ embeds: [errorEmbed('⚠️ Not Allowed', targetError)], ephemeral: true });
    }

    await target.timeout(null, auditReason(ctx, reason));

    await ctx.reply({
      embeds: [
        makeEmbed(COLORS.success, '✅ Timeout Removed')
          .addFields(
            { name: 'Member',    value: `<@${user.id}>`,     inline: true },
            { name: 'Moderator', value: `<@${ctx.user.id}>`, inline: true },
            { name: 'Reason',    value: reason }
          ),
      ],
    });
  },
};
