const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { supportsRestriction, isRestricted, releaseRestriction } = require('../../utils/lockdown');
const { errorEmbed, warnEmbed, successEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('🔓 Unlock this channel so everyone can talk again.'),
  level: 'mod',
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

    if (!(await isRestricted(channel, 'lock'))) {
      return ctx.reply({
        embeds: [warnEmbed('⚠️ Already Unlocked', 'This channel is not currently locked.')],
        ephemeral: true,
      });
    }

    await ctx.defer({ ephemeral: true });
    await releaseRestriction(channel, 'lock', `Unlocked by ${ctx.user.tag}`);

    // ── Public notice in the unlocked channel ────────────────────────
    await channel.send({
      embeds: [
        successEmbed(
          '🔓 Channel Unlocked',
          'This channel has been unlocked by a moderator.\nYou can now send messages here again!'
        ).addFields({ name: 'Unlocked by', value: `<@${member.id}>`, inline: true }),
      ],
    });

    if (ctx.isSlash) {
      await ctx.reply({
        embeds: [successEmbed('✅ Channel Unlocked', `<#${channel.id}> has been successfully unlocked.`)],
      });
    }
  },
};
