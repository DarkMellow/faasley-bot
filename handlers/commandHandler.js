const fs = require('fs');
const path = require('path');
const { InteractionContextType } = require('discord.js');
const { LEVELS, LEVEL_INFO } = require('../utils/permissions');

/**
 * Reads every command module from commands/<category>/*.js and normalises it:
 *  - `category` is set from the folder name
 *  - `level` defaults to "everyone"
 *  - the slash definition gets Discord-side default member permissions for
 *    its level (so the command is hidden from members who can't use it) and
 *    is restricted to guilds
 *
 * @returns {object[]} Command modules
 */
function readCommands() {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commands = [];

  for (const category of fs.readdirSync(commandsPath)) {
    const categoryPath = path.join(commandsPath, category);

    // Only process directories (e.g. moderation/, utility/)
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const commandFiles = fs
      .readdirSync(categoryPath)
      .filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const command = require(path.join(categoryPath, file));

      if (!command.data || !command.execute) {
        console.warn(
          `[CommandHandler] ⚠  Skipping ${file} — missing "data" or "execute" export.`
        );
        continue;
      }

      command.category = category;
      command.level ??= 'everyone';
      if (!(command.level in LEVELS)) {
        throw new Error(`[CommandHandler] ${file} has unknown level "${command.level}".`);
      }

      const permission = LEVEL_INFO[command.level].permission;
      if (permission) command.data.setDefaultMemberPermissions(permission);
      command.data.setContexts(InteractionContextType.Guild);

      commands.push(command);
    }
  }

  return commands;
}

/**
 * Registers all commands onto client.commands keyed by their name.
 *
 * @param {import('discord.js').Client} client
 */
function loadCommands(client) {
  for (const command of readCommands()) {
    client.commands.set(command.data.name, command);
  }
  console.log(`[CommandHandler] ✅  Loaded ${client.commands.size} command(s).`);
}

module.exports = { readCommands, loadCommands };
