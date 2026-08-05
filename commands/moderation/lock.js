const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { isAuthorized } = require('../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('🔒 Lock the current channel — prevents @everyone from sending messages.'),
    // No Discord-side default permission gate — authorization is handled entirely
    // by isAuthorized() using the allowedRoleIds whitelist in config.json.

  /**
   * Locks the channel by setting SendMessages: false for @everyone.
   * Roles with an explicit SendMessages: true override are unaffected.
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
            .setDescription('You do not have permission to lock channels.')
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

    // ── Already Locked Check ─────────────────────────────────────────────
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
    if (everyoneOverwrite?.deny.has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa502)
            .setTitle('⚠️ Already Locked')
            .setDescription('This channel is already locked.')
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
            .setDescription('I need the **Manage Channels** permission to lock this channel.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Defer to avoid timeout on slow edits ─────────────────────────────
    await interaction.deferReply({ ephemeral: true });

    try {
      // Lock @everyone — only deny SendMessages, preserve all other overwrites
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
      });

      // ── Public embed in locked channel ─────────────────────────────────
      const publicEmbed = new EmbedBuilder()
        .setColor(0xff4757)
        .setTitle('🔒 Channel Locked')
        .setDescription(
          'This channel has been locked by a moderator.\n' +
          'Only authorized staff can send messages here.'
        )
        .addFields({
          name: 'Locked by',
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
            .setTitle('✅ Channel Locked')
            .setDescription(`<#${channel.id}> has been successfully locked.`)
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error('[lock] ❌  Failed to lock channel:', error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Error')
            .setDescription('An error occurred while locking the channel. Check my role hierarchy.')
            .setTimestamp(),
        ],
      });
    }
  },
};
