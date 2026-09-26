const { Events, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getAfk, clearAfk, formatDuration } = require('../utils/afk');
const { awardMessageXp } = require('../utils/levels');
const { getPrefix } = require('../utils/guildConfig');
const { CommandContext } = require('../utils/context');
const { parsePrefixArgs, formatUsage, UsageError } = require('../utils/prefixParser');
const { runCommand } = require('../handlers/commandRunner');
const { COLORS, errorEmbed } = require('../utils/embeds');

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
   *  1. Prefix commands (`?lock`, `@Bot lock`) — routed through the command runner.
   *  2. AFK Return Detection — clears AFK state when an AFK user sends a message.
   *  3. AFK Mention Check — notifies the sender if they pinged AFK users.
   *  4. "Hello" easter egg — pings the user with a cute greeting.
   *  5. Chat XP — awards XP and announces level-ups.
   *
   * Command messages skip the mention check, easter egg and XP.
   *
   * @param {import('discord.js').Message} message
   * @param {import('discord.js').Client} client
   */
  async execute(message, client) {
    // Ignore bots and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    const prefix = await getPrefix(message.guild.id);
    const invocation = parseInvocation(message, client, prefix);

    // Running /afk or ?afk while AFK shouldn't count as "coming back".
    if (invocation?.command.data.name !== 'afk') {
      await handleAfkReturn(message);
    }

    if (invocation) {
      await runPrefixCommand(message, invocation, prefix);
      return;
    }

    await handleAfkMentions(message);
    await handleHello(message);
    await handleChatXp(message);
  },
};

// ── Chat Leveling ──────────────────────────────────────────────────────────

/**
 * Awards chat XP (see utils/levels.js) and announces level-ups in the channel.
 */
async function handleChatXp(message) {
  const newLevel = await awardMessageXp(message);
  if (newLevel === null) return;

  await message.channel
    .send({
      content: `🎉 <@${message.author.id}> reached **chat level ${newLevel}**!`,
      allowedMentions: { users: [message.author.id] },
    })
    .catch(() => {}); // Missing Send Messages here — skip the announcement
}

// ── Prefix Commands ────────────────────────────────────────────────────────

/**
 * Detects `<prefix>command args` or `@Bot command args`.
 * Whitespace after the prefix is allowed (`? lock`).
 *
 * @returns {{ command: object, argString: string }|null}
 */
function parseInvocation(message, client, prefix) {
  const { content } = message;
  let rest;

  if (content.startsWith(prefix)) {
    rest = content.slice(prefix.length);
  } else {
    const mention = content.match(new RegExp(`^<@!?${client.user.id}>`));
    if (!mention) return null;
    rest = content.slice(mention[0].length);
  }

  rest = rest.trimStart();
  const name = rest.match(/^\S+/)?.[0];
  if (!name) return null;

  const command = client.commands.get(name.toLowerCase());
  if (!command) return null;

  return { command, argString: rest.slice(name.length) };
}

async function runPrefixCommand(message, { command, argString }, prefix) {
  const json = command.data.toJSON();

  let options;
  try {
    options = await parsePrefixArgs(message.guild, json, argString);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    const usage = formatUsage(prefix, json).map((line) => `\`${line}\``).join('\n');
    await message
      .reply({
        embeds: [errorEmbed('❌ Invalid Usage', `${error.message}\n\n**Usage:**\n${usage}`)],
        allowedMentions: { repliedUser: false },
        failIfNotExists: false,
      })
      .catch(() => {});
    return;
  }

  await runCommand(command, CommandContext.fromMessage(message, options, prefix));
}

// ── AFK ────────────────────────────────────────────────────────────────────

/**
 * If the message author is marked as AFK, clear their status, restore their
 * nickname and send a short-lived welcome back message.
 */
async function handleAfkReturn(message) {
  const { guild, author, member } = message;

  const authorAfk = await getAfk(guild.id, author.id);
  if (!authorAfk) return;

  await clearAfk(guild.id, author.id);

  // ── Restore original nickname if the bot changed it ────────────────
  // Older records have no nicknameChanged flag — fall back to the [AFK] tag.
  const nicknameChanged = authorAfk.nicknameChanged ?? member?.displayName.startsWith('[AFK]');
  if (
    member &&
    nicknameChanged &&
    member.manageable &&
    guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)
  ) {
    await member.setNickname(authorAfk.originalNickname).catch(() => {
      // Nickname restoration is optional
    });
  }

  // ── Welcome back message (auto-deletes after 5 seconds) ────────────
  try {
    const elapsed = formatDuration(Date.now() - authorAfk.timestamp);
    const welcomeBack = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.success)
          .setDescription(`👋 Welcome back <@${author.id}>! I removed your AFK status. *(Away for ${elapsed})*`)
          .setTimestamp(),
      ],
      failIfNotExists: false,
    });

    setTimeout(() => {
      welcomeBack.delete().catch(() => {}); // Ignore if already deleted
    }, 5000);
  } catch (error) {
    console.error('[MessageCreate] ❌  Failed to send AFK return message:', error);
  }
}

/**
 * If any mentioned members are AFK, reply once listing all of them.
 */
async function handleAfkMentions(message) {
  const { guild, author } = message;
  const mentionedMembers = message.mentions.members;
  if (!mentionedMembers || mentionedMembers.size === 0) return;

  const lines = [];
  for (const [, mentioned] of mentionedMembers) {
    if (mentioned.id === author.id || mentioned.user.bot) continue;

    const afkData = await getAfk(guild.id, mentioned.id);
    if (!afkData) continue;

    const elapsed = formatDuration(Date.now() - afkData.timestamp);
    lines.push(`💤 <@${mentioned.id}> — **${afkData.reason}** *(away for ${elapsed})*`);
  }

  if (lines.length === 0) return;

  try {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.muted)
          .setTitle(lines.length === 1 ? '💤 That user is AFK' : '💤 Those users are AFK')
          .setDescription(lines.join('\n'))
          .setTimestamp(),
      ],
      failIfNotExists: false,
    });
  } catch (error) {
    console.error('[MessageCreate] ❌  Failed to send AFK mention reply:', error);
  }
}

// ── Easter Egg ─────────────────────────────────────────────────────────────

async function handleHello(message) {
  if (!/\bhello\b/i.test(message.content)) return;

  try {
    const raw = HELLO_RESPONSES[Math.floor(Math.random() * HELLO_RESPONSES.length)];
    const response = raw.replace('{user}', `<@${message.author.id}>`);

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff85a1)
          .setDescription(response)
          .setFooter({ text: '(っ◔◡◔)っ  Faasle Bot says hi~' })
          .setTimestamp(),
      ],
      failIfNotExists: false,
    });
  } catch (error) {
    console.error('[MessageCreate] ❌  Failed to send Hello response:', error);
  }
}
