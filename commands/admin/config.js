const { SlashCommandBuilder } = require('discord.js');
const { LEVEL_INFO } = require('../../utils/permissions');
const {
  getPrefix,
  setPrefix,
  getWarnLimit,
  setWarnLimit,
  getNextBroadcastTime,
  DEFAULT_PREFIX,
  DEFAULT_WARN_LIMIT,
  MAX_WARN_LIMIT,
} = require('../../utils/guildConfig');
const { infoEmbed, successEmbed, errorEmbed } = require('../../utils/embeds');

const MAX_PREFIX_LENGTH = 5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('⚙️ View or change the bot settings for this server (prefix, warning limit).')
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('Show the current bot settings for this server.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('prefix')
        .setDescription(`Change the prefix for text commands (default "${DEFAULT_PREFIX}").`)
        .addStringOption((opt) =>
          opt
            .setName('prefix')
            .setDescription(`New prefix, 1–${MAX_PREFIX_LENGTH} characters, no spaces`)
            .setRequired(true)
            .setMaxLength(MAX_PREFIX_LENGTH)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('warnlimit')
        .setDescription(`Warnings before a member is kicked automatically (default ${DEFAULT_WARN_LIMIT}).`)
        .addIntegerOption((opt) =>
          opt
            .setName('limit')
            .setDescription(`0 turns auto-kick off, up to ${MAX_WARN_LIMIT}`)
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(MAX_WARN_LIMIT)
        )
    ),
  level: 'admin',

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { guild } = ctx;
    const sub = ctx.options.getSubcommand();

    // ── view ─────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const prefix = await getPrefix(guild.id);
      const nextBroadcast = await getNextBroadcastTime(guild.id);
      const warnLimit = await getWarnLimit(guild.id);

      return ctx.reply({
        embeds: [
          infoEmbed('⚙️ Server Settings')
            .addFields(
              { name: 'Prefix', value: `\`${prefix}\`  (e.g. \`${prefix}help\`)`, inline: true },
              {
                name: 'Next broadcast',
                value: nextBroadcast ? `<t:${Math.floor(nextBroadcast / 1000)}:R>` : 'Available now',
                inline: true,
              },
              {
                name: 'Auto-kick',
                value: warnLimit > 0 ? `At ${warnLimit} warnings` : 'Off',
                inline: true,
              },
              {
                name: 'Permission levels',
                value: Object.values(LEVEL_INFO)
                  .map((l) => `\`${l.label}\` — ${l.requirement}`)
                  .join('\n'),
              }
            )
            .setFooter({ text: guild.name }),
        ],
        ephemeral: true,
      });
    }

    // ── prefix ───────────────────────────────────────────────────────────
    if (sub === 'prefix') {
      const prefix = ctx.options.getString('prefix').trim();

      if (!prefix || /\s/.test(prefix) || prefix.length > MAX_PREFIX_LENGTH) {
        return ctx.reply({
          embeds: [errorEmbed('❌ Invalid Prefix', `The prefix must be 1–${MAX_PREFIX_LENGTH} characters with no spaces.`)],
          ephemeral: true,
        });
      }

      await setPrefix(guild.id, prefix);

      return ctx.reply({
        embeds: [
          successEmbed(
            '✅ Prefix Updated',
            `Text commands now use \`${prefix}\` — e.g. \`${prefix}help\`.\n` +
            'Mentioning the bot also works as a prefix.'
          ),
        ],
        ephemeral: true,
      });
    }

    // ── warnlimit ────────────────────────────────────────────────────────
    if (sub === 'warnlimit') {
      const limit = ctx.options.getInteger('limit');
      await setWarnLimit(guild.id, limit);

      return ctx.reply({
        embeds: [
          successEmbed(
            '✅ Warning Limit Updated',
            limit > 0
              ? `Members are now kicked automatically when they reach **${limit}** warning(s).`
              : 'Auto-kick is now **off**. Warnings are still recorded.'
          ),
        ],
        ephemeral: true,
      });
    }
  },
};
