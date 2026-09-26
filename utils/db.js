const { QuickDB } = require('quick.db');

// ── Shared Database Instance ───────────────────────────────────────────────
// Every module imports this single instance so only one SQLite connection
// (json.sqlite) is ever opened.
//
// Key conventions:
//   afk_<guildId>_<userId>           →  AFK record          (utils/afk.js)
//   prefix_<guildId>                 →  custom prefix       (utils/guildConfig.js)
//   broadcast_last_<guildId>         →  last broadcast ts   (utils/guildConfig.js)
//   warnlimit_<guildId>              →  auto-kick limit     (utils/guildConfig.js)
//   warns_<guildId>_<userId>         →  warning list        (utils/warnings.js)
//   xp_<guildId>_<userId>            →  { chatXp, voiceXp, voiceMinutes }  (utils/levels.js)
//   xpchannels_<guildId>             →  XP channel rules    (utils/levels.js)
//   lockdown_<channelId>_<kind>      →  overwrite snapshot  (utils/lockdown.js)
module.exports = new QuickDB();
