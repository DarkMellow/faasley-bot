const { Events, EmbedBuilder } = require('discord.js');

// ── Hello responses pool ───────────────────────────────────────────────────
const HELLO_RESPONSES = [
  'Hewwoooo {user}!! 🌸 Hope your day is as bright as you are! ✨',
  'Oh hai {user}!! 🐣 You just made my circuits go brrr~ 💖',
  'Heyyyy {user}!! 🌼 I\'ve been waiting for someone to say hi! (Not really but shh 🤫)',
  'HEWWO {user}!! 🎀 You\'re officially the cutest person in this server rn 🥺',
  'Hellooo {user}~~ 🌙 May your day be full of cookies and good vibes 🍪💫',
];

module.exports = {
  name: Events.MessageCreate,
  once: false,

  /**
   * Handles all message-based logic:
   *  1. "Hellow" easter egg — pings the user with a cute greeting.
   *  2. (Future) AFK detection & mention checks (Phase 5).
   *
   * @param {import('discord.js').Message} message
   * @param {import('discord.js').Client} client
   */
  async execute(message, client) {
    // Ignore bots and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    // ── Easter Egg: "Hellow" Detector ─────────────────────────────────────
    // Case-insensitive check — triggers if the message contains "hellow"
    if (/\bhello\b/i.test(message.content)) {
      try {
        // Pick a random response and inject the user mention
        const raw = HELLO_RESPONSES[Math.floor(Math.random() * HELLO_RESPONSES.length)];
        const response = raw.replace('{user}', `<@${message.author.id}>`);

        const helloEmbed = new EmbedBuilder()
          .setColor(0xff85a1)   // soft pink
          .setDescription(response)
          .setFooter({ text: '(っ◔◡◔)っ  Faasle Bot says hi~' })
          .setTimestamp();

        await message.reply({ embeds: [helloEmbed] });
      } catch (error) {
        console.error('[MessageCreate] ❌  Failed to send Hellow response:', error);
      }
      return; // stop further processing for this message
    }

    // ── Phase 5 Placeholder: AFK Logic ────────────────────────────────────
    // AFK detection and mention checks will be wired here in Phase 5.
  },
};
