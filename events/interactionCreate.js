const { Events, MessageFlags } = require('discord.js');
const { CommandContext } = require('../utils/context');
const { getPrefix } = require('../utils/guildConfig');
const { runCommand } = require('../handlers/commandRunner');

module.exports = {
  name: Events.InteractionCreate,
  once: false,

  /**
   * Routes every incoming slash command to its command module via the shared
   * command runner. Buttons are handled by collectors inside each command.
   *
   * @param {import('discord.js').Interaction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.warn(
        `[InteractionCreate] ⚠  No command found for: ${interaction.commandName}`
      );
      return interaction.reply({
        content: '❌ Unknown command. This may have been removed.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const prefix = await getPrefix(interaction.guildId);
    await runCommand(command, CommandContext.fromInteraction(interaction, prefix));
  },
};
