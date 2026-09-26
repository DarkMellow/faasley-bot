const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { supportsRestriction, isRestricted, applyRestriction } = require('../../utils/lockdown');
const { errorEmbed, warnEmbed, successEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('🔒 Lock this channel — only staff can send messages.'),
  level: 'mod',
  // Manage Roles in a channel = "Manage Permissions" (needed to edit overwrites).
  botPermissions: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ManageRoles,
  ],

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { channel, member } = ctx;

    if (!supportsRestriction(channel, 'lock')) {
      return ctx.reply({
        embeds: [errorEmbed('❌ Invalid Channel', 'This command can only be used in text, announcement, or voice channels.')],
        ephemeral: true,
      });
    }

    if (await isRestricted(channel, 'lock')) {
      return ctx.reply({
        embeds: [warnEmbed('⚠️ Already Locked', 'This channel is already locked.')],
        ephemeral: true,
      });
    }

    await ctx.defer({ ephemeral: true });
    await applyRestriction(channel, 'lock', `Locked by ${ctx.user.tag}`);

    // ── Public notice in the locked channel ──────────────────────────
    await channel.send({
      embeds: [
        errorEmbed(
          '🔒 Channel Locked',
          'This channel has been locked by a moderator.\nOnly staff can send messages here.'
        ).addFields({ name: 'Locked by', value: `<@${member.id}>`, inline: true }),
      ],
    });

    // Prefix commands already see the public notice — no second message needed.
    if (ctx.isSlash) {
      await ctx.reply({
        embeds: [successEmbed('✅ Channel Locked', `<#${channel.id}> has been successfully locked.`)],
      });
    }
  },
};
