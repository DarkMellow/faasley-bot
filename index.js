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
  ],
});

// ── Collections ────────────────────────────────────────────────────────────
client.commands = new Collection();

// ── Handler Bootstrap ──────────────────────────────────────────────────────
loadCommands(client);
loadEvents(client);

// ── Login ──────────────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);
