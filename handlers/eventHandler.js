const fs = require('fs');
const path = require('path');

/**
 * Reads every file in the events/ directory and registers it on the client
 * using client.once for one-time events (once: true) and client.on for repeating ones.
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

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }

    loaded++;
  }

  console.log(`[EventHandler] ✅  Registered ${loaded} event(s).`);
}

module.exports = { loadEvents };
