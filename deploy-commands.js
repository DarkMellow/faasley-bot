require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { readCommands } = require('./handlers/commandHandler');

// ── Usage ──────────────────────────────────────────────────────────────────
//   npm run deploy          → register globally (up to 1 hour to propagate)
//   npm run deploy:guild    → register to GUILD_ID only (instant, for testing)
//   npm run deploy:guild -- <serverId>   → same, without setting GUILD_ID
//
// ⚠️  If you've deployed both ways, commands appear twice in the test server.
//     Clear one scope by deploying an empty list to it.
const guildFlag = process.argv.indexOf('--guild');
const toGuild = guildFlag !== -1;
const guildId = process.argv[guildFlag + 1] ?? process.env.GUILD_ID;

// ── Collect all command data objects ──────────────────────────────────────
const commands = readCommands().map((command) => {
  console.log(`  ↳ Queued: /${command.data.name}  (${command.level})`);
  return command.data.toJSON();
});

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    if (toGuild && !/^\d{17,20}$/.test(guildId ?? '')) {
      console.error(
        '\n❌  No valid test server ID found.\n' +
        '   Add GUILD_ID=<your server ID> to .env, or run: npm run deploy:guild -- <serverId>\n' +
        '   To copy a server ID: Discord → User Settings → Advanced → enable Developer Mode,\n' +
        '   then right-click the server icon → Copy Server ID.\n'
      );
      process.exit(1);
    }

    const route = toGuild
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    console.log(`\n🚀  Deploying ${commands.length} slash command(s) ${toGuild ? `to guild ${guildId}` : 'globally'}…`);

    const data = await rest.put(route, { body: commands });

    console.log(`✅  Successfully registered ${data.length} command(s).`);
    if (!toGuild) {
      console.log('⏳  Note: Global commands can take up to 1 hour to appear in all servers.\n');
    }
    process.exit(0);
  } catch (error) {
    console.error('❌  Failed to deploy commands:', error);
    process.exit(1);
  }
})();
