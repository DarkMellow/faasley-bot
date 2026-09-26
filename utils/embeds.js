const { EmbedBuilder } = require('discord.js');

// ── Shared Colour Palette ──────────────────────────────────────────────────
const COLORS = {
  error:   0xff4757,
  warn:    0xffa502,
  success: 0x2ed573,
  info:    0x5352ed,
  muted:   0x747d8c,
};

/**
 * Builds a timestamped embed with an optional title and description.
 *
 * @param {number} color
 * @param {string} [title]
 * @param {string} [description]
 * @returns {EmbedBuilder}
 */
function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

const errorEmbed   = (title, description) => makeEmbed(COLORS.error, title, description);
const warnEmbed    = (title, description) => makeEmbed(COLORS.warn, title, description);
const successEmbed = (title, description) => makeEmbed(COLORS.success, title, description);
const infoEmbed    = (title, description) => makeEmbed(COLORS.info, title, description);
const mutedEmbed   = (title, description) => makeEmbed(COLORS.muted, title, description);

module.exports = {
  COLORS,
  makeEmbed,
  errorEmbed,
  warnEmbed,
  successEmbed,
  infoEmbed,
  mutedEmbed,
};
