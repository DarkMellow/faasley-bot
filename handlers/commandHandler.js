const fs = require('fs');
const path = require('path');

/**
 * Recursively loads all command files from the commands/ directory and
 * registers them onto client.commands keyed by their name.
 *
 * @param {import('discord.js').Client} client
 */
function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const categories = fs.readdirSync(commandsPath);

  let loaded = 0;

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);

    // Only process directories (e.g. moderation/, utility/)
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const commandFiles = fs
      .readdirSync(categoryPath)
      .filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(categoryPath, file);
      const command = require(filePath);

      if (!command.data || !command.execute) {
        console.warn(
          `[CommandHandler] ⚠  Skipping ${file} — missing "data" or "execute" export.`
        );
        continue;
      }

      client.commands.set(command.data.name, command);
      loaded++;
    }
  }

  console.log(`[CommandHandler] ✅  Loaded ${loaded} command(s).`);
}

module.exports = { loadCommands };
