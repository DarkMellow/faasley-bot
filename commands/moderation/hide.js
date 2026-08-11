const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { isAuthorized, getModRoles } = require('../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hide')
    .setDescription('🙈 Hide this channel from @everyone — staff with overrides can still see it.'),
    // Authorization is handled entirely by isAuthorized() — no Discord-side gate.

  /**
   * Hides the channel by setting ViewChannel: false for @everyone.
   * Roles with an explicit ViewChannel: true override (e.g. Staff) are unaffected.
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
            .setDescription('You do not have permission to hide channels.')
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

    // ── Already Hidden Check ─────────────────────────────────────────────
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
    if (everyoneOverwrite?.deny.has(PermissionFlagsBits.ViewChannel)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa502)
            .setTitle('⚠️ Already Hidden')
            .setDescription('This channel is already hidden from @everyone.')
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
            .setDescription('I need the **Manage Channels** permission to hide this channel.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Defer to avoid timeout ────────────────────────────────────────────
    await interaction.deferReply({ ephemeral: true });

    try {
      // Set ViewChannel: false for @everyone — all other overwrites preserved
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: false,
      });

      // ── Preserve visibility for whitelisted mod roles ───────────────────
      // Explicitly grant ViewChannel:true so moderators can still see
      // the hidden channel and unhide it when needed.
      const modRoleIds = await getModRoles(guild.id);
      for (const roleId of modRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          await channel.permissionOverwrites.edit(role, { ViewChannel: true });
        }
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ed573)
            .setTitle('🙈 Channel Hidden')
            .setDescription(
              `<#${channel.id}> is now hidden from @everyone.\n` +
              `Roles with explicit **View Channel** overrides can still see it.`
            )
            .addFields({ name: 'Hidden by', value: `<@${member.id}>`, inline: true })
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error('[hide] ❌  Failed to hide channel:', error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Error')
            .setDescription('An error occurred while hiding the channel. Check my role hierarchy.')
            .setTimestamp(),
        ],
      });
    }
  },
};
