const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { parseDuration, formatShortDuration } = require('../../utils/duration');
const { DEFAULT_REASON, checkTarget, auditReason, notifyUser } = require('../../utils/moderation');
const { errorEmbed, makeEmbed, COLORS } = require('../../utils/embeds');

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord's limit: 28 days

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('⏳ Time out a member so they can\'t chat or join voice for a while.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to time out').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('duration')
        .setDescription('How long, e.g. 10m, 2h, 1d, 1h30m (max 28d)')
        .setRequired(true)
        .setMaxLength(20)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Why they are being timed out').setMaxLength(400)
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
    const deny = (title, description) =>
      ctx.reply({ embeds: [errorEmbed(title, description)], ephemeral: true });

    const target = ctx.options.getMember('user') ?? (await guild.members.fetch(user.id).catch(() => null));
    if (!target) return deny('❌ Member Not Found', 'That user is not in this server.');

    const targetError = checkTarget(ctx, target, 'time out');
    if (targetError) return deny('⚠️ Not Allowed', targetError);

    if (target.permissions.has(PermissionFlagsBits.Administrator)) {
      return deny('⚠️ Not Allowed', 'Members with the Administrator permission can\'t be timed out.');
    }

    const ms = parseDuration(ctx.options.getString('duration'));
    if (!ms) {
      return deny('❌ Invalid Duration', 'Use a duration like `10m`, `2h`, `1d` or `1h30m`.');
    }
    if (ms > MAX_TIMEOUT_MS) {
      return deny('❌ Too Long', 'Timeouts can be at most **28 days**.');
    }

    const wasTimedOut = target.isCommunicationDisabled();
    await target.timeout(ms, auditReason(ctx, reason));

    const endsAt = Math.floor((Date.now() + ms) / 1000);
    const duration = formatShortDuration(ms);
    const dmSent = await notifyUser(user, guild, {
      title: '⏳ You have been timed out',
      reason,
      fields: [{ name: 'Ends', value: `<t:${endsAt}:R>`, inline: true }],
    });

    await ctx.reply({
      embeds: [
        makeEmbed(COLORS.warn, wasTimedOut ? '⏳ Timeout Updated' : '⏳ Member Timed Out')
          .addFields(
            { name: 'Member',    value: `<@${user.id}>`,     inline: true },
            { name: 'Duration',  value: duration,            inline: true },
            { name: 'Ends',      value: `<t:${endsAt}:R>`,   inline: true },
            { name: 'Reason',    value: reason },
            { name: 'Moderator', value: `<@${ctx.user.id}>`, inline: true }
          )
          .setFooter({ text: dmSent ? 'The member was notified by DM.' : 'Could not DM the member.' }),
      ],
    });
  },
};
