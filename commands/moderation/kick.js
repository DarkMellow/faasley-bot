const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DEFAULT_REASON, checkTarget, auditReason, notifyUser } = require('../../utils/moderation');
const { errorEmbed, makeEmbed, COLORS } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('👢 Kick a member from the server.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to kick').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Why they are being kicked').setMaxLength(400)
    ),
  level: 'admin',
  botPermissions: [PermissionFlagsBits.KickMembers],

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { guild } = ctx;
    const user = ctx.options.getUser('user');
    const reason = ctx.options.getString('reason') || DEFAULT_REASON;
    const deny = (title, description) =>
      ctx.reply({ embeds: [errorEmbed(title, description)], ephemeral: true });

    const target = ctx.options.getMember('user') ?? (await guild.members.fetch(user.id).catch(() => null));
    if (!target) return deny('❌ Member Not Found', 'That user is not in this server.');

    const targetError = checkTarget(ctx, target, 'kick');
    if (targetError) return deny('⚠️ Not Allowed', targetError);

    // DM before kicking — it can't be delivered after they leave.
    const dmSent = await notifyUser(user, guild, { title: '👢 You have been kicked', reason });
    await target.kick(auditReason(ctx, reason));

    await ctx.reply({
      embeds: [
        makeEmbed(COLORS.error, '👢 Member Kicked')
          .addFields(
            { name: 'Member',    value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: 'Moderator', value: `<@${ctx.user.id}>`,           inline: true },
            { name: 'Reason',    value: reason }
          )
          .setFooter({ text: dmSent ? 'The member was notified by DM.' : 'Could not DM the member.' }),
      ],
    });
  },
};
