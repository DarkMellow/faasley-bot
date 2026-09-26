const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { getXpChannels, setXpChannelRule } = require('../../utils/levels');
const { successEmbed, infoEmbed } = require('../../utils/embeds');

// Channels (and categories) that can carry an XP rule.
const XP_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildCategory,
];

const channelOption = (description) => (opt) =>
  opt
    .setName('channel')
    .setDescription(description)
    .setRequired(true)
    .addChannelTypes(...XP_CHANNEL_TYPES);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('xpchannel')
    .setDescription('🎚️ Choose which text and voice channels members can earn XP in.')
    .addSubcommand((sub) =>
      sub
        .setName('allow')
        .setDescription('Allow XP here — once any channel is allowed, only allowed channels earn XP.')
        .addChannelOption(channelOption('Channel or category to allow'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('deny')
        .setDescription('Stop members from earning XP in a channel or category.')
        .addChannelOption(channelOption('Channel or category to deny'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove the allow/deny rule from a channel or category.')
        .addChannelOption(channelOption('Channel or category to reset'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Show where members can earn XP.')
    ),
  level: 'mod',

  /**
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { guild } = ctx;
    const sub = ctx.options.getSubcommand();

    if (sub === 'list') {
      const { allowed, denied } = await getXpChannels(guild.id);
      const format = (ids) => (ids.length ? ids.map((id) => `<#${id}>`).join('  ') : '*None*');

      const summary = allowed.length
        ? 'XP is earned **only** in the allowed channels below (and channels inside allowed categories).'
        : 'XP is earned in **every channel** except the denied ones below.';

      return ctx.reply({
        embeds: [
          infoEmbed('🎚️ XP Channels', summary).addFields(
            { name: '✅ Allowed', value: format(allowed) },
            { name: '🚫 Denied',  value: format(denied) }
          ),
        ],
        ephemeral: true,
      });
    }

    const channel = ctx.options.getChannel('channel');
    const rule = sub === 'remove' ? null : sub; // 'allow' | 'deny' | null
    await setXpChannelRule(guild.id, channel.id, rule);

    const { allowed } = await getXpChannels(guild.id);
    const messages = {
      allow: `Members can now earn XP in <#${channel.id}>.` +
        (allowed.length === 1 ? '\n⚠️ This is the only allowed channel, so XP is now earned **only** here.' : ''),
      deny: `Members will no longer earn XP in <#${channel.id}>.`,
      remove: `Removed the XP rule from <#${channel.id}>.` +
        (allowed.length === 0 ? ' XP is now earned in every channel except denied ones.' : ''),
    };

    return ctx.reply({
      embeds: [successEmbed('✅ XP Channels Updated', messages[sub])],
      ephemeral: true,
    });
  },
};
