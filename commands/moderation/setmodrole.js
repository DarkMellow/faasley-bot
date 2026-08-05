const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getModRoles, setModRoles } = require('../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setmodrole')
    .setDescription('⚙️ Manage the moderation role whitelist for this server.')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a role to the mod whitelist — members with this role can use mod commands.')
        .addRoleOption((opt) =>
          opt
            .setName('role')
            .setDescription('The role to whitelist')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a role from the mod whitelist.')
        .addRoleOption((opt) =>
          opt
            .setName('role')
            .setDescription('The role to remove')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('View all currently whitelisted mod roles in this server.')
    ),

  /**
   * Only the **Guild Owner** can use this command.
   * Adds or removes a role from the per-guild mod whitelist stored in quick.db.
   *
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const { guild, member } = interaction;
    const sub = interaction.options.getSubcommand();

    // ── Administrator permission gate ────────────────────────────────────
    // Requires the Discord "Administrator" permission flag — not a role name.
    // Server owners always pass since Discord grants them Administrator implicitly.
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('🚫 Administrator Only')
            .setDescription(
              'You need the **Administrator** permission in this server to manage the mod role whitelist.'
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    try {
      const currentRoles = await getModRoles(guild.id);

      // ── Subcommand: add ──────────────────────────────────────────────
      if (sub === 'add') {
        const role = interaction.options.getRole('role');

        if (currentRoles.includes(role.id)) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xffa502)
                .setTitle('⚠️ Already Whitelisted')
                .setDescription(`<@&${role.id}> is already in the mod whitelist.`)
                .setTimestamp(),
            ],
            ephemeral: true,
          });
        }

        await setModRoles(guild.id, [...currentRoles, role.id]);

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ed573)
              .setTitle('✅ Mod Role Added')
              .setDescription(
                `<@&${role.id}> has been added to the whitelist.\n` +
                `Members with this role can now use moderation commands.`
              )
              .setFooter({ text: `Guild: ${guild.name}` })
              .setTimestamp(),
          ],
          ephemeral: true,
        });
      }

      // ── Subcommand: remove ───────────────────────────────────────────
      if (sub === 'remove') {
        const role = interaction.options.getRole('role');

        if (!currentRoles.includes(role.id)) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xffa502)
                .setTitle('⚠️ Not in Whitelist')
                .setDescription(`<@&${role.id}> is not currently in the mod whitelist.`)
                .setTimestamp(),
            ],
            ephemeral: true,
          });
        }

        await setModRoles(guild.id, currentRoles.filter((id) => id !== role.id));

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff4757)
              .setTitle('🗑️ Mod Role Removed')
              .setDescription(
                `<@&${role.id}> has been removed from the whitelist.\n` +
                `Members with only this role can no longer use moderation commands.`
              )
              .setFooter({ text: `Guild: ${guild.name}` })
              .setTimestamp(),
          ],
          ephemeral: true,
        });
      }

      // ── Subcommand: list ─────────────────────────────────────────────
      if (sub === 'list') {
        if (currentRoles.length === 0) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x747d8c)
                .setTitle('📋 Mod Role Whitelist')
                .setDescription(
                  'No mod roles have been set for this server yet.\n' +
                  'Use `/setmodrole add <role>` to add one.'
                )
                .setTimestamp(),
            ],
            ephemeral: true,
          });
        }

        const roleList = currentRoles.map((id) => `• <@&${id}>`).join('\n');

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5352ed)
              .setTitle('📋 Mod Role Whitelist')
              .setDescription(roleList)
              .setFooter({ text: `${currentRoles.length} role(s) whitelisted • ${guild.name}` })
              .setTimestamp(),
          ],
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error('[setmodrole] ❌  Error:', error);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Error')
            .setDescription('Something went wrong while managing the whitelist. Please try again.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }
  },
};
