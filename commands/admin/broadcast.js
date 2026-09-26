const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const {
  BROADCAST_COOLDOWN_MS,
  getNextBroadcastTime,
  startBroadcastCooldown,
  clearBroadcastCooldown,
} = require('../../utils/guildConfig');
const { COLORS, errorEmbed, warnEmbed, infoEmbed, mutedEmbed } = require('../../utils/embeds');

const COOLDOWN_HOURS = BROADCAST_COOLDOWN_MS / (60 * 60 * 1000);

// Guilds with a broadcast currently sending — prevents two running at once.
const activeBroadcasts = new Set();

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sends a DM to a single member with the broadcast embed.
 * Returns true on success, false if the DM was blocked/failed.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {import('discord.js').EmbedBuilder} embed
 * @returns {Promise<boolean>}
 */
async function dmMember(member, embed) {
  try {
    await member.send({ embeds: [embed] });
    return true;
  } catch {
    return false; // DMs closed or blocked
  }
}

/**
 * Adds a small delay between DMs to avoid hitting Discord's rate limits.
 *
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cooldownEmbed(nextTime) {
  return warnEmbed(
    '⏳ Broadcast on Cooldown',
    `This server can send **1 broadcast every ${COOLDOWN_HOURS} hours**.\n` +
    `The next broadcast is available <t:${Math.floor(nextTime / 1000)}:R>.`
  );
}

// ── Command ────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('📣 DM a message to everyone or to one role (once every 6 hours).')
    .addStringOption((opt) =>
      opt
        .setName('message')
        .setDescription('The message to broadcast')
        .setRequired(true)
        .setMaxLength(1800)
    )
    .addRoleOption((opt) =>
      opt
        .setName('role')
        .setDescription('Only DM members with this role (leave empty to broadcast to everyone)')
        .setRequired(false)
    ),
  level: 'admin',

  /**
   * Broadcasts a message via DM to all server members or members of a specific role.
   *
   * Pipeline:
   *  1. Cooldown check (1 per BROADCAST_COOLDOWN_MS per guild)
   *  2. If targeting everyone → confirmation buttons (30s timeout)
   *  3. Re-check cooldown, start it, fetch members, send DMs, report results
   *
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { guild, member: executor } = ctx;

    const broadcastMessage = ctx.options.getString('message');
    let targetRole = ctx.options.getRole('role'); // null = everyone
    if (targetRole?.id === guild.id) targetRole = null; // @everyone picked explicitly

    // ── 1. Cooldown ──────────────────────────────────────────────────────
    const nextTime = await getNextBroadcastTime(guild.id);
    if (nextTime) {
      return ctx.reply({ embeds: [cooldownEmbed(nextTime)], ephemeral: true });
    }

    const sendingEmbed = infoEmbed(
      '📣 Broadcasting...',
      `Sending DMs to ${targetRole ? `members with <@&${targetRole.id}>` : `all members of **${guild.name}**`}. This may take a while...`
    );

    let editStatus;

    if (!targetRole) {
      // ── 2. Everyone path — confirmation buttons ──────────────────────
      const confirmEmbed = warnEmbed(
        '⚠️ Broadcast to Everyone — Are you sure?',
        `You're about to DM **every member** of **${guild.name}**.\n\n` +
        `**Estimated recipients:** ~${guild.memberCount.toLocaleString()} member(s)\n` +
        `**Message preview:**\n>>> ${broadcastMessage}`
      ).setFooter({ text: `This confirmation expires in 30 seconds. Broadcasts are limited to 1 every ${COOLDOWN_HOURS} hours.` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('broadcast_confirm')
          .setLabel('Yes, Broadcast to Everyone')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('📣'),
        new ButtonBuilder()
          .setCustomId('broadcast_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✖️')
      );

      const response = await ctx.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });

      let button;
      try {
        button = await response.awaitMessageComponent({
          filter: (i) =>
            i.user.id === executor.id &&
            (i.customId === 'broadcast_confirm' || i.customId === 'broadcast_cancel'),
          time: 30_000,
        });
      } catch {
        await response
          .edit({
            embeds: [mutedEmbed('⏱️ Confirmation Timed Out', 'Broadcast cancelled — no response within 30 seconds.')],
            components: [],
          })
          .catch(() => {});
        return;
      }

      if (button.customId === 'broadcast_cancel') {
        return button.update({
          embeds: [mutedEmbed('✖️ Broadcast Cancelled', 'No messages were sent.')],
          components: [],
        });
      }

      await button.update({ embeds: [sendingEmbed], components: [] });
      // Slash replies must be edited through an interaction token; prefix
      // replies are the bot's own message and can be edited directly.
      editStatus = ctx.isSlash ? (payload) => button.editReply(payload) : (payload) => response.edit(payload);
    } else {
      // ── Targeted role path — proceed immediately ─────────────────────
      const status = await ctx.reply({ embeds: [sendingEmbed], ephemeral: true });
      editStatus = ctx.isSlash ? (payload) => ctx.interaction.editReply(payload) : (payload) => status.edit(payload);
    }

    // ── 3. Claim the broadcast slot ──────────────────────────────────────
    // has + add run synchronously, so two confirmations can't both pass.
    if (activeBroadcasts.has(guild.id)) {
      return editStatus({ embeds: [warnEmbed('⚠️ Broadcast In Progress', 'Another broadcast is already being sent in this server.')] });
    }
    activeBroadcasts.add(guild.id);

    try {
      // Another admin may have broadcast while this one was being confirmed.
      const nextTimeNow = await getNextBroadcastTime(guild.id);
      if (nextTimeNow) {
        return await editStatus({ embeds: [cooldownEmbed(nextTimeNow)] });
      }

      await executeBroadcast({ guild, executor, broadcastMessage, targetRole, editStatus });
    } finally {
      activeBroadcasts.delete(guild.id);
    }
  },
};

// ── Core Broadcast Logic ───────────────────────────────────────────────────

/**
 * Fetches the target members, sends DMs with rate-limit-safe delays,
 * and reports the final success/fail counts to the executor.
 *
 * The cooldown starts before sending. It is cleared again if nothing could be
 * sent (member fetch failed or no recipients), so a failed attempt doesn't use
 * up the server's broadcast slot.
 */
async function executeBroadcast({ guild, executor, broadcastMessage, targetRole, editStatus }) {
  await startBroadcastCooldown(guild.id);

  // ── Build the DM embed ─────────────────────────────────────────────────
  const dmEmbed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`📣 - Broadcast from ${guild.name}`)
    .setDescription(broadcastMessage)
    .setThumbnail(guild.iconURL())
    .setTimestamp();

  // ── Fetch members ──────────────────────────────────────────────────────
  try {
    await guild.members.fetch(); // populate the cache
  } catch (err) {
    console.error('[broadcast] ❌  Failed to fetch members:', err);
    await clearBroadcastCooldown(guild.id);
    return report(editStatus, executor, {
      embeds: [errorEmbed('❌ Failed to Fetch Members', 'Could not retrieve the member list. Check the bot\'s GuildMembers intent.')],
    });
  }

  // Filter target members — exclude bots and the executor themselves
  const targets = guild.members.cache.filter(
    (m) => !m.user.bot && m.id !== executor.id && (!targetRole || m.roles.cache.has(targetRole.id))
  );

  if (targets.size === 0) {
    await clearBroadcastCooldown(guild.id);
    return report(editStatus, executor, {
      embeds: [
        warnEmbed(
          '⚠️ No Recipients',
          targetRole
            ? `No members with the <@&${targetRole.id}> role were found.`
            : 'No eligible members found in this server.'
        ),
      ],
    });
  }

  // ── Send DMs with rate-limit delay ─────────────────────────────────────
  // Discord's DM rate limit is roughly 5 DMs/second to different users.
  // Using 250ms delay keeps us safely under that limit.
  let successCount = 0;
  let failCount    = 0;

  console.log(`[broadcast] 📣  Sending to ${targets.size} member(s) in ${guild.name}...`);

  for (const [, target] of targets) {
    if (await dmMember(target, dmEmbed)) {
      successCount++;
    } else {
      failCount++;
    }
    await sleep(250);
  }

  console.log(`[broadcast] ✅  Done — ${successCount} sent, ${failCount} failed.`);

  // ── Final report ───────────────────────────────────────────────────────
  const nextTime = Math.floor((Date.now() + BROADCAST_COOLDOWN_MS) / 1000);
  const reportEmbed = new EmbedBuilder()
    .setColor(successCount > 0 ? COLORS.success : COLORS.error)
    .setTitle('📣 Broadcast Complete')
    .addFields(
      { name: 'Target',               value: targetRole ? `<@&${targetRole.id}>` : '@everyone', inline: true },
      { name: '✅ Delivered',          value: `${successCount} member(s)`,                       inline: true },
      { name: '❌ Failed (DMs closed)', value: `${failCount} member(s)`,                          inline: true },
      { name: 'Next broadcast',        value: `<t:${nextTime}:R>`,                               inline: true }
    )
    .setFooter({ text: 'Members with DMs disabled could not be reached.' })
    .setTimestamp();

  return report(editStatus, executor, { embeds: [reportEmbed] });
}

/**
 * Updates the status message. Slash interaction tokens expire after 15
 * minutes, so long broadcasts fall back to DMing the report to the executor.
 */
async function report(editStatus, executor, payload) {
  try {
    await editStatus(payload);
  } catch {
    await executor.send(payload).catch((err) => {
      console.error('[broadcast] ❌  Failed to send final report:', err);
    });
  }
}
