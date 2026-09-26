require('dotenv').config({ quiet: true });
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const db = require('./utils/db');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');
const { startHealthServer } = require('./utils/healthServer');

// ── Client Initialization ──────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates, // voice XP: who is in which voice channel
  ],
});

// ── Collections ────────────────────────────────────────────────────────────
client.commands = new Collection();

// ── Crash Safety ───────────────────────────────────────────────────────────
// Log unexpected failures instead of letting a single rejected promise or
// client error take the whole bot offline.
client.on('error', (error) => console.error('[Client] ❌  Client error:', error));
process.on('unhandledRejection', (reason) => console.error('[Process] ❌  Unhandled rejection:', reason));

// ── Startup ────────────────────────────────────────────────────────────────
(async () => {
  if (!process.env.BOT_TOKEN) {
    console.error('[Startup] ❌  BOT_TOKEN is not set. Add it to .env (local) or your host\'s environment variables.');
    process.exit(1);
  }

  // The HTTP server starts first so the host sees an open port immediately.
  startHealthServer(client);

  try {
    await db.connect();
  } catch (error) {
    console.error('[Startup] ❌  Could not connect to the database:', error);
    process.exit(1); // let the host restart the process
  }

  loadCommands(client);
  loadEvents(client);

  await client.login(process.env.BOT_TOKEN);
})().catch((error) => {
  console.error('[Startup] ❌  Failed to start:', error);
  process.exit(1);
});
