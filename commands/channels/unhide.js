const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { supportsRestriction, isRestricted, releaseRestriction } = require('../../utils/lockdown');
const { errorEmbed, warnEmbed, successEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unhide')
    .setDescription('👁️ Make this channel visible to @everyone again.'),
  level: 'mod',
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

    if (!(await isRestricted(channel, 'hide'))) {
      return ctx.reply({
        embeds: [warnEmbed('⚠️ Already Visible', 'This channel is not currently hidden from @everyone.')],
        ephemeral: true,
      });
    }

    await ctx.defer({ ephemeral: true });
    await releaseRestriction(channel, 'hide', `Unhidden by ${ctx.user.tag}`);

    await ctx.reply({
      embeds: [
        successEmbed('👁️ Channel Visible Again', `<#${channel.id}> is now visible to @everyone again.`)
          .addFields({ name: 'Unhidden by', value: `<@${member.id}>`, inline: true }),
      ],
    });
  },
};
