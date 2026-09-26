# Discord Bot Development Guide & Architectural Specifications — v0.2

> v0.1 (the original guide) is preserved in git history. v0.2 simplifies
> configuration: access follows Discord's own server permissions, every command
> works as both a slash command and a prefix command, and broadcasts are rate-limited.

## 1. Overview & System Goals
This guide details the architectural rules, directory structure, permission model, and feature specifications for a production-ready Discord bot built with **discord.js**.

Every feature implemented in a given phase must be fully fleshed out, edge-case resilient, and production-ready from its initial deployment.

---

## 2. Environment & Dependencies

* **Runtime:** Node.js 22+ (`engines` in package.json, `.node-version`).
* **Packages:** `discord.js` (v14.x), `dotenv`, `quick.db` with `better-sqlite3` (local) and `mongoose` 6 (production MongoDB driver). More packages may be added when a feature needs them.
* **Gateway Intents:** `Guilds`, `GuildMessages`, `MessageContent`, `GuildMembers`, `GuildVoiceStates` (voice XP; not privileged).
* **Environment variables** (see `.env.example`): `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID` (optional test server for `npm run deploy:guild`), `MONGODB_URI` (production database; unset = local `json.sqlite`), `PORT` (set by the host; starts the health server).
* **Bot permissions in a server:** Manage Roles, Manage Nicknames, Kick Members, Ban Members, Timeout Members, View Channels, Send Messages, Embed Links, Read Message History (invite permission integer `1099914365958`, scopes `bot applications.commands`). The bot's role must sit above any role it assigns and any member it moderates.

### Scripts
| Script | Purpose |
|---|---|
| `npm start` | Run the bot |
| `npm run deploy` | Register slash commands globally (up to 1 hour to propagate) |
| `npm run deploy:guild` | Register slash commands to `GUILD_ID` only (instant, for testing) |

### Hosting (Render + MongoDB Atlas)
* `render.yaml` defines a free **web service**: build `npm ci && npm run deploy` (so every push re-syncs slash commands), start `npm start`, health check `/health`.
* `utils/healthServer.js` listens on `$PORT` only when it is set: `/` always returns 200 (uptime-monitor target that keeps the free service awake), `/health` returns 200 once the bot is connected to Discord and 503 before.
* Data lives in MongoDB (`MONGODB_URI`) because the host's disk is wiped on every deploy. `utils/db.js` connects before login; startup order is health server → database → commands/events → Discord login, and any failure exits with code 1 so the host restarts the process.
* Step-by-step setup is in README.md.

---

## 3. Directory Structure

```text
├── index.js                 # Startup: health server → database → handlers → login
├── deploy-commands.js       # Slash command registration (global or --guild)
├── render.yaml              # Render Blueprint (free web service)
├── .env.example             # Documented environment variables
├── json.sqlite              # Local quick.db storage (development only, git-ignored)
│
├── handlers/
│   ├── commandHandler.js    # Loads commands/<category>/*.js, applies level metadata
│   ├── commandRunner.js     # The single permission gate every command passes through
│   └── eventHandler.js      # Loads events/*.js with error-safe listeners
│
├── events/
│   ├── ready.js             # Startup logger & presence
│   ├── interactionCreate.js # Slash commands → commandRunner
│   └── messageCreate.js     # Prefix commands → commandRunner, AFK logic, easter egg
│
├── utils/
│   ├── db.js                # Shared database wrapper: MongoDB or local SQLite (key conventions listed)
│   ├── healthServer.js      # HTTP / and /health for hosting platforms
│   ├── permissions.js       # Permission levels
│   ├── context.js           # CommandContext — one API for slash + prefix
│   ├── prefixParser.js      # Prefix args parsed from each command's slash definition
│   ├── guildConfig.js       # Per-server prefix, warning limit, broadcast cooldown
│   ├── lockdown.js          # Snapshot/restore for lock & hide
│   ├── afk.js               # AFK persistence
│   ├── warnings.js          # Warning persistence
│   ├── levels.js            # Chat + voice XP storage, level curve, XP channel rules
│   ├── voiceXp.js           # Once-a-minute voice XP ticker (started in ready.js)
│   ├── moderation.js        # Rank checks, audit reasons, DM notices for member actions
│   ├── duration.js          # "10m" / "1h30m" duration parsing
│   └── embeds.js            # Shared colours & embed helpers
│
└── commands/
    ├── channels/            # lock, unlock, hide, unhide
    ├── moderation/          # warn, warnings, clearwarns, timeout, untimeout, kick, ban, unban, role
    ├── levels/              # rank, leaderboard, xpchannel
    ├── utility/             # afk, help
    └── admin/               # config, broadcast
```

---

## 4. Permission Model

There is **nothing to configure**. A member's level comes from their Discord permissions; each level includes all levels below it.

| Level | Granted by |
|---|---|
| Everyone | All members |
| Mod | **Timeout Members** permission |
| Admin | **Manage Server** permission (or Administrator) |
| Owner | Server owner |

| Command | Level |
|---|---|
| `help`, `afk`, `rank`, `leaderboard` | Everyone |
| `lock`, `unlock`, `hide`, `unhide`, `role`, `warn`, `warnings`, `timeout`, `untimeout`, `xpchannel` | Mod |
| `kick`, `ban`, `unban`, `clearwarns`, `config`, `broadcast` | Admin |

* **One gate:** `handlers/commandRunner.js` checks the level, then the bot's channel permissions (`botPermissions`), then runs the command inside a catch-all error handler. Commands do not implement their own authorization.
* **Slash visibility:** each slash command is registered with `default_member_permissions` matching its level, so Discord hides it from members who can't use it. Server admins may widen slash access in *Server Settings → Integrations*, but the bot's own level check always applies (including to prefix commands).
* **Hierarchy rules for `/role`** (fixed safety rules, not settings):
  * Reject `@everyone` and managed roles.
  * Reject if `role.position >= botMember.roles.highest.position`.
  * Unless Server Owner: reject if `role.position >= executor.roles.highest.position`.
  * Unless Server Owner: reject if `targetMember.roles.highest.position >= executor.roles.highest.position`.
* **Target rules for member actions** (`warn`, `timeout`, `untimeout`, `kick`, `ban` — `utils/moderation.js`):
  * Nobody can target themselves, the bot, or the server owner.
  * Unless Server Owner: the target's highest role must be strictly below the executor's.
  * The target's highest role must be strictly below the bot's.

---

## 5. Command Architecture

Each command module exports:

```js
module.exports = {
  data: new SlashCommandBuilder()...,   // single source of truth for arguments
  level: 'everyone' | 'mod' | 'admin' | 'owner',
  botPermissions: [PermissionFlagsBits...], // optional, checked in the current channel
  async execute(ctx) { ... },              // ctx: CommandContext
};
```

* **`CommandContext`** wraps an interaction or a message: `ctx.guild`, `ctx.channel`, `ctx.member`, `ctx.user`, `ctx.prefix`, `ctx.isSlash`, `ctx.options.getString/getUser/getMember/getRole/getChannel/getSubcommand`, `ctx.reply(payload)`, `ctx.defer()`.
  * `ephemeral: true` applies to slash replies; prefix replies are normal messages.
  * The object returned by `ctx.reply()` supports `.edit()`, `.awaitMessageComponent()` and `.createMessageComponentCollector()` for both sources.
* **Help is generated** from the loaded commands, grouped by folder: one usage line and the slash description per command, with "who can use" shown once per page. Keep slash descriptions to one short sentence.

### Prefix Commands
* Default prefix `?`, changeable per server with `/config prefix`. Mentioning the bot also works as a prefix. Whitespace after the prefix is allowed (`? lock`).
* Arguments are parsed from the slash definition:
  * Subcommand first (`?config prefix !`).
  * Users/roles/channels by mention or ID; users and roles also by exact name when the command has no free-text argument. Quote multi-word names: `"Senior Mod"`.
  * Choices by value (`add`, `remove`); whole numbers within the option's min/max.
  * Typed arguments can be in any order: `?role @user @Mod add` = `?role add @Mod @user`.
  * Free-text arguments come after those: each takes one word except the last, which takes the rest of the message with newlines preserved (`?timeout @user 2h being rude`, `?broadcast @Role message...`).
* Invalid arguments reply with the error and the generated usage line.

---

## 6. Feature Specifications

### Channel Lockdown — `lock` / `unlock`
* Channel types: text, announcement, voice.
* **Lock:** snapshot the `SendMessages` bit of every overwrite about to change, then allow it for the bot and every *staff role* (roles with Timeout Members or Manage Server, excluding Administrator roles which bypass overwrites), then deny it for `@everyone`. Staff roles that already allow it are left alone.
* **Unlock:** restore each snapshotted bit exactly; delete any overwrite left empty. With no snapshot (locked manually), clear the `@everyone` deny.
* Locked = `@everyone` denies the bit **or** a snapshot exists.
* Response: public embed in the channel; slash commands also get an ephemeral confirmation.

### Channel Visibility — `hide` / `unhide`
* Same mechanism as lock, using the `ViewChannel` bit. Channel types: text, announcement, voice, stage, forum.
* Only the single bit is touched, so a channel can be locked and hidden independently and restores cleanly in any order.
* Response: confirmation to the executor (ephemeral for slash).

### Role Assignment — `role <role> <target> [add|remove]`
* `action` omitted → toggle.
* Validation per §4 hierarchy rules, plus "already has / doesn't have" checks. Bot needs Manage Roles.
* Response: embed with member, role, action, and executor.

### AFK Engine — `afk [reason]`
* Schema: `afk_<guildId>_<userId> = { status, reason, timestamp, originalNickname, nicknameChanged }`.
* Prepends `[AFK]` to the nickname when the bot can manage the member; records whether it did.
* **messageCreate:**
  1. Any message (including prefix commands, except `afk` itself) from an AFK user clears the status, restores the nickname if the bot changed it, and posts a welcome back message deleted after 5 seconds.
  2. Non-command messages mentioning AFK members get one reply listing each user, reason and time away.

### Broadcast — `broadcast <message> [role]` (Admin)
* DMs members of a role, or everyone (with a 30-second confirmation step). Bots and the executor are skipped; 250 ms between DMs.
* **Limit: 1 broadcast per 6 hours per server**, stored as `broadcast_last_<guildId>` so it survives restarts.
  * The cooldown starts when sending begins. Cancelling, timing out, a failed member fetch, or zero recipients do not use the slot.
  * Only one broadcast can send per server at a time; the cooldown is re-checked after confirmation.
  * Blocked attempts show when the next broadcast is available.
* The final report falls back to a DM to the executor if the slash reply has expired (15-minute interaction token limit).

### Warnings — `warn` / `warnings` / `clearwarns`
* Schema: `warns_<guildId>_<userId> = [{ reason, moderatorId, timestamp }]` (oldest first; `#n` = position).
* `warn <user> [reason]` (Mod): records the warning and DMs the member. Bots can't be warned.
* **Auto-kick:** when the count reaches the server's limit (`config warnlimit`, default 3, 0 = off), the member is DMed, kicked, and their warnings reset. If the bot lacks Kick Members or a higher role, the warning is still recorded and the reply says the kick failed.
* `warnings <user>` (Mod): newest 10 warnings with moderator and time; footer shows the limit.
* `clearwarns <user> [number]` (Admin): removes one warning or all.

### Timeouts — `timeout <user> <duration> [reason]` / `untimeout <user> [reason]` (Mod)
* Duration format: `30s`, `10m`, `2h`, `1d`, `1w`, combinable (`1h30m`); max 28 days (Discord's limit). Re-running on a timed-out member updates the timeout.
* Administrators can't be timed out (Discord rule). The member is DMed after the timeout is applied.

### Kick & Ban — `kick <user> [reason]` / `ban <user> [none|1h|1d|7d] [reason]` / `unban <user> [reason]` (Admin)
* The member is DMed **before** the kick/ban (DMs fail once they've left).
* `ban` also accepts user IDs of people not in the server (no rank checks apply to them) and can delete their last 1h / 1d / 7d of messages.
* All actions write `<reason> — by <moderator>` to the audit log.

### Leveling — `rank` / `leaderboard` / `xpchannel`
Chat and voice are **separate levels** that share one curve.

* **Curve:** going from level L to L+1 costs `50L + 100` XP (100, 150, 200, 250, …). Total XP to reach level L is `25L² + 75L` (level 10 = 3,250 XP; level 20 = 11,500 XP). Levels are derived from XP, never stored.
* **Storage:** `xp_<guildId>_<userId> = { chatXp, voiceXp, voiceMinutes }` in its own `levels` table/collection, since leaderboards scan every row in it. All updates go through `addXp`, which chains updates per member so rapid messages and voice ticks never overwrite each other.

#### Chat XP
* Every message earns a random **5–10 XP** — no cooldown, since active members send 1–2 messages a second. Spam is controlled per channel with `xpchannel`. Bots, DMs and prefix-command messages earn nothing. (~15 messages for level 1, ~430 for level 10.)
* Level-ups are announced in the channel where they happened: "🎉 @member reached **chat level N**!"

#### Voice XP
* Once a minute (`utils/voiceXp.js`), every non-bot member in a voice or stage channel earns **10 XP** — **only if at least 2 non-bot members are in that channel**, so sitting alone to farm XP earns nothing. Bots neither earn nor count toward the 2. (10 minutes for level 1, ~5h25m for level 10.)
* Never earns: the server's AFK channel, and channels denied (or not allowed) by `xpchannel`.
* Computed from the live voice-state cache every tick, so joins, moves, restarts and disconnects need no tracking. Ticks never overlap.
* `voiceMinutes` counts earning minutes, shown as time in voice.
* Level-ups are announced in the voice channel's text chat: "🎙️ @member reached **voice level N**!"

#### Commands
* **`xpchannel allow|deny|remove <channel>` / `xpchannel list`** (Mod), stored as `xpchannels_<guildId> = { allowed, denied }` — applies to both chat and voice XP:
  * Rules can target channels or categories; threads follow their parent channel.
  * Denied (channel, thread parent, or category) → never earns XP.
  * If any channel is allowed → only allowed channels (or channels in allowed categories) earn XP.
  * No allowed channels → every channel earns XP except denied ones.
* **`rank [user]`:** chat and voice level, rank, total XP and a progress bar for each, plus time in voice.
* **`leaderboard [chat|voice] [page]`:** 10 members per page with level and XP (voice also shows time); footer shows the caller's position.

### Server Settings — `config view` / `config prefix <prefix>` / `config warnlimit <limit>` (Admin)
* `view`: prefix, next broadcast availability, auto-kick limit, permission levels.
* `prefix`: 1–5 characters, no spaces.
* `warnlimit`: 0–20; 0 turns auto-kick off.

### Help — `help`
* Paged embed (Overview + one page per category) switched with a dropdown menu, active for 5 minutes. Includes the `hello` easter egg note.

---

## 7. Development Rules

1. **No Incremental Placeholders:** every command is complete and production-ready.
2. **Validation First:** permission, hierarchy and state checks run before any state change.
3. **User Feedback:** every slash interaction is acknowledged within 3 seconds (`ctx.reply` or `ctx.defer`).
4. **One Gate:** authorization lives in `commandRunner.js` via `level`; commands never re-implement it.
5. **Write Once:** commands use `CommandContext` so slash and prefix behave identically.
6. **Crash Safety:** event listeners are wrapped; unhandled rejections and client errors are logged, not fatal.
7. **Secrets:** authentication details live in `.env` and are never committed.
