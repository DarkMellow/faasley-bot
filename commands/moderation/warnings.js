const { SlashCommandBuilder } = require('discord.js');
const { getWarnings } = require('../../utils/warnings');
const { getWarnLimit } = require('../../utils/guildConfig');
const { infoEmbed, mutedEmbed } = require('../../utils/embeds');

const MAX_SHOWN = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('📋 List a member\'s warnings.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to look up').setRequired(true)
    ),
  level: 'mod',

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { guild } = ctx;
    const user = ctx.options.getUser('user');
    const warnings = await getWarnings(guild.id, user.id);
    const limit = await getWarnLimit(guild.id);

    if (warnings.length === 0) {
      return ctx.reply({
        embeds: [mutedEmbed('📋 No Warnings', `<@${user.id}> has no warnings.`)],
        ephemeral: true,
      });
    }

    // Newest first, numbered by their position so /clearwarns can target one.
    const lines = warnings
      .map((w, i) => `**#${i + 1}** · ${w.reason}\n-# by <@${w.moderatorId}> · <t:${Math.floor(w.timestamp / 1000)}:R>`)
      .reverse()
      .slice(0, MAX_SHOWN);

    const hidden = warnings.length - lines.length;
    if (hidden > 0) lines.push(`*…and ${hidden} older warning(s)*`);

    return ctx.reply({
      embeds: [
        infoEmbed(`📋 Warnings for ${user.username}`, lines.join('\n\n'))
          .setFooter({
            text: `${warnings.length} warning(s)  •  ${limit > 0 ? `Auto-kick at ${limit}` : 'Auto-kick is off'}`,
          }),
      ],
      ephemeral: true,
    });
  },
};
