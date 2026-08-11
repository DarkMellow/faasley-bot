const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

// ── Page Definitions ───────────────────────────────────────────────────────

/**
 * Returns the Overview (landing) embed shown when /help is first run.
 */
function buildOverviewEmbed() {
  return new EmbedBuilder()
    .setColor(0x5352ed)
    .setTitle('📖  Faasle Bot — Command Reference')
    .setDescription(
      'Welcome! Use the buttons below to browse commands by category.\n\n' +
      '> 🔨 **Moderation** — Channel lock, hide, and role management\n' +
      '> 🛠️ **Utility** — AFK system and broadcast messaging\n' +
      '> ⚙️ **Admin Setup** — Configure bot permissions for this server'
    )
    .addFields({
      name: '🔑 Permission Tiers',
      value:
        '`Everyone` — No role needed\n' +
        '`Mod Role` — Requires a whitelisted mod role (`/setmodrole`)\n' +
        '`Mod + Broadcast` — Requires both a mod role **and** a broadcast role (`/setbroadcastrole`)\n' +
        '`Administrator` — Requires the Discord **Administrator** permission\n' +
        '`Server Owner` — Always bypasses all role checks',
    })
    .setFooter({ text: 'Faasle Bot  •  Select a category below' })
    .setTimestamp();
}

/**
 * Returns the Moderation commands embed.
 */
function buildModerationEmbed() {
  return new EmbedBuilder()
    .setColor(0xff4757)
    .setTitle('🔨  Moderation Commands')
    .setDescription('All moderation commands require a **Mod Role** (or Server Owner).')
    .addFields(
      {
        name: '🔒  `/lock`',
        value:
          'Locks the current channel — prevents `@everyone` from sending messages.\n' +
          'Whitelisted mod roles automatically keep their send access.\n' +
          '**Requires:** Mod Role',
      },
      {
        name: '🔓  `/unlock`',
        value:
          'Unlocks the current channel — restores `@everyone` send permissions.\n' +
          'Cleans up mod role overrides set during lock.\n' +
          '**Requires:** Mod Role',
      },
      {
        name: '🙈  `/hide`',
        value:
          'Hides the current channel from `@everyone` (they can\'t see it in the channel list).\n' +
          'Whitelisted mod roles automatically retain visibility so they can unhide it.\n' +
          '**Requires:** Mod Role',
      },
      {
        name: '👁️  `/unhide`',
        value:
          'Restores `@everyone` visibility to the current channel.\n' +
          'Cleans up mod role visibility overrides set during hide.\n' +
          '**Requires:** Mod Role',
      },
      {
        name: '🎭  `/role <target> <role> <action>`',
        value:
          'Adds or removes a role from a server member with full hierarchy validation.\n' +
          '`action` → `Add` or `Remove`\n' +
          'Rejects: managed roles, roles above your position, members above your rank.\n' +
          '**Requires:** Mod Role  •  Bot needs `Manage Roles`',
      }
    )
    .setFooter({ text: 'Faasle Bot  •  Moderation' })
    .setTimestamp();
}

/**
 * Returns the Utility commands embed.
 */
function buildUtilityEmbed() {
  return new EmbedBuilder()
    .setColor(0x2ed573)
    .setTitle('🛠️  Utility Commands')
    .addFields(
      {
        name: '💤  `/afk [reason]`',
        value:
          'Marks you as AFK in this server.\n' +
          '• `reason` is optional and defaults to `"AFK"`.\n' +
          '• If the bot can manage your nickname, it will prepend `[AFK]` to your display name.\n' +
          '• Anyone who mentions you while you\'re AFK will be notified automatically.\n' +
          '• Send **any message** to automatically clear your AFK status.\n' +
          '**Requires:** Anyone',
      },
      {
        name: '📣  `/broadcast <message> [role]`',
        value:
          'Sends a DM to members of this server.\n' +
          '• If `role` is provided → only DMs members with that role (no confirmation needed).\n' +
          '• If `role` is omitted → shows a ⚠️ confirmation before DMing **everyone**.\n' +
          '• Members with DMs disabled are skipped — a delivery report is shown at the end.\n' +
          '**Requires:** Mod Role **+** Broadcast Role  •  *Both are required*',
      },
      {
        name: '👋  Say `hello` in chat',
        value:
          'A hidden easter egg — type the word `hello` in any channel and the bot will ping you back with a cute greeting.\n' +
          '**Requires:** Anyone',
      }
    )
    .setFooter({ text: 'Faasle Bot  •  Utility' })
    .setTimestamp();
}

/**
 * Returns the Admin Setup commands embed.
 */
function buildAdminEmbed() {
  return new EmbedBuilder()
    .setColor(0xffa502)
    .setTitle('⚙️  Admin Setup Commands')
    .setDescription(
      'These commands configure the bot for your server.\n' +
      'All require the Discord **Administrator** permission.'
    )
    .addFields(
      {
        name: '🛡️  `/setmodrole add | remove | list [role]`',
        value:
          'Manages the **mod role whitelist** — roles in this list can use `/lock`, `/unlock`, `/hide`, `/unhide`, and `/role`.\n' +
          '`add <role>` → Whitelist a role\n' +
          '`remove <role>` → Remove a role from the whitelist\n' +
          '`list` → Show all currently whitelisted roles\n' +
          '**Requires:** Administrator',
      },
      {
        name: '📡  `/setbroadcastrole add | remove | list [role]`',
        value:
          'Manages the **broadcast role whitelist** — roles in this list (who *also* have a mod role) can use `/broadcast`.\n' +
          '`add <role>` → Whitelist a role for broadcasting\n' +
          '`remove <role>` → Remove a broadcast role\n' +
          '`list` → Show all broadcast-whitelisted roles\n' +
          '**Requires:** Administrator',
      },
      {
        name: '📋  Quick Setup Guide',
        value:
          '```\n' +
          '1. /setmodrole add @YourModRole\n' +
          '2. /setbroadcastrole add @YourModRole\n' +
          '3. Done! Mods can now lock, hide, manage roles, and broadcast.\n' +
          '```',
      }
    )
    .setFooter({ text: 'Faasle Bot  •  Admin Setup' })
    .setTimestamp();
}

// ── Button Row ─────────────────────────────────────────────────────────────

function buildNavRow(activePage) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help_overview')
      .setLabel('Overview')
      .setEmoji('📖')
      .setStyle(activePage === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(activePage === 'overview'),
    new ButtonBuilder()
      .setCustomId('help_moderation')
      .setLabel('Moderation')
      .setEmoji('🔨')
      .setStyle(activePage === 'moderation' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(activePage === 'moderation'),
    new ButtonBuilder()
      .setCustomId('help_utility')
      .setLabel('Utility')
      .setEmoji('🛠️')
      .setStyle(activePage === 'utility' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(activePage === 'utility'),
    new ButtonBuilder()
      .setCustomId('help_admin')
      .setLabel('Admin Setup')
      .setEmoji('⚙️')
      .setStyle(activePage === 'admin' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(activePage === 'admin'),
  );
}

function getPageEmbed(page) {
  switch (page) {
    case 'moderation': return buildModerationEmbed();
    case 'utility':    return buildUtilityEmbed();
    case 'admin':      return buildAdminEmbed();
    default:           return buildOverviewEmbed();
  }
}

// ── Command ────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📖 Browse all Faasle Bot commands and learn how to use them.'),

  /**
   * Sends a paginated help menu — anyone can use this, no role required.
   * Navigation buttons switch between Overview, Moderation, Utility, and Admin pages.
   * The collector listens for 5 minutes before disabling the buttons.
   *
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    let currentPage = 'overview';

    const response = await interaction.reply({
      embeds: [getPageEmbed(currentPage)],
      components: [buildNavRow(currentPage)],
      ephemeral: true,
    });

    // ── Button collector (5 minute window) ────────────────────────────────
    const collector = response.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000, // 5 minutes
    });

    collector.on('collect', async (btnInteraction) => {
      currentPage = btnInteraction.customId.replace('help_', '');
      await btnInteraction.update({
        embeds: [getPageEmbed(currentPage)],
        components: [buildNavRow(currentPage)],
      });
    });

    collector.on('end', async () => {
      // Disable all buttons when the session expires
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_overview').setLabel('Overview').setEmoji('📖').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('help_moderation').setLabel('Moderation').setEmoji('🔨').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('help_utility').setLabel('Utility').setEmoji('🛠️').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('help_admin').setLabel('Admin Setup').setEmoji('⚙️').setStyle(ButtonStyle.Secondary).setDisabled(true),
      );

      await interaction.editReply({ components: [disabledRow] }).catch(() => {});
    });
  },
};
