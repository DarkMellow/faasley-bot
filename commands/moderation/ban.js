const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DEFAULT_REASON, checkTarget, auditReason, notifyUser } = require('../../utils/moderation');
const { errorEmbed, warnEmbed, makeEmbed, COLORS } = require('../../utils/embeds');

// Choice value → seconds of recent messages to delete
const DELETE_WINDOWS = {
  none: 0,
  '1h': 60 * 60,
  '1d': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('🔨 Ban a user (or a user ID) and optionally delete their last 1h / 1d / 7d of messages.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to ban (member or user ID)').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('delete')
        .setDescription('Delete their recent messages')
        .addChoices(
          { name: 'Don\'t delete any', value: 'none' },
          { name: 'Last hour',         value: '1h' },
          { name: 'Last 24 hours',     value: '1d' },
          { name: 'Last 7 days',       value: '7d' }
        )
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Why they are being banned').setMaxLength(400)
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
    const deleteWindow = ctx.options.getString('delete') ?? 'none';
    const deny = (title, description) =>
      ctx.reply({ embeds: [errorEmbed(title, description)], ephemeral: true });

    // Rank checks only apply to current members; other users can be banned by ID.
    const target = ctx.options.getMember('user') ?? (await guild.members.fetch(user.id).catch(() => null));
    if (target) {
      const targetError = checkTarget(ctx, target, 'ban');
      if (targetError) return deny('⚠️ Not Allowed', targetError);
    } else if (await guild.bans.fetch(user.id).catch(() => null)) {
      return ctx.reply({ embeds: [warnEmbed('⚠️ Already Banned', `<@${user.id}> is already banned.`)], ephemeral: true });
    }

    // DM before banning — it can't be delivered after they leave.
    const dmSent = target ? await notifyUser(user, guild, { title: '🔨 You have been banned', reason }) : false;

    await guild.bans.create(user.id, {
      reason: auditReason(ctx, reason),
      deleteMessageSeconds: DELETE_WINDOWS[deleteWindow],
    });

    await ctx.reply({
      embeds: [
        makeEmbed(COLORS.error, '🔨 User Banned')
          .addFields(
            { name: 'User',      value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: 'Moderator', value: `<@${ctx.user.id}>`,           inline: true },
            { name: 'Reason',    value: reason }
          )
          .setFooter({
            text: !target
              ? 'They were not in the server.'
              : dmSent ? 'The user was notified by DM.' : 'Could not DM the user.',
          }),
      ],
    });
  },
};
