const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { setAfk, getAfk } = require('../../utils/afk');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('💤 Set yourself as AFK — the bot will notify people who mention you.')
    .addStringOption((opt) =>
      opt
        .setName('reason')
        .setDescription('Why are you going AFK? (optional)')
        .setRequired(false)
        .setMaxLength(200)
    ),

  /**
   * Marks the executor as AFK in quick.db.
   * Optionally prepends [AFK] to their server nickname if the bot can manage it.
   *
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const { guild, member } = interaction;
    const reason = interaction.options.getString('reason') || 'AFK';

    // ── Already AFK check ────────────────────────────────────────────────
    const existing = await getAfk(guild.id, member.id);
    if (existing) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa502)
            .setTitle('⚠️ Already AFK')
            .setDescription(
              `You're already marked as AFK with reason: **${existing.reason}**\n` +
              `Use this command again after returning to clear it.`
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── Nickname Sync (optional) ─────────────────────────────────────────
    // Prepend [AFK] to the member's display name only if:
    //   a) Bot has ManageNicknames permission in the guild
    //   b) The member's highest role is below the bot's highest role (can't change nick of higher/equal roles)
    //   c) The member is not the server owner (owners can't have nick changed by bots)
    let originalNickname = null;
    const botMember = guild.members.me;
    const canManageNick =
      botMember.permissions.has(PermissionFlagsBits.ManageNicknames) &&
      member.id !== guild.ownerId &&
      member.roles.highest.position < botMember.roles.highest.position;

    if (canManageNick) {
      originalNickname = member.nickname; // null if using username
      const displayName = member.displayName;

      // Only prepend if not already prefixed
      if (!displayName.startsWith('[AFK]')) {
        try {
          await member.setNickname(`[AFK] ${displayName}`.slice(0, 32)); // Discord nick limit: 32 chars
        } catch {
          // Silently ignore — nickname change is optional
        }
      }
    }

    // ── Save AFK state ───────────────────────────────────────────────────
    await setAfk(guild.id, member.id, reason, originalNickname);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x747d8c)
          .setTitle('💤 You\'re now AFK')
          .setDescription(
            `**Reason:** ${reason}\n\n` +
            `I'll let people know you're away if they mention you.\n` +
            `Send any message when you're back and I'll remove your AFK status automatically.`
          )
          .setFooter({ text: `AFK set in ${guild.name}` })
          .setTimestamp(),
      ],
    });
  },
};
