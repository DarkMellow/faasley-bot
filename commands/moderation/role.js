const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, warnEmbed, makeEmbed, COLORS } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('🎭 Add or remove a role from a member.')
    .addRoleOption((opt) =>
      opt
        .setName('role')
        .setDescription('The role to add or remove')
        .setRequired(true)
    )
    .addUserOption((opt) =>
      opt
        .setName('target')
        .setDescription('The member to modify roles for')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('Add or remove the role (leave empty to toggle)')
        .setRequired(false)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        )
    ),
  level: 'mod',

  /**
   * Adds or removes a role from a target member with full hierarchy validation.
   *
   * Guard order:
   *  1. Target must be a member of this server
   *  2. Bot ManageRoles permission
   *  3. Role guards (@everyone / managed roles can never be assigned)
   *  4. Bot hierarchy (bot must outrank the target role)
   *  5. Executor hierarchy vs target role (unless server owner)
   *  6. Executor hierarchy vs target member (unless server owner)
   *  7. "Already has / doesn't have" state check
   *  8. Execute
   *
   * @param {import('../../utils/context').CommandContext} ctx
   */
  async execute(ctx) {
    const { guild, member: executor } = ctx;

    const targetUser = ctx.options.getUser('target');
    const targetRole = ctx.options.getRole('role');
    const deny = (title, description) =>
      ctx.reply({ embeds: [errorEmbed(title, description)], ephemeral: true });

    // ── 1. Target member ─────────────────────────────────────────────────
    const targetMember =
      ctx.options.getMember('target') ?? (await guild.members.fetch(targetUser.id).catch(() => null));
    if (!targetMember) {
      return deny('❌ Member Not Found', 'That user does not appear to be in this server.');
    }

    const botMember = guild.members.me;
    const isServerOwner = executor.id === guild.ownerId;

    // ── 2. Bot ManageRoles Permission ────────────────────────────────────
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return deny('🤖 Missing Permissions', 'I need the **Manage Roles** permission to assign roles.');
    }

    // ── 3. Role Guards ───────────────────────────────────────────────────
    if (targetRole.id === guild.id) {
      return deny('⛔ Invalid Role', 'The `@everyone` role cannot be added or removed.');
    }
    if (targetRole.managed) {
      return deny(
        '⛔ Managed Role',
        `**${targetRole.name}** is a managed role (owned by a bot or integration) and cannot be manually assigned or removed.`
      );
    }

    // ── 4. Bot Hierarchy vs Target Role ──────────────────────────────────
    if (targetRole.position >= botMember.roles.highest.position) {
      return deny(
        '⚠️ Bot Hierarchy Error',
        `I can't assign **${targetRole.name}** because it's at or above my highest role in the hierarchy.\n` +
        `Move my role above **${targetRole.name}** in Server Settings → Roles.`
      );
    }

    // ── 5. Executor Hierarchy vs Target Role (skip for server owner) ─────
    if (!isServerOwner && targetRole.position >= executor.roles.highest.position) {
      return deny(
        '⚠️ Hierarchy Error',
        `You can't assign **${targetRole.name}** because it's at or above your highest role.\n` +
        `You can only manage roles that are below your own.`
      );
    }

    // ── 6. Executor Hierarchy vs Target Member (skip for server owner) ───
    if (!isServerOwner && targetMember.roles.highest.position >= executor.roles.highest.position) {
      return deny(
        '⚠️ Hierarchy Error',
        `You can't modify roles for <@${targetUser.id}> because their highest role is at or above yours.`
      );
    }

    // ── 7. State Check ───────────────────────────────────────────────────
    const alreadyHasRole = targetMember.roles.cache.has(targetRole.id);
    const action = ctx.options.getString('action') ?? (alreadyHasRole ? 'remove' : 'add');

    if (action === 'add' && alreadyHasRole) {
      return ctx.reply({
        embeds: [warnEmbed('⚠️ Already Has Role', `<@${targetUser.id}> already has the **${targetRole.name}** role.`)],
        ephemeral: true,
      });
    }

    if (action === 'remove' && !alreadyHasRole) {
      return ctx.reply({
        embeds: [warnEmbed("⚠️ Doesn't Have Role", `<@${targetUser.id}> doesn't have the **${targetRole.name}** role.`)],
        ephemeral: true,
      });
    }

    // ── 8. Execute ───────────────────────────────────────────────────────
    await ctx.defer({ ephemeral: true });

    const isAdd = action === 'add';
    if (isAdd) {
      await targetMember.roles.add(targetRole, `Role added by ${ctx.user.tag}`);
    } else {
      await targetMember.roles.remove(targetRole, `Role removed by ${ctx.user.tag}`);
    }

    const actionWord = isAdd ? 'Added' : 'Removed';
    const prepWord   = isAdd ? 'to'    : 'from';

    await ctx.reply({
      embeds: [
        makeEmbed(isAdd ? COLORS.success : 0xff6b81, `${isAdd ? '✅' : '🗑️'} Role ${actionWord}`)
          .addFields(
            { name: 'Member',       value: `<@${targetUser.id}>`,  inline: true },
            { name: 'Role',         value: `<@&${targetRole.id}>`, inline: true },
            { name: 'Action',       value: `${actionWord} ${prepWord} member`, inline: true },
            { name: 'Performed by', value: `<@${executor.id}>`,    inline: true }
          ),
      ],
    });
  },
};
