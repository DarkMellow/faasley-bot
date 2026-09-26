require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');

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

// ── Handler Bootstrap ──────────────────────────────────────────────────────
loadCommands(client);
loadEvents(client);

// ── Crash Safety ───────────────────────────────────────────────────────────
// Log unexpected failures instead of letting a single rejected promise or
// client error take the whole bot offline.
client.on('error', (error) => console.error('[Client] ❌  Client error:', error));
process.on('unhandledRejection', (reason) => console.error('[Process] ❌  Unhandled rejection:', reason));

// ── Login ──────────────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);
