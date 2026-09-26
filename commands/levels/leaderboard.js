const { SlashCommandBuilder } = require('discord.js');
const { getLeaderboard, levelFromXp } = require('../../utils/levels');
const { formatShortDuration } = require('../../utils/duration');
const { infoEmbed, mutedEmbed } = require('../../utils/embeds');

const PAGE_SIZE = 10;
const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('🏆 Show the top members by chat or voice XP.')
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Chat or voice leaderboard (default chat)')
        .addChoices(
          { name: 'Chat',  value: 'chat' },
          { name: 'Voice', value: 'voice' }
        )
    )
    .addIntegerOption((opt) =>
      opt.setName('page').setDescription('Page number').setMinValue(1)
    ),
  level: 'everyone',

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const type = ctx.options.getString('type') ?? 'chat';
    const isVoice = type === 'voice';
    const title = `${isVoice ? '🎙️ Voice' : '💬 Chat'} Leaderboard — ${ctx.guild.name}`;
    const leaderboard = await getLeaderboard(ctx.guild.id, type);

    if (leaderboard.length === 0) {
      return ctx.reply({
        embeds: [
          mutedEmbed(
            title,
            isVoice
              ? 'Nobody has earned voice XP yet. Hang out in voice with at least one other person!'
              : 'Nobody has earned XP yet. Start chatting!'
          ),
        ],
      });
    }

    const pages = Math.ceil(leaderboard.length / PAGE_SIZE);
    const page = Math.min(ctx.options.getInteger('page') ?? 1, pages);
    const start = (page - 1) * PAGE_SIZE;

    const lines = leaderboard.slice(start, start + PAGE_SIZE).map((row, i) => {
      const position = start + i;
      const badge = MEDALS[position] ?? `\`#${position + 1}\``;
      const { level } = levelFromXp(row.xp);
      const time = isVoice ? ` · ${formatShortDuration(row.voiceMinutes * 60 * 1000)}` : '';
      return `${badge} <@${row.userId}> — Level **${level}** · ${row.xp.toLocaleString()} XP${time}`;
    });

    const ownPosition = leaderboard.findIndex((row) => row.userId === ctx.user.id);

    return ctx.reply({
      embeds: [
        infoEmbed(title, lines.join('\n'))
          .setFooter({
            text:
              `Page ${page} / ${pages}` +
              (ownPosition === -1 ? '' : `  •  You are #${ownPosition + 1}`),
          }),
      ],
    });
  },
};
