const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { supportsRestriction, isRestricted, applyRestriction } = require('../../utils/lockdown');
const { errorEmbed, warnEmbed, successEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hide')
    .setDescription('🙈 Hide this channel from @everyone — staff can still see it.'),
  level: 'mod',
  // Manage Roles in a channel = "Manage Permissions" (needed to edit overwrites).
  botPermissions: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ManageRoles,
  ],

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { channel, member } = ctx;

    if (!supportsRestriction(channel, 'hide')) {
      return ctx.reply({
        embeds: [errorEmbed('❌ Invalid Channel', 'This command can only be used in text, announcement, voice, stage, or forum channels.')],
        ephemeral: true,
      });
    }

    if (await isRestricted(channel, 'hide')) {
      return ctx.reply({
        embeds: [warnEmbed('⚠️ Already Hidden', 'This channel is already hidden from @everyone.')],
        ephemeral: true,
      });
    }

    await ctx.defer({ ephemeral: true });
    await applyRestriction(channel, 'hide', `Hidden by ${ctx.user.tag}`);

    await ctx.reply({
      embeds: [
        successEmbed(
          '🙈 Channel Hidden',
          `<#${channel.id}> is now hidden from @everyone.\nStaff can still see it.`
        ).addFields({ name: 'Hidden by', value: `<@${member.id}>`, inline: true }),
      ],
    });
  },
};
