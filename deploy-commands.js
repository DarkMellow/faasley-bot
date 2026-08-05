require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ── Collect all command data objects ──────────────────────────────────────
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const categories = fs.readdirSync(commandsPath);

for (const category of categories) {
  const categoryPath = path.join(commandsPath, category);
  if (!fs.statSync(categoryPath).isDirectory()) continue;

  const commandFiles = fs
    .readdirSync(categoryPath)
    .filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(categoryPath, file));
    if (command.data) {
      commands.push(command.data.toJSON());
      console.log(`  ↳ Queued: /${command.data.name}`);
    }
  }
}

// ── Deploy via REST (Global) ───────────────────────────────────────────────
// Global commands work in every server the bot is in.
// ⚠️  Changes take up to 1 hour to propagate across Discord.
const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`\n🚀  Deploying ${commands.length} slash command(s) globally…`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log(`✅  Successfully registered ${data.length} global command(s).`);
    console.log('⏳  Note: Global commands can take up to 1 hour to appear in all servers.\n');
  } catch (error) {
    console.error('❌  Failed to deploy commands:', error);
    process.exit(1);
  }
})();
