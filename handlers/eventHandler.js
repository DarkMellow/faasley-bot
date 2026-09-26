const fs = require('fs');
const path = require('path');

/**
 * Reads every file in the events/ directory and registers it on the client
 * using client.once for one-time events (once: true) and client.on for repeating ones.
 * Handler errors are caught and logged so a single failure can't crash the bot.
 *
 * @param {import('discord.js').Client} client
 */
function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith('.js'));

  let loaded = 0;

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (!event.name || !event.execute) {
      console.warn(
        `[EventHandler] ⚠  Skipping ${file} — missing "name" or "execute" export.`
      );
      continue;
    }

    const listener = async (...args) => {
      try {
        await event.execute(...args, client);
      } catch (error) {
        console.error(`[EventHandler] ❌  Error in ${event.name} handler:`, error);
      }
    };

    if (event.once) {
      client.once(event.name, listener);
    } else {
      client.on(event.name, listener);
    }

    loaded++;
  }

  console.log(`[EventHandler] ✅  Registered ${loaded} event(s).`);
}

module.exports = { loadEvents };
