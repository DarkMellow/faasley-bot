const { ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,

  /**
   * Fires once after the bot has successfully connected to Discord.
   * Logs startup info and sets the bot's activity status.
   *
   * @param {import('discord.js').Client} client
   */
  execute(client) {
    console.log('─'.repeat(50));
    console.log(`[Ready] 🤖  Logged in as ${client.user.tag}`);
    console.log(`[Ready] 📡  Serving ${client.guilds.cache.size} guild(s)`);
    console.log('─'.repeat(50));

    client.user.setPresence({
      activities: [
        {
          name: 'over the server 👀',
          type: ActivityType.Watching,
        },
      ],
      status: 'online',
    });
  },
};
