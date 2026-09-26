const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { LEVEL_INFO } = require('../../utils/permissions');
const { formatUsage } = require('../../utils/prefixParser');
const { COLORS } = require('../../utils/embeds');

// ── Categories ─────────────────────────────────────────────────────────────
// Pages are generated from the loaded commands, so help never goes stale.
// A category is the command's folder name under commands/. `order` lists
// related commands together; commands not listed are shown after them.
const CATEGORIES = {
  channels:   { label: 'Channels',   emoji: '🔒', color: COLORS.info,    order: ['lock', 'unlock', 'hide', 'unhide'] },
  moderation: {
    label: 'Moderation', emoji: '🔨', color: COLORS.error,
    order: ['warn', 'warnings', 'clearwarns', 'timeout', 'untimeout', 'kick', 'ban', 'unban', 'role'],
  },
  levels:     { label: 'Levels',     emoji: '📊', color: COLORS.info,    order: ['rank', 'leaderboard', 'xpchannel'] },
  utility:    { label: 'Utility',    emoji: '🛠️', color: COLORS.success, order: ['afk', 'help'] },
  admin:      { label: 'Admin',      emoji: '⚙️', color: COLORS.warn,    order: ['config', 'broadcast'] },
};

function commandsIn(client, category) {
  const rank = (name) => {
    const i = CATEGORIES[category].order.indexOf(name);
    return i === -1 ? Infinity : i;
  };
  return [...client.commands.filter((c) => c.category === category).values()]
    .sort((a, b) => rank(a.data.name) - rank(b.data.name));
}

const levelText = (level) => `**${LEVEL_INFO[level].label}** (${LEVEL_INFO[level].requirement})`;

function buildOverviewEmbed(client, prefix) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('📖  Faasle Bot — Help')
    .setDescription(
      `Use any command with \`/\` or the prefix \`${prefix}\`.\n` +
      'Pick a category from the menu below to see what each command does.'
    )
    .setFooter({ text: 'Faasle Bot' });

  for (const [category, info] of Object.entries(CATEGORIES)) {
    const names = commandsIn(client, category).map((c) => `\`${c.data.name}\``).join('  ');
    if (names) embed.addFields({ name: `${info.emoji}  ${info.label}`, value: names });
  }

  return embed;
}

function buildCategoryEmbed(client, category, prefix) {
  const info = CATEGORIES[category];
  const commands = commandsIn(client, category);

  // Show "who can use" once per page when every command shares a level.
  const levels = new Set(commands.map((c) => c.level));
  const sharedLevel = levels.size === 1 ? commands[0].level : null;

  const entries = commands.map((command) => {
    const json = command.data.toJSON();
    // Long subcommand lists read better one per line.
    const usageLines = formatUsage(prefix, json).map((line) => `\`${line}\``);
    const usage = usageLines.join(usageLines.length > 2 ? '\n' : '  ·  ');
    const tag = sharedLevel ? '' : `  —  ${LEVEL_INFO[command.level].label}`;
    return `${usage}${tag}\n${json.description}`;
  });

  if (category === 'utility') {
    entries.push('👋  Say `hello` in chat and the bot will greet you back.');
  }

  let description = entries.join('\n\n');
  if (sharedLevel) {
    description += `\n\n**Who can use:** ${levelText(sharedLevel)}`;
  } else {
    const present = Object.keys(LEVEL_INFO).filter((level) => levels.has(level));
    description += `\n\n**Who can use:** the level shown next to each command\n` +
      present.map((level) => `• ${levelText(level)}`).join('\n');
  }

  return new EmbedBuilder()
    .setColor(info.color)
    .setTitle(`${info.emoji}  ${info.label}`)
    .setDescription(description)
    .setFooter({ text: '<required>   [optional]' });
}

const MENU_ID = 'help_menu';

/**
 * A dropdown with Overview plus one entry per category. A dropdown (rather
 * than buttons) has room for up to 25 pages.
 */
function buildNavRow(activePage, disabled = false) {
  const pages = [['overview', { label: 'Overview', emoji: '📖' }], ...Object.entries(CATEGORIES)];

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MENU_ID)
      .setPlaceholder(disabled ? 'Help menu expired — run help again' : 'Choose a category…')
      .setDisabled(disabled)
      .addOptions(
        pages.map(([page, info]) => ({
          label: info.label,
          value: page,
          emoji: info.emoji,
          default: page === activePage && !disabled,
        }))
      )
  );
}

function getPageEmbed(client, page, prefix) {
  return page in CATEGORIES
    ? buildCategoryEmbed(client, page, prefix)
    : buildOverviewEmbed(client, prefix);
}

// ── Command ────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📖 Show all commands and how to use them.'),
  level: 'everyone',

  /**
   * Sends a paginated help menu. A dropdown switches between Overview and
   * each category. The dropdown is disabled after 5 minutes.
   *
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { client, prefix } = ctx;

    const response = await ctx.reply({
      embeds: [getPageEmbed(client, 'overview', prefix)],
      components: [buildNavRow('overview')],
      ephemeral: true,
    });

    const collector = response.createMessageComponentCollector({
      filter: (i) => i.user.id === ctx.user.id && i.customId === MENU_ID,
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async (menu) => {
      const page = menu.values[0];
      await menu
        .update({
          embeds: [getPageEmbed(client, page, prefix)],
          components: [buildNavRow(page)],
        })
        .catch(() => {});
    });

    collector.on('end', async () => {
      await response.edit({ components: [buildNavRow(null, true)] }).catch(() => {});
    });
  },
};
