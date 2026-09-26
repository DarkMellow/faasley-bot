const { MessageFlags } = require('discord.js');

/**
 * A single execution context shared by slash and prefix commands, so every
 * command is written once against this API instead of against an Interaction
 * or a Message directly.
 *
 *  - ctx.options exposes getSubcommand / getString / getUser / getMember /
 *    getRole / getChannel for both sources (see utils/prefixParser.js).
 *  - ctx.reply() acknowledges correctly whether the command was deferred or
 *    already replied to. `ephemeral: true` is honoured for slash commands and
 *    ignored for prefix commands (messages can't be ephemeral).
 *
 * The object returned by ctx.reply() always supports `.edit()`,
 * `.awaitMessageComponent()` and `.createMessageComponentCollector()`.
 */
class CommandContext {
  constructor({ client, guild, channel, member, user, options, prefix, interaction = null, message = null }) {
    this.client = client;
    this.guild = guild;
    this.channel = channel;
    this.member = member;
    this.user = user;
    this.options = options;
    this.prefix = prefix;
    this.interaction = interaction;
    this.message = message;
  }

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} prefix
   */
  static fromInteraction(interaction, prefix) {
    return new CommandContext({
      client: interaction.client,
      guild: interaction.guild,
      channel: interaction.channel,
      member: interaction.member,
      user: interaction.user,
      options: interaction.options,
      prefix,
      interaction,
    });
  }

  /**
   * @param {import('discord.js').Message} message
   * @param {import('./prefixParser').PrefixOptions} options
   * @param {string} prefix
   */
  static fromMessage(message, options, prefix) {
    return new CommandContext({
      client: message.client,
      guild: message.guild,
      channel: message.channel,
      member: message.member,
      user: message.author,
      options,
      prefix,
      message,
    });
  }

  get isSlash() {
    return this.interaction !== null;
  }

  /**
   * @param {object} payload  Message payload, plus optional `ephemeral: boolean`
   */
  async reply({ ephemeral = false, ...payload }) {
    if (this.interaction) {
      const i = this.interaction;
      const flags = ephemeral ? MessageFlags.Ephemeral : undefined;
      if (i.deferred && !i.replied) return i.editReply(payload);
      if (i.replied) return i.followUp({ ...payload, flags });
      return i.reply({ ...payload, flags });
    }

    return this.message.reply({
      ...payload,
      allowedMentions: payload.allowedMentions ?? { repliedUser: false },
      failIfNotExists: false,
    });
  }

  /**
   * Buys time for slow operations. Slash: deferReply. Prefix: typing indicator.
   *
   * @param {{ ephemeral?: boolean }} [opts]
   */
  async defer({ ephemeral = false } = {}) {
    if (this.interaction) {
      if (!this.interaction.deferred && !this.interaction.replied) {
        await this.interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
      }
      return;
    }
    await this.channel.sendTyping().catch(() => {});
  }
}

module.exports = { CommandContext };
