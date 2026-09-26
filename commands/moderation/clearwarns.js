const { SlashCommandBuilder } = require('discord.js');
const { getWarnings, removeWarnings } = require('../../utils/warnings');
const { successEmbed, warnEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('🧹 Clear all of a member\'s warnings, or just one.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member whose warnings to clear').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('number')
        .setDescription('Only remove this warning (# from /warnings)')
        .setMinValue(1)
    ),
  level: 'admin',

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { guild } = ctx;
    const user = ctx.options.getUser('user');
    const number = ctx.options.getInteger('number');

    const warnings = await getWarnings(guild.id, user.id);
    if (warnings.length === 0) {
      return ctx.reply({ embeds: [warnEmbed('⚠️ No Warnings', `<@${user.id}> has no warnings.`)], ephemeral: true });
    }

    if (number !== null && number > warnings.length) {
      return ctx.reply({
        embeds: [errorEmbed('❌ Not Found', `<@${user.id}> only has ${warnings.length} warning(s).`)],
        ephemeral: true,
      });
    }

    const removed = await removeWarnings(guild.id, user.id, number ?? undefined);

    return ctx.reply({
      embeds: [
        successEmbed(
          '🧹 Warnings Cleared',
          number !== null
            ? `Removed warning **#${number}** from <@${user.id}>. They now have ${warnings.length - 1}.`
            : `Removed all **${removed}** warning(s) from <@${user.id}>.`
        ),
      ],
    });
  },
};
