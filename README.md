## Faasley Discord Bot Project
This is a modern utility and multi-functional bot for server management.

Moderation (warn, timeout, kick, ban), channel lockdown, AFK, broadcasts, and separate chat and voice leveling. Every command works as a slash command (`/rank`) or with a prefix (`?rank`). See [guide.md](guide.md) for the full specification.

---

## Local Development

Requires **Node.js 22+**.

```bash
npm install
cp .env.example .env      # then fill in BOT_TOKEN and CLIENT_ID
npm run deploy            # register slash commands (or: npm run deploy:guild -- <serverId>)
npm start
```

Without `MONGODB_URI`, data is stored in a local `json.sqlite` file.

---

## Deploying to Render (free)

The bot runs as a free Render **Web Service** with its data in a free **MongoDB Atlas** database. Render's disk is wiped on every deploy, so a local database file would lose all XP, warnings and settings.

### 1. Create the database (MongoDB Atlas, free)
1. Sign up at <https://www.mongodb.com/cloud/atlas> and create a free **M0** cluster.
2. **Database Access** → add a user with a password (letters and numbers only avoids URL-escaping issues).
3. **Network Access** → *Add IP Address* → **Allow access from anywhere** (`0.0.0.0/0`). Render's IP addresses change, so this is required.
4. **Connect** → *Drivers* → copy the connection string and put your password in it. Add a database name before the `?`, e.g.
   `mongodb+srv://bot:PASSWORD@cluster0.abcde.mongodb.net/faasle?retryWrites=true&w=majority`

### 2. Create the Render service
1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo. Render reads [`render.yaml`](render.yaml) and asks for:
   | Variable | Value |
   |---|---|
   | `BOT_TOKEN` | Discord Developer Portal → Bot → token |
   | `CLIENT_ID` | Discord Developer Portal → General Information → Application ID |
   | `MONGODB_URI` | The Atlas connection string from step 1 |
3. Apply. The build runs `npm ci && npm run deploy` (installs and registers slash commands), then starts the bot. The logs should show `Connected to MongoDB` and `Logged in as …`.

> Already created the service by hand? Open it in Render and check **Settings**: Runtime *Node*, Build Command `npm ci && npm run deploy`, Start Command `npm start`, Health Check Path `/health`, and the three environment variables above plus `NODE_VERSION = 22`.

### 3. Keep it awake (free tier)
Free web services sleep after ~15 minutes without web traffic, which takes the bot offline.
1. Sign up at <https://uptimerobot.com> (free).
2. Add an **HTTP(s)** monitor for your Render URL (e.g. `https://faasle-discord-bot.onrender.com/`) every **5 minutes**.

Render's free tier includes 750 hours a month, enough for one service running 24/7.

### After that
Every push to the connected branch redeploys automatically and re-syncs slash commands.

### Invite link
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=1099914365958
```
In the Developer Portal → Bot, enable the **Server Members** and **Message Content** privileged intents.
