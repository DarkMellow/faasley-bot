const { PermissionFlagsBits, PermissionsBitField, OverwriteType, ChannelType } = require('discord.js');
const db = require('./db');
const { isStaffRole } = require('./permissions');

// ── Channel Restrictions (lock / hide) ─────────────────────────────────────
// Applying a restriction:
//   1. Snapshot the current state of the one permission bit being changed on
//      every overwrite we're about to touch (@everyone, the bot, staff roles).
//   2. Allow the bit for the bot and staff roles, then deny it for @everyone
//      (in that order, so the bot never loses access mid-way).
//
// Releasing restores each overwrite's bit to exactly what it was, and deletes
// any overwrite left completely empty. Only the single bit is
// touched, so a channel that is both locked and hidden restores cleanly.

const RESTRICTIONS = {
  lock: {
    permission: 'SendMessages',
    flag: PermissionFlagsBits.SendMessages,
    channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice],
  },
  hide: {
    permission: 'ViewChannel',
    flag: PermissionFlagsBits.ViewChannel,
    channelTypes: [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildVoice,
      ChannelType.GuildStageVoice,
      ChannelType.GuildForum,
    ],
  },
};

const snapshotKey = (channelId, kind) => `lockdown_${channelId}_${kind}`;

/**
 * @returns {true|false|null} allow / deny / not set
 */
function bitState(overwrite, flag) {
  if (!overwrite) return null;
  if (overwrite.allow.has(flag)) return true;
  if (overwrite.deny.has(flag)) return false;
  return null;
}

/**
 * @param {import('discord.js').GuildChannel} channel
 * @param {'lock'|'hide'} kind
 */
function supportsRestriction(channel, kind) {
  return RESTRICTIONS[kind].channelTypes.includes(channel.type);
}

/**
 * A channel counts as restricted if @everyone is denied the bit, or if a
 * snapshot is still waiting to be restored.
 *
 * @param {import('discord.js').GuildChannel} channel
 * @param {'lock'|'hide'} kind
 * @returns {Promise<boolean>}
 */
async function isRestricted(channel, kind) {
  const { flag } = RESTRICTIONS[kind];
  const everyone = channel.permissionOverwrites.cache.get(channel.guild.id);
  if (bitState(everyone, flag) === false) return true;
  return (await db.has(snapshotKey(channel.id, kind))) === true;
}

/**
 * @param {import('discord.js').GuildChannel} channel
 * @param {'lock'|'hide'} kind
 * @param {string} reason  Audit log reason
 */
async function applyRestriction(channel, kind, reason) {
  const { permission, flag } = RESTRICTIONS[kind];
  const { guild } = channel;

  const staffRoles = guild.roles.cache.filter(isStaffRole);
  const targets = [
    { id: guild.members.me.id, type: OverwriteType.Member, value: true },
    ...staffRoles.map((role) => ({ id: role.id, type: OverwriteType.Role, value: true })),
    { id: guild.id, type: OverwriteType.Role, value: false }, // @everyone last
  ];

  const snapshot = targets.map((t) => {
    const overwrite = channel.permissionOverwrites.cache.get(t.id);
    return { id: t.id, type: t.type, existed: Boolean(overwrite), state: bitState(overwrite, flag) };
  });

  // Save before editing so a crash mid-way can still be undone.
  await db.set(snapshotKey(channel.id, kind), snapshot);

  for (const [i, target] of targets.entries()) {
    if (snapshot[i].state === target.value) continue; // already correct
    await channel.permissionOverwrites.edit(
      target.id,
      { [permission]: target.value },
      { type: target.type, reason }
    );
  }
}

/**
 * @param {import('discord.js').GuildChannel} channel
 * @param {'lock'|'hide'} kind
 * @param {string} reason  Audit log reason
 */
async function releaseRestriction(channel, kind, reason) {
  const { permission, flag } = RESTRICTIONS[kind];
  const key = snapshotKey(channel.id, kind);
  const snapshot = await db.get(key);

  // No snapshot (restricted manually or by an older bot version):
  // just clear the @everyone deny.
  if (!snapshot) {
    await restoreBit(channel, { id: channel.guild.id, type: OverwriteType.Role, state: null }, permission, flag, reason);
    return;
  }

  // Restore @everyone first so members regain access even if a later step fails.
  const ordered = [...snapshot].reverse();

  for (const entry of ordered) {
    try {
      await restoreBit(channel, entry, permission, flag, reason);
    } catch (error) {
      // A staff role may have been deleted since the lock — skip it.
      console.warn(`[lockdown] ⚠  Could not restore overwrite ${entry.id} on #${channel.name}:`, error.message);
    }
  }

  await db.delete(key);
}

/**
 * Sets one overwrite's bit back to `entry.state`. If that leaves the overwrite
 * with no allows or denies at all, the overwrite is deleted instead, so no
 * empty overwrites pile up on the channel.
 */
async function restoreBit(channel, entry, permission, flag, reason) {
  const current = channel.permissionOverwrites.cache.get(entry.id);
  const allow = new PermissionsBitField(current?.allow ?? 0n).remove(flag);
  const deny = new PermissionsBitField(current?.deny ?? 0n).remove(flag);
  if (entry.state === true) allow.add(flag);
  if (entry.state === false) deny.add(flag);

  if (allow.bitfield === 0n && deny.bitfield === 0n) {
    if (current) await channel.permissionOverwrites.delete(entry.id, reason);
    return;
  }
  if (bitState(current, flag) === entry.state) return; // already restored

  await channel.permissionOverwrites.edit(
    entry.id,
    { [permission]: entry.state },
    { type: entry.type, reason }
  );
}

module.exports = {
  RESTRICTIONS,
  supportsRestriction,
  isRestricted,
  applyRestriction,
  releaseRestriction,
};
