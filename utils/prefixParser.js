const { ApplicationCommandOptionType: OptionType } = require('discord.js');

// ── Prefix Argument Parsing ────────────────────────────────────────────────
// Prefix arguments are parsed from each command's slash-command definition,
// so commands never declare their arguments twice.
//
// Rules:
//  • If the command has subcommands, the first word picks the subcommand.
//  • Leading words are matched against the command's options by type:
//      user    → @mention, ID, or exact username / display name
//      role    → @mention, ID, or exact role name ("quote multi-word names")
//      channel → #mention or ID
//      choice  → one of the listed values (e.g. add | remove)
//      number  → a whole number within the option's min/max
//    Order doesn't matter: `?role @user @Mod add` == `?role add @Mod @user`.
//  • Free-text string options come after the matched words. Each one takes a
//    single word, except the last, which takes everything left over with the
//    original spacing and newlines preserved: `?timeout @user 2h being rude`.
//  • Names are only resolved when the command has no free-text option, so
//    the first word of a message can't be mistaken for a role or user name.

class UsageError extends Error {}

/**
 * Mirrors the subset of CommandInteractionOptionResolver used by commands.
 */
class PrefixOptions {
  constructor(subcommand, values) {
    this.subcommand = subcommand;
    this.values = values;
  }

  getSubcommand(required = true) {
    if (!this.subcommand && required) throw new UsageError('A subcommand is required.');
    return this.subcommand;
  }

  getString(name)  { return this.values.get(name) ?? null; }
  getInteger(name) { return this.values.get(name) ?? null; }
  getRole(name)    { return this.values.get(name) ?? null; }
  getChannel(name) { return this.values.get(name) ?? null; }
  getUser(name)    { return this.values.get(name)?.user ?? null; }
  getMember(name)  { return this.values.get(name)?.member ?? null; }
}

/**
 * Splits an argument string into tokens, keeping their positions so the
 * original text can be sliced back out. "Double quotes" group words.
 *
 * @param {string} input
 * @returns {{ value: string, start: number, end: number }[]}
 */
function tokenize(input) {
  const tokens = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push({
      value: match[1] ?? match[2],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

const isFreeText = (def) => def.type === OptionType.String && !def.choices?.length;

/**
 * Tries to resolve one token as a value for the given option definition.
 *
 * @returns {Promise<any|undefined>} undefined if the token doesn't fit
 */
async function resolveToken(guild, def, token, allowNames) {
  const raw = token.value;

  switch (def.type) {
    case OptionType.String: {
      const lower = raw.toLowerCase();
      const choice = def.choices.find(
        (c) => String(c.value).toLowerCase() === lower || c.name.toLowerCase() === lower
      );
      return choice ? choice.value : undefined;
    }

    case OptionType.Role: {
      const id = raw.match(/^<@&(\d{17,20})>$/)?.[1] ?? raw.match(/^(\d{17,20})$/)?.[1];
      if (id) return guild.roles.cache.get(id);
      if (!allowNames) return undefined;
      const lower = raw.toLowerCase().replace(/^@/, '');
      return guild.roles.cache.find((r) => r.id !== guild.id && r.name.toLowerCase() === lower);
    }

    case OptionType.User: {
      const id = raw.match(/^<@!?(\d{17,20})>$/)?.[1] ?? raw.match(/^(\d{17,20})$/)?.[1];
      if (id) {
        const member = await guild.members.fetch(id).catch(() => null);
        if (member) return { user: member.user, member };
        const user = await guild.client.users.fetch(id).catch(() => null);
        return user ? { user, member: null } : undefined;
      }
      if (!allowNames) return undefined;
      const lower = raw.toLowerCase().replace(/^@/, '');
      const member = guild.members.cache.find(
        (m) =>
          m.user.username.toLowerCase() === lower ||
          m.displayName.toLowerCase() === lower
      );
      return member ? { user: member.user, member } : undefined;
    }

    case OptionType.Integer: {
      if (!/^-?\d+$/.test(raw)) return undefined;
      const value = Number(raw);
      const { min_value: min, max_value: max } = def;
      if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
        const range =
          min !== undefined && max !== undefined ? `between ${min} and ${max}`
          : min !== undefined ? `at least ${min}`
          : `at most ${max}`;
        throw new UsageError(`\`${def.name}\` must be ${range}.`);
      }
      return value;
    }

    case OptionType.Channel: {
      const id = raw.match(/^<#(\d{17,20})>$/)?.[1] ?? raw.match(/^(\d{17,20})$/)?.[1];
      return id ? guild.channels.cache.get(id) : undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Parses a prefix command's argument string into PrefixOptions.
 *
 * @param {import('discord.js').Guild} guild
 * @param {object} commandJson  command.data.toJSON()
 * @param {string} argString    Everything after the command name
 * @returns {Promise<PrefixOptions>}
 * @throws {UsageError}
 */
async function parsePrefixArgs(guild, commandJson, argString) {
  let tokens = tokenize(argString);
  let defs = commandJson.options ?? [];
  let subcommand = null;

  // ── Subcommand selection ────────────────────────────────────────────
  const subcommands = defs.filter((d) => d.type === OptionType.Subcommand);
  if (subcommands.length) {
    const name = tokens[0]?.value.toLowerCase();
    const sub = subcommands.find((s) => s.name === name);
    if (!sub) {
      throw new UsageError(
        name
          ? `Unknown subcommand \`${name}\`.`
          : `Choose a subcommand: ${subcommands.map((s) => `\`${s.name}\``).join(', ')}.`
      );
    }
    subcommand = sub.name;
    defs = sub.options ?? [];
    argString = argString.slice(tokens[0].end);
    tokens = tokenize(argString);
  }

  const freeTextDefs = defs.filter(isFreeText);
  const typedDefs = defs.filter((d) => !isFreeText(d));
  const values = new Map();

  // ── Match leading tokens to typed options (any order) ───────────────
  let index = 0;
  while (index < tokens.length) {
    let matched = false;
    for (const def of typedDefs) {
      if (values.has(def.name)) continue;
      const value = await resolveToken(guild, def, tokens[index], freeTextDefs.length === 0);
      if (value !== undefined) {
        values.set(def.name, value);
        matched = true;
        break;
      }
    }
    if (!matched) break;
    index++;
  }

  // ── Remaining text → free-text options ──────────────────────────────
  // Every free-text option but the last takes one word; the last takes the rest.
  if (index < tokens.length && freeTextDefs.length === 0) {
    throw new UsageError(`I couldn't understand \`${tokens[index].value}\`.`);
  }

  for (const [i, def] of freeTextDefs.entries()) {
    if (index >= tokens.length) break;
    const isLast = i === freeTextDefs.length - 1;
    const text = isLast ? argString.slice(tokens[index].start).trim() : tokens[index].value;
    index++;

    if (def.max_length && text.length > def.max_length) {
      throw new UsageError(`\`${def.name}\` must be at most ${def.max_length} characters.`);
    }
    if (def.min_length && text.length < def.min_length) {
      throw new UsageError(`\`${def.name}\` must be at least ${def.min_length} characters.`);
    }
    values.set(def.name, text);
  }

  // ── Required option check ───────────────────────────────────────────
  const missing = defs.filter((d) => d.required && !values.has(d.name));
  if (missing.length) {
    const kinds = [
      missing.some((d) => d.type === OptionType.User) && 'user',
      missing.some((d) => d.type === OptionType.Role) && 'role',
    ].filter(Boolean);
    throw new UsageError(
      `Missing ${missing.map((d) => `\`${d.name}\``).join(', ')}.` +
      (kinds.length ? ` Mention the ${kinds.join(' and ')}, or paste the ID.` : '')
    );
  }

  return new PrefixOptions(subcommand, values);
}

/**
 * Builds human-readable prefix usage lines from a command definition,
 * e.g. ["?role <role> <target> [add|remove]"].
 *
 * @param {string} prefix
 * @param {object} commandJson
 * @returns {string[]}
 */
function formatUsage(prefix, commandJson) {
  // Free text always comes last when typed, so list it last.
  const formatOptions = (options = []) =>
    [...options.filter((o) => !isFreeText(o)), ...options.filter(isFreeText)]
      .map((o) => {
        const label = o.choices?.length ? o.choices.map((c) => c.value).join('|') : o.name;
        return o.required ? `<${label}>` : `[${label}]`;
      })
      .join(' ');

  const subcommands = (commandJson.options ?? []).filter((o) => o.type === OptionType.Subcommand);
  if (subcommands.length) {
    return subcommands.map((s) =>
      `${prefix}${commandJson.name} ${s.name} ${formatOptions(s.options)}`.trim()
    );
  }
  return [`${prefix}${commandJson.name} ${formatOptions(commandJson.options)}`.trim()];
}

module.exports = { UsageError, PrefixOptions, parsePrefixArgs, formatUsage, tokenize };
