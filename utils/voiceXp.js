const { addXp, levelUp, getXpChannels, channelEarnsXp, VOICE_XP_PER_MINUTE } = require('./levels');

// ── Voice XP ───────────────────────────────────────────────────────────────
// Once a minute, every non-bot member in a voice channel earns voice XP —
// but only if at least MIN_MEMBERS non-bot members are in that channel, so
// sitting alone in a voice channel to farm XP earns nothing.
//
// Channels that never earn: the server's AFK channel, and channels denied
// (or not allowed) by /xpchannel.
//
// Working from the live voice state cache each tick (rather than tracking
// joins and leaves) means restarts, moves and disconnects need no handling.

const TICK_MS = 60 * 1000;
const MIN_MEMBERS = 2;

let running = false;

/**
 * Awards one minute of voice XP across every guild.
 *
 * @param {import('discord.js').Client} client
 */
async function tick(client) {
  for (const guild of client.guilds.cache.values()) {
    // Group non-bot members by the voice channel they're in.
    const byChannel = new Map();
    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channelId || !state.member || state.member.user.bot) continue;
      if (state.channelId === guild.afkChannelId) continue;
      if (!byChannel.has(state.channelId)) byChannel.set(state.channelId, []);
      byChannel.get(state.channelId).push(state.member);
    }

    const eligible = [...byChannel].filter(([, members]) => members.length >= MIN_MEMBERS);
    if (eligible.length === 0) continue;

    const rules = await getXpChannels(guild.id);

    for (const [channelId, members] of eligible) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel || !(await channelEarnsXp(channel, rules))) continue;

      for (const member of members) {
        try {
          const { before, after } = await addXp(guild.id, member.id, {
            voiceXp: VOICE_XP_PER_MINUTE,
            voiceMinutes: 1,
          });
          const newLevel = levelUp(before, after, 'voiceXp');
          if (newLevel !== null) {
            // Voice channels have their own text chat — announce there.
            await channel
              .send({
                content: `🎙️ <@${member.id}> reached **voice level ${newLevel}**!`,
                allowedMentions: { users: [member.id] },
              })
              .catch(() => {});
          }
        } catch (error) {
          console.error(`[voiceXp] ❌  Failed to award voice XP to ${member.id}:`, error);
        }
      }
    }
  }
}

/**
 * Starts the once-a-minute voice XP ticker. A tick is skipped if the previous
 * one is still running, so ticks never overlap.
 *
 * @param {import('discord.js').Client} client
 */
function startVoiceXp(client) {
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick(client);
    } catch (error) {
      console.error('[voiceXp] ❌  Tick failed:', error);
    } finally {
      running = false;
    }
  }, TICK_MS);
  console.log('[voiceXp] 🎙️  Voice XP ticker started.');
}

module.exports = { startVoiceXp, tick, MIN_MEMBERS };
