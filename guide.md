# Discord Bot Development Guide & Architectural Specifications

## 1. Overview & System Goals
This guide details the architectural rules, directory structure, permission matrix, and feature specifications for building a production-ready Discord bot using **discord.js**.

The implementation strategy follows a feature-complete model: every feature implemented in a given phase must be fully fleshed out, edge-case resilient, and production-ready from its initial deployment.

---

## 2. Environment & Dependencies

### Prerequisites
* **Required Packages:**
  * `discord.js` (v14.x)
  * `dotenv`
  * `quick.db` (or `better-sqlite3` equivalent engine)
The AI agent is free to install more packages in order to complete the tasks and build the necessary features if needed.

### Required Discord Developer Portal Gateway Intents
* `Guilds`
* `GuildMessages`
* `MessageContent`
* `GuildMembers`

---

## 3. Directory Structure

The project uses a modular Command and Event Handler pattern to allow seamless scaling and isolation of concerns.

```text
discord-bot/
├── .env                  # Environment variables (BOT_TOKEN, CLIENT_ID, GUILD_ID)
├── config.json           # Allowed moderator/admin role IDs
├── index.js              # Client initialization and handler bootstrap
├── deploy-commands.js    # Slash command registration script
├── database.json / db    # Storage for persistent state (AFK tracking)
│
├── handlers/
│   ├── commandHandler.js # Dynamic slash command loader
│   └── eventHandler.js   # Dynamic event loader
│
├── events/
│   ├── ready.js          # Startup logger & bot activity state
│   ├── interactionCreate.js # Slash command execution router
│   └── messageCreate.js  # AFK detection, mention checks, auto-clearing
│
└── commands/
    ├── moderation/
    │   ├── lock.js       # Channel lockdown control
    │   ├── unlock.js     # Channel lockdown release
    │   ├── hide.js       # Channel visibility revocation
    │   ├── unhide.js     # Channel visibility restoration
    │   └── role.js       # Role management with hierarchy validation
    └── utility/
        └── afk.js        # AFK status switcher
```

---

## 4. Administrative Authorization & Role Validation Framework

Moderation features (`lock`, `unlock`, `hide`, `unhide`, `role`) require strict authorization checks.

### Authorization Hierarchy Rules
1. **Server Owner Immunity:** The Guild Owner (`interaction.guild.ownerId === interaction.user.id`) bypasses all administrative permission checks.
2. **Authorized Role Whitelist:** Non-owner users attempting moderation commands must possess at least one role ID listed in the `allowedRoleIds` array in `config.json`.
3. **Hierarchy Enforcement for Role Assignment (`/role`):**
   * **Executor vs Target Role:** The executor's highest role position (`member.roles.highest.position`) must be strictly higher than the target role's position (`targetRole.position`).
   * **Executor vs Target Member:** The executor's highest role position must be strictly higher than the target user's highest role position (`targetMember.roles.highest.position`).
   * **Bot vs Target Role:** The bot's highest role position in the server (`guild.members.me.roles.highest.position`) must be strictly higher than the target role's position.

---

## 5. Feature Implementation Specifications

### Phase 1: Core Architecture & Command Handler Pipeline
* **`index.js` Setup:** Initialize `Client` with `Guilds`, `GuildMessages`, `MessageContent`, and `GuildMembers` intents. Instantiate collections for `client.commands`.
* **Handlers (`handlers/`):**
  * `commandHandler.js`: Recursively read `commands/` subfolders, attach command definitions to `client.commands`.
  * `eventHandler.js`: Load event files from `events/` and register via `client.on` or `client.once`.
* **`deploy-commands.js`:** Register slash command JSON data to Discord API globally or for target testing guild. Keep listening for a custom prefix too for example "? role <Role> @user" or "? lock".

---

### Phase 2: Channel Lockdown Management (`lock` & `unlock`)

#### `/lock` Command
* **Target Audience Control:** Modifies channel permission overwrite for `@everyone` (`guild.roles.everyone`) or anyone with roles below the moderative permission role or whitelisted role. This is to prevent anyone without a hierarchy talk in that channel. Only the moderators or people with role higher than the bot-moderation role, can talk in that channel because the role that has the highest priority (moderation role) still has the "SendMessages" permission. If the moderator or roles outside the bot-moderation role, that has higher authority than the bot-moderation role (the whitelisted role or the bot itself if higher authority), it can override the bot's permissions too. But in this case, we are trying to lock the channel for `@everyone` and roles below the moderation role.
* **Overwrite State:** Set `SendMessages: false`.
* **Preservation of Overrides:** Roles with explicit `SendMessages: true` overrides on the channel (e.g., Moderators/Admins) retain talking privileges.
* **Validation:**
  * Validate executor authorization (`allowedRoleIds` check or Server Owner).
  * Check if channel is already locked for `@everyone`.
* **Response:** Send an ephemeral confirmation to the executor and an embed in the locked channel stating it has been locked down.

#### `/unlock` Command
* **Target Audience Control:** Modifies channel permission overwrite for `@everyone`.
* **Overwrite State:** Reset `SendMessages` permission overwrite to `null` (inheriting default guild state) or explicit `true`.
* **Validation:**
  * Validate executor authorization (`allowedRoleIds` check or Server Owner).
  * Check if channel is currently unlocked.
* **Response:** Send an ephemeral confirmation to the executor and an embed in the channel notifying users of restored access.

---

### Phase 3: Channel Visibility Control (`hide` & `unhide`)

#### `/hide` Command
* **Target Audience Control:** Modifies channel permission overwrite for `@everyone`.
* **Overwrite State:** Set `ViewChannel: false`.
* **Preservation of Overrides:** Roles with explicit `ViewChannel: true` overwrites (e.g., Staff/Admins) continue to see the channel.
* **Validation:**
  * Validate executor authorization (`allowedRoleIds` check or Server Owner).
  * Check if channel is already hidden.
* **Response:** Ephemeral confirmation to executor.

#### `/unhide` Command
* **Target Audience Control:** Modifies channel permission overwrite for `@everyone`.
* **Overwrite State:** Reset `ViewChannel` permission overwrite to `null` or explicit `true`.
* **Validation:**
  * Validate executor authorization (`allowedRoleIds` check or Server Owner).
* **Response:** Ephemeral confirmation to executor.

---

### Phase 4: Role Assignment System (`role`)

#### `/role` Command Structure
* **Parameters:**
  * `target` (User / Member) - Required
  * `role` (Role) - Required
  * `action` (`add` or `remove`) - Required

#### Logic Pipeline
1. **Permission Check:** Verify executor is Guild Owner or holds a role in `config.json`.
2. **Bot Permission Check:** Verify bot has `ManageRoles` permission.
3. **Hierarchy Checks:**
   * Reject if `role.position >= executor.roles.highest.position` (unless Server Owner).
   * Reject if `targetMember.roles.highest.position >= executor.roles.highest.position` (unless Server Owner).
   * Reject if `role.position >= botMember.roles.highest.position`.
   * Reject if `role.managed` is `true` (bot integration / managed roles).
4. **Execution:** Modify roles using `targetMember.roles.add(role)` or `targetMember.roles.remove(role)`.
5. **Response:** Return clear success/error embeds with user and role tags.

---

### Phase 5: AFK Engine (`afk` & `messageCreate` Listener)

#### Setup & Persistence
* Use `quick.db` to persist AFK states across bot restarts.
* Data schema per user: `afk_<guildId>_<userId> = { status: true, reason: string, timestamp: number }`.

#### `/afk` Slash Command
* **Parameters:** `reason` (Optional, defaults to `"AFK"`).
* **Behavior:** Saves user AFK state to `quick.db`.
* **Response:** Sends response confirming AFK state activated.
* **Optional Nickname Sync:** Prepend `[AFK]` to display name if bot has `ManageNicknames` and user role is below bot position.

#### `messageCreate` Event Handler (Dual-Logic Processing)
1. **AFK User Activity Check:**
   * Check if message author has active AFK record in `quick.db`.
   * If active:
     * Delete AFK status from database.
     * Restore original nickname if modified.
     * Send brief confirmation message: `"Welcome back <user>, I removed your AFK state."` (Auto-delete response after 5 seconds to reduce chat spam).
2. **Mention Check:**
   * Filter message `mentions.members`.
   * For each mentioned member, query `quick.db` for active AFK record.
   * If any mentioned member is AFK, reply with an embed detailing the user, reason, and elapsed time since AFK activation.

---

## 6. Development Rules for AI & Developers

1. **No Incremental Placeholders:** Every command file must contain complete, fully functional code complete with try/catch error wrapping and permission checks.
2. **Validation First:** Perform all role checks, bot permission checks, and database validation prior to executing state changes.
3. **User Feedback:** Every slash command interaction must acknowledge the interaction using `interaction.reply()` or `interaction.deferReply()` within 3 seconds to avoid Discord API timeouts.
4. **Security Isolation:** Keep sensitive operational configurations (`allowedRoleIds`) in `config.json` and authentication details in `.env`. Never hardcode secrets.