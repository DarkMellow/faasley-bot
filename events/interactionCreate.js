const { Events, EmbedBuilder } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  once: false,

  /**
   * Routes every incoming interaction to its corresponding command handler.
   * Only processes slash commands (ChatInputCommand interactions).
   *
   * @param {import('discord.js').Interaction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    // Only handle slash commands
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.warn(
        `[InteractionCreate] ⚠  No command found for: ${interaction.commandName}`
      );
      return interaction.reply({
        content: '❌ Unknown command. This may have been removed.',
        ephemeral: true,
      });
    }

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(
        `[InteractionCreate] ❌  Error executing /${interaction.commandName}:`,
        error
      );

      const errorEmbed = new EmbedBuilder()
        .setColor(0xff4757)
        .setTitle('⚠️ Something went wrong')
        .setDescription(
          'An unexpected error occurred while processing your command. Please try again later.'
        )
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};
