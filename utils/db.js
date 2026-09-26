const { QuickDB, MongoDriver } = require('quick.db');

// ── Shared Database ────────────────────────────────────────────────────────
// Every module imports this one wrapper, so there is a single connection.
//
//  • MONGODB_URI set  → MongoDB (production, e.g. MongoDB Atlas). Hosts like
//                       Render wipe the local disk on every deploy/restart,
//                       so data must live in an external database.
//  • MONGODB_URI unset → local SQLite file json.sqlite (development).
//
// With MongoDB the driver must connect before quick.db is created, so
// index.js calls `await db.connect()` before logging in. SQLite is created
// lazily on first use, so scripts and tests work without calling connect().
//
// Key conventions (main table):
//   afk_<guildId>_<userId>           →  AFK record          (utils/afk.js)
//   prefix_<guildId>                 →  custom prefix       (utils/guildConfig.js)
//   broadcast_last_<guildId>         →  last broadcast ts   (utils/guildConfig.js)
//   warnlimit_<guildId>              →  auto-kick limit     (utils/guildConfig.js)
//   warns_<guildId>_<userId>         →  warning list        (utils/warnings.js)
//   lockdown_<channelId>_<kind>      →  overwrite snapshot  (utils/lockdown.js)
//   xpchannels_<guildId>             →  XP channel rules    (utils/levels.js)
//
// "levels" table (kept separate because leaderboards scan every row in it):
//   xp_<guildId>_<userId>            →  { chatXp, voiceXp, voiceMinutes }

let root = null;
const tables = new Map();

function instance(table) {
  if (!root) {
    if (process.env.MONGODB_URI) {
      throw new Error('Database is not connected yet — call db.connect() first.');
    }
    root = new QuickDB(); // local SQLite: json.sqlite
  }
  if (!table) return root;
  if (!tables.has(table)) tables.set(table, root.table(table));
  return tables.get(table);
}

/**
 * The subset of the QuickDB API the bot uses, bound to one table.
 *
 * @param {string|null} table  null = the main table
 */
function wrap(table) {
  return {
    get: (key) => instance(table).get(key),
    set: (key, value) => instance(table).set(key, value),
    has: (key) => instance(table).has(key),
    delete: (key) => instance(table).delete(key),
    startsWith: (query) => instance(table).startsWith(query),
  };
}

const db = wrap(null);

/**
 * Returns a wrapper for a separate table (a MongoDB collection or SQLite table).
 *
 * @param {string} name
 */
db.table = (name) => wrap(name);

/**
 * Connects to the configured database. Call once at startup, before login.
 */
db.connect = async () => {
  if (root) return;

  if (process.env.MONGODB_URI) {
    const driver = new MongoDriver(process.env.MONGODB_URI);
    await driver.connect();
    root = new QuickDB({ driver });
    await root.init();
    console.log('[Database] ✅  Connected to MongoDB.');
  } else {
    root = new QuickDB();
    await root.init();
    console.log('[Database] ✅  Using local SQLite (json.sqlite). Set MONGODB_URI for production.');
  }
};

module.exports = db;
