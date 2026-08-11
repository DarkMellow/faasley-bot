const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { isBroadcastAuthorized } = require('../../utils/auth');

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

// ── Command ────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('📣 Send a DM broadcast to server members.')
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

  /**
   * Broadcasts a message via DM to all server members or members of a specific role.
   *
   * Guard pipeline:
   *  1. isBroadcastAuthorized — must hold BOTH a mod role AND a broadcast role
   *  2. If targeting everyone → show confirmation buttons (30s timeout)
   *  3. If targeting a role  → proceed immediately
   *  4. Fetch members, send DMs with rate-limit delay, report results
   *
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const { guild, member: executor } = interaction;

    const broadcastMessage = interaction.options.getString('message');
    const targetRole       = interaction.options.getRole('role'); // null = everyone

    // ── 1. Authorization ─────────────────────────────────────────────────
    if (!(await isBroadcastAuthorized(executor, guild))) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('🚫 Access Denied')
            .setDescription(
              'You need **both** a whitelisted mod role **and** a whitelisted broadcast role to use this command.\n\n' +
              'Ask an Administrator to configure these with `/setmodrole` and `/setbroadcastrole`.'
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── 2. Everyone path — show confirmation buttons ──────────────────────
    if (!targetRole) {
      // Fetch approximate member count (may not be exact for large servers)
      const memberCount = guild.memberCount;

      const confirmEmbed = new EmbedBuilder()
        .setColor(0xffa502)
        .setTitle('⚠️ Broadcast to Everyone — Are you sure?')
        .setDescription(
          `You're about to DM **every member** of **${guild.name}**.\n\n` +
          `**Estimated recipients:** ~${memberCount.toLocaleString()} member(s)\n` +
          `**Message preview:**\n>>> ${broadcastMessage}`
        )
        .setFooter({ text: 'This confirmation expires in 30 seconds.' })
        .setTimestamp();

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

      await interaction.reply({
        embeds: [confirmEmbed],
        components: [row],
        ephemeral: true,
      });

      // ── Wait for button click ──────────────────────────────────────────
      let buttonInteraction;
      try {
        buttonInteraction = await interaction.channel.awaitMessageComponent({
          filter: (i) => i.user.id === executor.id &&
                         (i.customId === 'broadcast_confirm' || i.customId === 'broadcast_cancel'),
          time: 30_000,
        });
      } catch {
        // Timed out — disable buttons and inform user
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x747d8c)
              .setTitle('⏱️ Confirmation Timed Out')
              .setDescription('Broadcast cancelled — no response within 30 seconds.')
              .setTimestamp(),
          ],
          components: [],
        });
      }

      if (buttonInteraction.customId === 'broadcast_cancel') {
        await buttonInteraction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x747d8c)
              .setTitle('✖️ Broadcast Cancelled')
              .setDescription('No messages were sent.')
              .setTimestamp(),
          ],
          components: [],
        });
        return;
      }

      // Confirmed — begin broadcast
      await buttonInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5352ed)
            .setTitle('📣 Broadcasting...')
            .setDescription(`Sending DMs to all members of **${guild.name}**. This may take a while...`)
            .setTimestamp(),
        ],
        components: [],
      });

      await executeBroadcast(interaction, guild, executor, broadcastMessage, null);
      return;
    }

    // ── 3. Targeted role path — proceed immediately ───────────────────────
    await interaction.deferReply({ ephemeral: true });
    await executeBroadcast(interaction, guild, executor, broadcastMessage, targetRole);
  },
};

// ── Core Broadcast Logic ───────────────────────────────────────────────────

/**
 * Fetches the target members, sends DMs with rate-limit-safe delays,
 * and reports the final success/fail counts to the executor.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} executor
 * @param {string} broadcastMessage
 * @param {import('discord.js').Role|null} targetRole  null = everyone
 */
async function executeBroadcast(interaction, guild, executor, broadcastMessage, targetRole) {
  // ── Build the DM embed ─────────────────────────────────────────────────
  const dmEmbed = new EmbedBuilder()
    .setColor(0x5352ed)
    .setTitle(`📣 - Broadcast from ${guild.name}`)
    .setDescription(broadcastMessage)
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .setTimestamp();

  // ── Fetch members ──────────────────────────────────────────────────────
  try {
    await guild.members.fetch(); // populate the cache
  } catch (err) {
    console.error('[broadcast] ❌  Failed to fetch members:', err);
    return replyOrFollowUp(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌ Failed to Fetch Members')
          .setDescription('Could not retrieve the member list. Check the bot\'s GuildMembers intent.')
          .setTimestamp(),
      ],
    });
  }

  // Filter target members — exclude bots and the executor themselves
  let targets;
  if (targetRole) {
    targets = guild.members.cache.filter(
      (m) => !m.user.bot && m.id !== executor.id && m.roles.cache.has(targetRole.id)
    );
  } else {
    targets = guild.members.cache.filter(
      (m) => !m.user.bot && m.id !== executor.id
    );
  }

  if (targets.size === 0) {
    return replyOrFollowUp(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa502)
          .setTitle('⚠️ No Recipients')
          .setDescription(
            targetRole
              ? `No members with the <@&${targetRole.id}> role were found.`
              : 'No eligible members found in this server.'
          )
          .setTimestamp(),
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
    const sent = await dmMember(target, dmEmbed);
    if (sent) {
      successCount++;
    } else {
      failCount++;
    }
    await sleep(250);
  }

  console.log(`[broadcast] ✅  Done — ${successCount} sent, ${failCount} failed.`);

  // ── Final report ───────────────────────────────────────────────────────
  const reportEmbed = new EmbedBuilder()
    .setColor(successCount > 0 ? 0x2ed573 : 0xff4757)
    .setTitle('📣 Broadcast Complete')
    .addFields(
      {
        name: 'Target',
        value: targetRole ? `<@&${targetRole.id}>` : '@everyone',
        inline: true,
      },
      {
        name: '✅ Delivered',
        value: `${successCount} member(s)`,
        inline: true,
      },
      {
        name: '❌ Failed (DMs closed)',
        value: `${failCount} member(s)`,
        inline: true,
      }
    )
    .setFooter({ text: 'Members with DMs disabled could not be reached.' })
    .setTimestamp();

  return replyOrFollowUp(interaction, { embeds: [reportEmbed] });
}

/**
 * Handles the reply differently depending on whether the interaction was
 * already acknowledged via a button update or a deferReply.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} payload
 */
async function replyOrFollowUp(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.followUp({ ...payload, ephemeral: true });
    }
  } catch (err) {
    console.error('[broadcast] ❌  Failed to send final report:', err);
  }
}
