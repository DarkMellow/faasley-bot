const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addWarning, removeWarnings } = require('../../utils/warnings');
const { getWarnLimit } = require('../../utils/guildConfig');
const { DEFAULT_REASON, checkTarget, auditReason, notifyUser } = require('../../utils/moderation');
const { errorEmbed, makeEmbed, COLORS } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('⚠️ Warn a member — they are kicked when they reach the server\'s warning limit.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to warn').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Why they are being warned').setMaxLength(400)
    ),
  level: 'mod',

  /**
   * Adds a warning. If the member reaches the server's warning limit
   * (/config warnlimit, 0 = off), they are kicked and their warnings reset.
   *
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
    if (user.bot) return deny('⚠️ Not Allowed', 'Bots can\'t be warned.');

    const targetError = checkTarget(ctx, target, 'warn');
    if (targetError) return deny('⚠️ Not Allowed', targetError);

    const warnings = await addWarning(guild.id, user.id, { reason, moderatorId: ctx.user.id });
    const count = warnings.length;
    const limit = await getWarnLimit(guild.id);
    const countText = limit > 0 ? `${count} / ${limit}` : `${count}`;

    // ── Auto-kick at the warning limit ─────────────────────────────────
    const reachedLimit = limit > 0 && count >= limit;
    const canKick =
      guild.members.me.permissions.has(PermissionFlagsBits.KickMembers) && target.kickable;
    let autoKick = null; // 'kicked' | 'failed'

    let dmSent;
    if (reachedLimit && canKick) {
      // DM before kicking — it can't be delivered after they leave.
      dmSent = await notifyUser(user, guild, {
        title: '👢 You have been kicked',
        reason: `Reached the warning limit (${limit}). Last warning: ${reason}`,
      });
      try {
        await target.kick(auditReason(ctx, `Reached ${limit} warnings — ${reason}`));
        await removeWarnings(guild.id, user.id);
        autoKick = 'kicked';
      } catch (error) {
        console.error('[warn] ❌  Auto-kick failed:', error);
        autoKick = 'failed';
      }
    } else {
      dmSent = await notifyUser(user, guild, {
        title: '⚠️ You have been warned',
        reason,
        fields: [{ name: 'Warnings', value: countText, inline: true }],
      });
      if (reachedLimit) autoKick = 'failed';
    }

    const embed = makeEmbed(COLORS.warn, '⚠️ Member Warned')
      .addFields(
        { name: 'Member',    value: `<@${user.id}>`,     inline: true },
        { name: 'Warnings',  value: countText,           inline: true },
        { name: 'Moderator', value: `<@${ctx.user.id}>`, inline: true },
        { name: 'Reason',    value: reason }
      )
      .setFooter({ text: dmSent ? 'The member was notified by DM.' : 'Could not DM the member.' });

    if (autoKick === 'kicked') {
      embed.addFields({ name: '👢 Auto-kick', value: 'They reached the warning limit and were kicked. Their warnings were reset.' });
    } else if (autoKick === 'failed') {
      embed.addFields({
        name: '👢 Auto-kick failed',
        value: 'They reached the warning limit, but I couldn\'t kick them. I need **Kick Members** and a role above theirs.',
      });
    }

    await ctx.reply({ embeds: [embed] });
  },
};
