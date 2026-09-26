const db = require('./db');

// ── Leveling (chat + voice) ────────────────────────────────────────────────
// Chat and voice are two separate levels that share one curve.
//
//  • Chat:  every message in an XP-earning channel earns a random 5–10 XP.
//           Spam is controlled per channel with /xpchannel, not a cooldown.
//  • Voice: every full minute in a voice channel with at least 2 non-bot
//           members earns 10 XP (see utils/voiceXp.js).
//
// Level curve: going from level L to L + 1 costs 50L + 100 XP
// (100, 150, 200, 250, …), so every level needs a little more XP than the last.
//
// DB keys:
//   xp_<guildId>_<userId>     →  { chatXp, voiceXp, voiceMinutes }
//   xpchannels_<guildId>      →  { allowed: [], denied: [] }

const CHAT_XP_MIN = 5;
const CHAT_XP_MAX = 10;
const VOICE_XP_PER_MINUTE = 10;

const XP_FIELDS = { chat: 'chatXp', voice: 'voiceXp' };

/**
 * XP needed to go from `level` to `level + 1`.
 *
 * @param {number} level
 */
function xpToNextLevel(level) {
  return 50 * level + 100;
}

/**
 * Converts total XP into a level and progress within that level.
 *
 * @param {number} totalXp
 * @returns {{ level: number, current: number, needed: number }}
 */
function levelFromXp(totalXp) {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level++;
  }
  return { level, current: remaining, needed: xpToNextLevel(level) };
}

/**
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<{ chatXp: number, voiceXp: number, voiceMinutes: number }>}
 */
async function getXp(guildId, userId) {
  const record = (await db.get(`xp_${guildId}_${userId}`)) ?? {};
  return {
    chatXp: record.chatXp ?? 0,
    voiceXp: record.voiceXp ?? 0,
    voiceMinutes: record.voiceMinutes ?? 0,
  };
}

// guildId:userId → the member's pending XP update. Members can send 1–2
// messages a second (and voice ticks can land at the same time), so updates
// are chained per member; otherwise two updates could read the same starting
// XP and one would be lost.
const pendingUpdates = new Map();

/**
 * Adds to a member's XP counters, one update at a time per member.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {{ chatXp?: number, voiceXp?: number, voiceMinutes?: number }} increments
 * @returns {Promise<{ before: object, after: object }>}
 */
function addXp(guildId, userId, increments) {
  const key = `${guildId}:${userId}`;
  const update = (pendingUpdates.get(key) ?? Promise.resolve())
    .catch(() => {}) // a failed earlier update shouldn't block later ones
    .then(async () => {
      const before = await getXp(guildId, userId);
      const after = { ...before };
      for (const [field, amount] of Object.entries(increments)) after[field] += amount;
      await db.set(`xp_${guildId}_${userId}`, after);
      return { before, after };
    });

  pendingUpdates.set(key, update);
  update
    .finally(() => {
      if (pendingUpdates.get(key) === update) pendingUpdates.delete(key);
    })
    .catch(() => {});
  return update;
}

/**
 * Returns the new level if `field` crossed a level boundary, otherwise null.
 */
function levelUp(before, after, field) {
  const oldLevel = levelFromXp(before[field]).level;
  const newLevel = levelFromXp(after[field]).level;
  return newLevel > oldLevel ? newLevel : null;
}

/**
 * Members of a guild with XP of the given type, highest first.
 *
 * @param {string} guildId
 * @param {'chat'|'voice'} [type]
 * @returns {Promise<{ userId: string, xp: number, voiceMinutes: number }[]>}
 */
async function getLeaderboard(guildId, type = 'chat') {
  const field = XP_FIELDS[type];
  const prefix = `xp_${guildId}_`;
  const rows = await db.startsWith(prefix);
  return rows
    .map((row) => ({
      userId: row.id.slice(prefix.length),
      xp: row.value?.[field] ?? 0,
      voiceMinutes: row.value?.voiceMinutes ?? 0,
    }))
    .filter((row) => row.xp > 0)
    .sort((a, b) => b.xp - a.xp);
}

// ── XP Channel Rules ───────────────────────────────────────────────────────

/**
 * @param {string} guildId
 * @returns {Promise<{ allowed: string[], denied: string[] }>}
 */
async function getXpChannels(guildId) {
  const rules = await db.get(`xpchannels_${guildId}`);
  return { allowed: rules?.allowed ?? [], denied: rules?.denied ?? [] };
}

/**
 * Sets the rule for one channel or category.
 *
 * @param {string} guildId
 * @param {string} channelId
 * @param {'allow'|'deny'|null} rule  null removes any rule
 */
async function setXpChannelRule(guildId, channelId, rule) {
  const rules = await getXpChannels(guildId);
  rules.allowed = rules.allowed.filter((id) => id !== channelId);
  rules.denied = rules.denied.filter((id) => id !== channelId);
  if (rule === 'allow') rules.allowed.push(channelId);
  if (rule === 'deny') rules.denied.push(channelId);
  await db.set(`xpchannels_${guildId}`, rules);
}

/**
 * Whether activity in this channel earns XP (chat or voice).
 *
 *  - A channel, its parent (for threads) or its category being denied → no XP.
 *  - If any channels are allowed, only those (or channels inside them) earn XP.
 *  - Otherwise every channel earns XP.
 *
 * @param {import('discord.js').GuildChannel|import('discord.js').ThreadChannel} channel
 * @param {{ allowed: string[], denied: string[] }} [rules]  Pass to avoid a DB read
 * @returns {Promise<boolean>}
 */
async function channelEarnsXp(channel, rules) {
  const { allowed, denied } = rules ?? (await getXpChannels(channel.guild.id));

  // The channel itself, the channel a thread belongs to, and its category.
  const base = channel.isThread() ? channel.parent : channel;
  const ids = [channel.id, base?.id, base?.parentId].filter(Boolean);

  if (ids.some((id) => denied.includes(id))) return false;
  if (allowed.length === 0) return true;
  return ids.some((id) => allowed.includes(id));
}

// ── Awarding Chat XP ───────────────────────────────────────────────────────

/**
 * Awards chat XP for a message if the channel earns XP.
 * Returns the new chat level when the member levels up, otherwise null.
 *
 * @param {import('discord.js').Message} message
 * @returns {Promise<number|null>}
 */
async function awardMessageXp(message) {
  const { guild, author, channel } = message;
  if (!(await channelEarnsXp(channel))) return null;

  const gained = CHAT_XP_MIN + Math.floor(Math.random() * (CHAT_XP_MAX - CHAT_XP_MIN + 1));
  const { before, after } = await addXp(guild.id, author.id, { chatXp: gained });
  return levelUp(before, after, 'chatXp');
}

module.exports = {
  CHAT_XP_MIN,
  CHAT_XP_MAX,
  VOICE_XP_PER_MINUTE,
  xpToNextLevel,
  levelFromXp,
  getXp,
  addXp,
  levelUp,
  getLeaderboard,
  getXpChannels,
  setXpChannelRule,
  channelEarnsXp,
  awardMessageXp,
};
