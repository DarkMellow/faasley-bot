const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { isAuthorized, getModRoles } = require('../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unhide')
    .setDescription('👁️ Restore @everyone visibility to this channel.'),
    // Authorization is handled entirely by isAuthorized() — no Discord-side gate.

  /**
   * Unhides the channel by resetting ViewChannel to null for @everyone,
   * letting it inherit the default guild permission (visible).
   *
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const { guild, channel, member } = interaction;

    // ── Authorization Check ──────────────────────────────────────────────
    if (!(await isAuthorized(member, guild))) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('🚫 Access Denied')
            .setDescription('You do not have permission to unhide channels.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Channel Type Guard ───────────────────────────────────────────────
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement &&
      channel.type !== ChannelType.GuildVoice
    ) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Invalid Channel')
            .setDescription('This command can only be used in text, announcement, or voice channels.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Already Visible Check ────────────────────────────────────────────
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
    if (!everyoneOverwrite?.deny.has(PermissionFlagsBits.ViewChannel)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa502)
            .setTitle('⚠️ Already Visible')
            .setDescription('This channel is not currently hidden from @everyone.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Bot Permission Check ─────────────────────────────────────────────
    if (!channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('🤖 Missing Permissions')
            .setDescription('I need the **Manage Channels** permission to unhide this channel.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Defer to avoid timeout ────────────────────────────────────────────
    await interaction.deferReply({ ephemeral: true });

    try {
      // Reset ViewChannel to null — @everyone inherits guild default (visible)
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: null,
      });

      // ── Clean up mod role overrides added during hide ───────────────────
      // Remove the explicit ViewChannel:true grants so no stale overwrites linger.
      const modRoleIds = await getModRoles(guild.id);
      for (const roleId of modRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          await channel.permissionOverwrites.edit(role, { ViewChannel: null });
        }
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ed573)
            .setTitle('👁️ Channel Visible Again')
            .setDescription(
              `<#${channel.id}> is now visible to @everyone again.`
            )
            .addFields({ name: 'Unhidden by', value: `<@${member.id}>`, inline: true })
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error('[unhide] ❌  Failed to unhide channel:', error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Error')
            .setDescription('An error occurred while unhiding the channel. Check my role hierarchy.')
            .setTimestamp(),
        ],
      });
    }
  },
};
