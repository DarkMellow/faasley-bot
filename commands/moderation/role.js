const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { isAuthorized } = require('../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('🎭 Add or remove a role from a member.')
    .addUserOption((opt) =>
      opt
        .setName('target')
        .setDescription('The member to modify roles for')
        .setRequired(true)
    )
    .addRoleOption((opt) =>
      opt
        .setName('role')
        .setDescription('The role to add or remove')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('Whether to add or remove the role')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        )
    ),

  /**
   * Adds or removes a role from a target member with full hierarchy validation.
   *
   * Guard order:
   *  1. Executor authorization (isAuthorized whitelist / guild owner)
   *  2. Bot ManageRoles permission
   *  3. Managed role guard (bot-integration roles can never be assigned)
   *  4. Bot hierarchy (bot must outrank the target role)
   *  5. Executor hierarchy vs target role (unless server owner)
   *  6. Executor hierarchy vs target member (unless server owner)
   *  7. "Already has / doesn't have" state check
   *  8. Execute
   *
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const { guild, member: executor } = interaction;

    const targetUser = interaction.options.getUser('target');
    const targetRole = interaction.options.getRole('role');
    const action     = interaction.options.getString('action'); // 'add' | 'remove'

    // ── 1. Executor Authorization ────────────────────────────────────────
    if (!(await isAuthorized(executor, guild))) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('🚫 Access Denied')
            .setDescription('You do not have permission to manage roles with this bot.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // Fetch GuildMember for the target (needed for hierarchy checks)
    let targetMember;
    try {
      targetMember = await guild.members.fetch(targetUser.id);
    } catch {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Member Not Found')
            .setDescription('That user does not appear to be in this server.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    const botMember      = guild.members.me;
    const isServerOwner  = executor.id === guild.ownerId;

    // ── 2. Bot ManageRoles Permission ────────────────────────────────────
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('🤖 Missing Permissions')
            .setDescription('I need the **Manage Roles** permission to assign roles.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── 3. Managed Role Guard ────────────────────────────────────────────
    // Managed roles are owned by bot integrations and cannot be manually assigned.
    if (targetRole.managed) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('⛔ Managed Role')
            .setDescription(
              `**${targetRole.name}** is a managed role (owned by a bot or integration) and cannot be manually assigned or removed.`
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── 4. Bot Hierarchy vs Target Role ──────────────────────────────────
    // The bot's highest role must be strictly above the role it's trying to assign.
    if (targetRole.position >= botMember.roles.highest.position) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('⚠️ Bot Hierarchy Error')
            .setDescription(
              `I can't assign **${targetRole.name}** because it's at or above my highest role in the hierarchy.\n` +
              `Move my role above **${targetRole.name}** in Server Settings → Roles.`
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── 5. Executor Hierarchy vs Target Role (skip for server owner) ─────
    if (!isServerOwner && targetRole.position >= executor.roles.highest.position) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('⚠️ Hierarchy Error')
            .setDescription(
              `You can't assign **${targetRole.name}** because it's at or above your highest role.\n` +
              `You can only manage roles that are below your own.`
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── 6. Executor Hierarchy vs Target Member (skip for server owner) ───
    if (!isServerOwner && targetMember.roles.highest.position >= executor.roles.highest.position) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('⚠️ Hierarchy Error')
            .setDescription(
              `You can't modify roles for <@${targetUser.id}> because their highest role is at or above yours.`
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── 7. State Check ───────────────────────────────────────────────────
    const alreadyHasRole = targetMember.roles.cache.has(targetRole.id);

    if (action === 'add' && alreadyHasRole) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa502)
            .setTitle('⚠️ Already Has Role')
            .setDescription(`<@${targetUser.id}> already has the **${targetRole.name}** role.`)
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    if (action === 'remove' && !alreadyHasRole) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa502)
            .setTitle("⚠️ Doesn't Have Role")
            .setDescription(`<@${targetUser.id}> doesn't have the **${targetRole.name}** role.`)
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    // ── 8. Execute ───────────────────────────────────────────────────────
    await interaction.deferReply({ ephemeral: true });

    try {
      if (action === 'add') {
        await targetMember.roles.add(targetRole, `Role added by ${executor.user.tag}`);
      } else {
        await targetMember.roles.remove(targetRole, `Role removed by ${executor.user.tag}`);
      }

      const isAdd      = action === 'add';
      const color      = isAdd ? 0x2ed573 : 0xff6b81;
      const emoji      = isAdd ? '✅' : '🗑️';
      const actionWord = isAdd ? 'Added' : 'Removed';
      const prepWord   = isAdd ? 'to'    : 'from';

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle(`${emoji} Role ${actionWord}`)
            .addFields(
              { name: 'Member',    value: `<@${targetUser.id}>`,  inline: true },
              { name: 'Role',      value: `<@&${targetRole.id}>`, inline: true },
              { name: 'Action',    value: `${actionWord} ${prepWord} member`, inline: true },
              { name: 'Performed by', value: `<@${executor.id}>`, inline: true }
            )
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error('[role] ❌  Failed to modify role:', error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Error')
            .setDescription(
              'An error occurred while modifying the role. Check my role hierarchy and permissions.'
            )
            .setTimestamp(),
        ],
      });
    }
  },
};
