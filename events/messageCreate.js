const { Events, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getAfk, clearAfk, formatDuration } = require('../utils/afk');

// ── Hello responses pool ───────────────────────────────────────────────────
const HELLO_RESPONSES = [
  'Hewwoooo {user}!! 🌸 Hope your day is as bright as you are! ✨',
  'Oh hai {user}!! 🐣 You just made my circuits go brrr~ 💖',
  "Heyyyy {user}!! 🌼 I've been waiting for someone to say hi! (Not really but shh 🤫)",
  'HEWWO {user}!! 🎀 You\'re officially the cutest person in this server rn 🥺',
  'Hellooo {user}~~ 🌙 May your day be full of cookies and good vibes 🍪💫',
];

module.exports = {
  name: Events.MessageCreate,
  once: false,

  /**
   * Handles all message-based logic:
   *
   *  1. "Hello" easter egg — pings the user with a cute greeting.
   *  2. AFK Return Detection — clears AFK state when an AFK user sends a message.
   *  3. AFK Mention Check — notifies the sender if they pinged an AFK user.
   *
   * @param {import('discord.js').Message} message
   * @param {import('discord.js').Client} client
   */
  async execute(message, client) {
    // Ignore bots and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    const { guild, author, member } = message;

    // ── Easter Egg: Hello Detector ─────────────────────────────────────
    if (/\bhello\b/i.test(message.content)) {
      try {
        const raw = HELLO_RESPONSES[Math.floor(Math.random() * HELLO_RESPONSES.length)];
        const response = raw.replace('{user}', `<@${author.id}>`);

        const helloEmbed = new EmbedBuilder()
          .setColor(0xff85a1)
          .setDescription(response)
          .setFooter({ text: '(っ◔◡◔)っ  Faasle Bot says hi~' })
          .setTimestamp();

        await message.reply({ embeds: [helloEmbed] });
      } catch (error) {
        console.error('[MessageCreate] ❌  Failed to send Hello response:', error);
      }
      return; // Don't process AFK logic after the easter egg fires
    }

    // ── Logic 1: AFK Return Detection ─────────────────────────────────────
    // If the message author is marked as AFK, clear their status.
    const authorAfk = await getAfk(guild.id, author.id);

    if (authorAfk) {
      await clearAfk(guild.id, author.id);

      // ── Restore original nickname if it was modified ─────────────────
      if (member) {
        const botMember = guild.members.me;
        const canManageNick =
          botMember.permissions.has(PermissionFlagsBits.ManageNicknames) &&
          member.id !== guild.ownerId &&
          member.roles.highest.position < botMember.roles.highest.position;

        if (canManageNick && member.displayName.startsWith('[AFK]')) {
          try {
            // Restore to originalNickname (null = revert to username)
            await member.setNickname(authorAfk.originalNickname);
          } catch {
            // Silently ignore — nickname restoration is optional
          }
        }
      }

      // ── Welcome back message (auto-deletes after 5 seconds) ──────────
      try {
        const elapsed = formatDuration(Date.now() - authorAfk.timestamp);
        const welcomeBack = await message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ed573)
              .setDescription(`👋 Welcome back <@${author.id}>! I removed your AFK status. *(Away for ${elapsed})*`)
              .setTimestamp(),
          ],
        });

        setTimeout(() => {
          welcomeBack.delete().catch(() => {}); // Ignore if already deleted
        }, 5000);
      } catch (error) {
        console.error('[MessageCreate] ❌  Failed to send AFK return message:', error);
      }

      // Continue — the message might also mention other AFK users below
    }

    // ── Logic 2: AFK Mention Check ─────────────────────────────────────
    // Check all mentioned members — if any are AFK, notify the sender.
    const mentionedMembers = message.mentions.members;
    if (!mentionedMembers || mentionedMembers.size === 0) return;

    for (const [, mentionedMember] of mentionedMembers) {
      // Don't notify about your own AFK if you just returned
      if (mentionedMember.id === author.id) continue;
      // Ignore bots in mention checks
      if (mentionedMember.user.bot) continue;

      const afkData = await getAfk(guild.id, mentionedMember.id);
      if (!afkData) continue;

      const elapsed = formatDuration(Date.now() - afkData.timestamp);

      try {
        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x747d8c)
              .setTitle('💤 That user is AFK')
              .addFields(
                { name: 'User',      value: `<@${mentionedMember.id}>`, inline: true },
                { name: 'Reason',    value: afkData.reason,             inline: true },
                { name: 'Away for',  value: elapsed,                    inline: true }
              )
              .setFooter({ text: 'They\'ll be notified when they return.' })
              .setTimestamp(),
          ],
        });
      } catch (error) {
        console.error('[MessageCreate] ❌  Failed to send AFK mention reply:', error);
      }
    }
  },
};
