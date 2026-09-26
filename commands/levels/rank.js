const { SlashCommandBuilder } = require('discord.js');
const { getLeaderboard, getXp, levelFromXp } = require('../../utils/levels');
const { formatShortDuration } = require('../../utils/duration');
const { infoEmbed } = require('../../utils/embeds');

const BAR_LENGTH = 12;

/**
 * @param {number} current
 * @param {number} needed
 */
function progressBar(current, needed) {
  const filled = Math.round((current / needed) * BAR_LENGTH);
  return '▰'.repeat(filled) + '▱'.repeat(BAR_LENGTH - filled);
}

/**
 * One field block for a level type: level, rank and progress bar.
 */
function levelFields(label, totalXp, position, extra) {
  const { level, current, needed } = levelFromXp(totalXp);
  return [
    {
      name: label,
      value:
        `Level **${level}**  ·  ${position === -1 ? 'Unranked' : `Rank #${position + 1}`}  ·  ${totalXp.toLocaleString()} XP` +
        (extra ? `  ·  ${extra}` : '') +
        `\n${progressBar(current, needed)}  ${current.toLocaleString()} / ${needed.toLocaleString()} XP to level ${level + 1}`,
    },
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('📊 Show your chat and voice levels, or someone else\'s.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose rank to show (defaults to you)')
    ),
  level: 'everyone',

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const user = ctx.options.getUser('user') ?? ctx.user;
    if (user.bot) {
      return ctx.reply({ embeds: [infoEmbed('📊 Rank', 'Bots don\'t earn XP.')], ephemeral: true });
    }

    const [xp, chatBoard, voiceBoard] = await Promise.all([
      getXp(ctx.guild.id, user.id),
      getLeaderboard(ctx.guild.id, 'chat'),
      getLeaderboard(ctx.guild.id, 'voice'),
    ]);
    const chatPosition = chatBoard.findIndex((row) => row.userId === user.id);
    const voicePosition = voiceBoard.findIndex((row) => row.userId === user.id);
    const voiceTime = formatShortDuration(xp.voiceMinutes * 60 * 1000);

    return ctx.reply({
      embeds: [
        infoEmbed(`📊 ${user.username}'s Rank`)
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            ...levelFields('💬 Chat', xp.chatXp, chatPosition),
            ...levelFields('🎙️ Voice', xp.voiceXp, voicePosition, `${voiceTime} in voice`)
          ),
      ],
    });
  },
};
