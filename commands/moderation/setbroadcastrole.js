const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getBroadcastRoles, setBroadcastRoles } = require('../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setbroadcastrole')
    .setDescription('📡 Manage which roles are allowed to use the /broadcast command.')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Allow a role to use /broadcast (must also have a mod role).')
        .addRoleOption((opt) =>
          opt.setName('role').setDescription('The role to whitelist').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Revoke a role\'s access to /broadcast.')
        .addRoleOption((opt) =>
          opt.setName('role').setDescription('The role to remove').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('View all roles currently whitelisted for /broadcast.')
    ),

  /**
   * Manages the broadcast-specific role whitelist.
   * Requires the Discord Administrator permission — same gate as /setmodrole.
   *
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const { guild, member } = interaction;
    const sub = interaction.options.getSubcommand();

    // ── Administrator-only gate ──────────────────────────────────────────
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('🚫 Administrator Only')
            .setDescription(
              'You need the **Administrator** permission to manage broadcast roles.'
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    try {
      const currentRoles = await getBroadcastRoles(guild.id);

      // ── add ─────────────────────────────────────────────────────────────
      if (sub === 'add') {
        const role = interaction.options.getRole('role');

        if (currentRoles.includes(role.id)) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xffa502)
                .setTitle('⚠️ Already Whitelisted')
                .setDescription(`<@&${role.id}> is already allowed to use **/broadcast**.`)
                .setTimestamp(),
            ],
            ephemeral: true,
          });
        }

        await setBroadcastRoles(guild.id, [...currentRoles, role.id]);

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ed573)
              .setTitle('✅ Broadcast Role Added')
              .setDescription(
                `<@&${role.id}> can now use **/broadcast**.\n` +
                `*(They must also hold a whitelisted mod role.)*`
              )
              .setFooter({ text: guild.name })
              .setTimestamp(),
          ],
          ephemeral: true,
        });
      }

      // ── remove ───────────────────────────────────────────────────────────
      if (sub === 'remove') {
        const role = interaction.options.getRole('role');

        if (!currentRoles.includes(role.id)) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xffa502)
                .setTitle('⚠️ Not Whitelisted')
                .setDescription(`<@&${role.id}> is not in the broadcast whitelist.`)
                .setTimestamp(),
            ],
            ephemeral: true,
          });
        }

        await setBroadcastRoles(guild.id, currentRoles.filter((id) => id !== role.id));

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff4757)
              .setTitle('🗑️ Broadcast Role Removed')
              .setDescription(`<@&${role.id}> can no longer use **/broadcast**.`)
              .setFooter({ text: guild.name })
              .setTimestamp(),
          ],
          ephemeral: true,
        });
      }

      // ── list ─────────────────────────────────────────────────────────────
      if (sub === 'list') {
        if (currentRoles.length === 0) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x747d8c)
                .setTitle('📡 Broadcast Role Whitelist')
                .setDescription(
                  'No broadcast roles set yet.\n' +
                  'Use `/setbroadcastrole add <role>` to add one.'
                )
                .setTimestamp(),
            ],
            ephemeral: true,
          });
        }

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5352ed)
              .setTitle('📡 Broadcast Role Whitelist')
              .setDescription(currentRoles.map((id) => `• <@&${id}>`).join('\n'))
              .setFooter({ text: `${currentRoles.length} role(s) • ${guild.name}` })
              .setTimestamp(),
          ],
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error('[setbroadcastrole] ❌  Error:', error);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Error')
            .setDescription('Something went wrong. Please try again.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }
  },
};
