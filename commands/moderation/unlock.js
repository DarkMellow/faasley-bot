const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { isAuthorized, getModRoles } = require('../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('🔓 Unlock the current channel — restores @everyone send permissions.'),
    // No Discord-side default permission gate — authorization is handled entirely
    // by isAuthorized() using the allowedRoleIds whitelist in config.json.

  /**
   * Unlocks the channel by resetting SendMessages to null (inherits guild default)
   * for @everyone, effectively restoring normal access.
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
            .setDescription('You do not have permission to unlock channels.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Channel Type Guard ───────────────────────────────────────────────
    if (channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Invalid Channel')
            .setDescription('This command can only be used in text channels.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Already Unlocked Check ───────────────────────────────────────────
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
    if (!everyoneOverwrite?.deny.has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa502)
            .setTitle('⚠️ Already Unlocked')
            .setDescription('This channel is not currently locked.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Bot Permission Check ─────────────────────────────────────────────
    const botMember = guild.members.me;
    if (!channel.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('🤖 Missing Permissions')
            .setDescription('I need the **Manage Channels** permission to unlock this channel.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Defer to avoid timeout on slow edits ─────────────────────────────
    await interaction.deferReply({ ephemeral: true });

    try {
      // Reset SendMessages to null — @everyone inherits guild default (can send)
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: null,
      });

      // ── Clean up mod role overrides added during lock ───────────────────
      // Remove the explicit SendMessages:true grants so no stale overwrites remain.
      const modRoleIds = await getModRoles(guild.id);
      for (const roleId of modRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          await channel.permissionOverwrites.edit(role, { SendMessages: null });
        }
      }

      // ── Public embed in unlocked channel ───────────────────────────────
      const publicEmbed = new EmbedBuilder()
        .setColor(0x2ed573)
        .setTitle('🔓 Channel Unlocked')
        .setDescription(
          'This channel has been unlocked by a moderator.\n' +
          'You can now send messages here again!'
        )
        .addFields({
          name: 'Unlocked by',
          value: `<@${member.id}>`,
          inline: true,
        })
        .setTimestamp();

      await channel.send({ embeds: [publicEmbed] });

      // ── Ephemeral confirmation to executor ─────────────────────────────
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ed573)
            .setTitle('✅ Channel Unlocked')
            .setDescription(`<#${channel.id}> has been successfully unlocked.`)
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error('[unlock] ❌  Failed to unlock channel:', error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Error')
            .setDescription('An error occurred while unlocking the channel. Check my role hierarchy.')
            .setTimestamp(),
        ],
      });
    }
  },
};
