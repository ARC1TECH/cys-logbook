# Cy's Logbook — Deployment Guide

A story companion for Captain Silas Pike. This guide walks through getting the app live on the internet, accessible from any device, with all the AI features working.

**Total time: about 60 minutes the first time, mostly waiting for things to load.**

You'll need to make accounts on three free services. None require a credit card unless you blow past their (very generous) free tiers, which won't happen for a personal D&D app.

---

## What you're building

- A real URL (something like `cys-logbook.vercel.app`) you can bookmark on any device
- A cloud database that syncs all your data (NPCs, threads, recaps, log) across phone and laptop
- The "Ask the Tide" feature, working with your own Anthropic API key
- A "Recap" feature where you paste session notes and Claude turns them into a polished summary plus suggested updates
- An "Export for Project" link that gives you fresh markdown to upload to your Claude Project

---

## What you'll need

1. **An Anthropic API key** — you mentioned you have $50 in credits, so you're set
2. **A GitHub account** (free) — where the code lives
3. **A Supabase account** (free) — your cloud database
4. **A Vercel account** (free) — what hosts the app

Have a text editor handy. Anything works — even Notepad — but **VS Code** ([free download](https://code.visualstudio.com/)) is what I'd recommend if you don't already have one. It makes the file viewing easier.

---

## Step 1: Set up GitHub (5 minutes)

GitHub is where your code lives so Vercel can read it.

1. Go to **github.com** and create an account if you don't have one. Pick any username — this won't be public-facing for our purposes.
2. Once logged in, click the **"+"** in the top-right corner → **New repository**.
3. Name it `cys-logbook`. Leave it **Public** (this is fine — there are no secrets in the code itself; secrets go elsewhere).
4. Don't add a README, .gitignore, or license — we already have those.
5. Click **Create repository**.

GitHub will now show you a page with a bunch of git commands. **Ignore them.** We'll upload files through the web interface, no command line needed.

On that same page, click **"uploading an existing file"** (it's a link in the middle of the page).

You'll land on an upload page. Now drag the entire contents of the `cys-logbook` folder I gave you into the upload area. **Drag the files inside the folder, not the folder itself.** It should accept everything: `package.json`, `vercel.json`, `.gitignore`, the `api/` folder, the `public/` folder, the `supabase-schema.sql`, and `.env.example`.

Scroll down. In the **"Commit changes"** section, leave the default message and click the green **Commit changes** button.

Wait a few seconds. Your repository now has all the files. ✅

---

## Step 2: Set up Supabase (15 minutes)

Supabase is your cloud database. Free tier is more than enough for this.

### Create the project

1. Go to **supabase.com** and click **Start your project**.
2. Sign in with GitHub (easiest). Authorize it.
3. You'll land on a dashboard. Click **New Project**.
4. **Organization:** Use the personal one it gives you.
5. **Project name:** `cys-logbook` (or anything you like)
6. **Database password:** Click **Generate a password** and **save it somewhere safe** (password manager, notes app — you might need it later, though probably not). The app uses different keys, but Supabase wants this for the underlying database.
7. **Region:** Pick the one closest to you geographically.
8. **Plan:** Free.
9. Click **Create new project**.

It'll take 1–2 minutes to provision. Wait. Make tea.

### Set up the tables

Once the project is ready, you'll see a sidebar on the left.

1. Click the **SQL Editor** icon (looks like a database/console icon).
2. Click **+ New query** at the top.
3. Open the file `supabase-schema.sql` from the package I gave you. Copy its **entire contents**.
4. Paste into the SQL Editor.
5. Click the green **Run** button (or press Ctrl+Enter / Cmd+Enter).

You should see "Success. No rows returned" (that's normal — we're creating tables, not querying them).

Verify it worked: in the left sidebar, click **Table Editor**. You should see six tables: `npcs`, `threads`, `factions`, `log_entries`, `recaps`, and `character_data`. Click `npcs` — you should see Cy's starting cast (Douglas Barker, Eda, Anders, Hanna, the Snapping Line). ✅

### Grab your API keys

1. In the left sidebar, click **Project Settings** (gear icon at the bottom).
2. Click **API** in the inner menu.
3. You'll see two values you need to **copy and save somewhere temporary** (a notes app):
   - **Project URL** — looks like `https://something.supabase.co`
   - **anon / public** key — a long string starting with `eyJ...`

These are the credentials Vercel will use to talk to your database. Keep this tab open or paste them somewhere — you'll need them in the next step.

---

## Step 3: Deploy to Vercel (15 minutes)

Vercel takes the code from GitHub and turns it into a live website.

1. Go to **vercel.com** and click **Sign Up**.
2. Sign up with GitHub. Authorize it.
3. On the Vercel dashboard, click **Add New** → **Project**.
4. You'll see a list of your GitHub repositories. Find `cys-logbook` and click **Import**.
5. **Configure Project** screen — most of this is fine to leave alone:
   - **Framework Preset:** Should auto-detect as "Other" — that's correct.
   - **Root Directory:** Leave as `./`
   - **Build and Output Settings:** Leave defaults
6. **Environment Variables** — this is the important part. Click to expand it. Add these, one at a time:

   **Required:**

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | Your key from console.anthropic.com (starts with `sk-ant-`) |
   | `SUPABASE_URL` | The Project URL you saved from Supabase |
   | `SUPABASE_ANON_KEY` | The anon key from Supabase |

   **Recommended (cost protection):**

   | Name | Value |
   |---|---|
   | `APP_SECRET` | Any random string, 20+ characters. Generate one at [random.org/strings](https://www.random.org/strings/) or just smash the keyboard. |
   | `DAILY_SPEND_CEILING_USD` | `2.00` (or whatever max daily spend you want — $2 is more than enough for any normal session) |

   For each: type the name on the left, paste the value on the right, click **Add**.

   **What these do:**
   - `APP_SECRET` blocks random API scrapers from hitting your endpoints. Without it, anyone who finds your URL could potentially run up calls. With it, only your frontend can.
   - `DAILY_SPEND_CEILING_USD` is a hard stop. If today's API spend hits this number, all AI features stop responding until midnight UTC. Cheap insurance against bugs or abuse.

7. Click **Deploy**.

Vercel will spend 1–2 minutes building and deploying. You'll see logs scrolling. When it finishes, you'll get a celebration screen with a URL like `cys-logbook-xyz.vercel.app`.

**Click the URL.** Cy's Logbook should load. The status bar at the top should say "Synced" with a green dot. The Folk and Threads tabs should show the seeded data. ✅

---

## Step 4: Test the AI features (5 minutes)

### Ask the Tide

1. Click the **Ask the Tide** tab.
2. Type a scene: `Eda Oweland walks into the Snapping Line during my shift. First time in a decade. She sits at the end of the bar without looking at me.`
3. Click **Ask the Tide**.
4. Wait a few seconds. Three response options should appear, each in Cy's voice.

If it works → 🎉 you're done with setup.

If it fails with "The tide pulled back": open your browser's developer console (right-click → Inspect → Console tab). Look for the error. The most likely culprit is a typo in `ANTHROPIC_API_KEY`. To fix:
- Go back to Vercel, your project, **Settings** → **Environment Variables**
- Find the wrong key, click the three-dot menu, **Edit**, paste the correct value, save
- Click **Deployments** in the top nav, click the three dots on the latest deployment, **Redeploy**

### Recap

1. Click the **Recaps** tab.
2. Type some fake notes: `Met the rest of the party at the Snapping Line. Half-elf ranger, halfling cleric, dwarf wizard. Hanna let us use the back room. They're hunting for a missing trader. I told them I'd help row out to the wreck site if needed. Compass felt heavier than usual when they asked about fog.`
3. Set Session # to `1`, today's date.
4. Click **Distill the Session**.
5. Wait. You'll get a polished recap, highlights, and suggested updates (probably new NPCs for the party members, a new thread for the missing trader, maybe a thread change for the compass).
6. Tick the boxes for what you want to apply, click **Save Recap & Apply Selected**.

✅ Everything's wired up.

---

## Step 5: Bookmark and use

- **On your computer:** Bookmark the Vercel URL.
- **On your phone:** Open the URL in Safari/Chrome → Share → "Add to Home Screen". You'll get an icon that opens the app fullscreen, like a real app.

Whatever device you use, the data is the same. Make a change on your laptop, see it on your phone seconds later.

---

## How this connects to your Claude Project

The companion is for during-session use — quick reference, asking the tide, logging quick notes, processing recaps.

The Project is for between-session work — deep character conversations, planning, processing what happened.

To keep your Project's knowledge current:

1. After a session, distill it in the Recap tab.
2. Click the **Export for Project** link in the status bar (top of every page). It downloads/opens a markdown file with all your current data.
3. Copy that markdown.
4. In your Claude Project, find your `cy-character-context.md` file in the project knowledge, replace its contents with the new markdown, save.

Or even simpler: paste the markdown into a chat in your Project and say "use this as the latest context." Claude will roll with it.

---

## Customizing later

Want to tweak how Cy's voice sounds in Ask the Tide? Edit `api/ask-tide.js`, find the `SYSTEM_PROMPT_TEMPLATE` section, adjust the language. Commit the change to GitHub (use the web UI: navigate to the file, click the pencil icon, edit, commit). Vercel auto-redeploys in 30 seconds.

Want to add new tabs or features? Edit `public/index.html` the same way.

Want to change the AI model? Find `claude-sonnet-4-20250514` in the API files and swap it for a different model name.

If something breaks: Vercel's **Deployments** tab shows logs. Supabase's **Logs** section shows database errors. Most issues are typos in environment variables.

---

## Costs

- **GitHub:** Free, unlimited
- **Supabase:** Free tier — 500MB database, 5GB bandwidth/month. You won't come close.
- **Vercel:** Free tier — 100GB bandwidth/month. You won't come close.
- **Anthropic API:** ~$0.01–$0.02 per "Ask the Tide" call (with prompt caching enabled, repeat calls within 5 minutes are ~80% cheaper). At 30 asks per session, that's roughly $0.40–$0.60 per session. Recaps run ~$0.05 each. Your $50 in credits will outlast the campaign.

### Cost protections built in

The app has four layers of protection so you can't accidentally burn through credits:

1. **Prompt caching** — Cy's character description (the largest part of every prompt) is cached. Subsequent calls within 5 minutes pay 90% less for that portion.
2. **Daily spend ceiling** — set with the `DAILY_SPEND_CEILING_USD` env var. If today's spend hits the ceiling, all AI features return an error until midnight UTC. Default $2/day.
3. **Per-IP rate limiting** — max 30 "Ask the Tide" calls per hour, max 5 recaps per hour, per IP. Stops runaway loops cold.
4. **Shared-secret auth** — set with `APP_SECRET`. Only requests carrying this header are processed. Random scanners and scrapers can't trigger calls.

### Watching your spend

The status bar at the top of the app shows today's running spend (e.g. `$0.14 / $2.00 today`). Color shifts to amber over 50%, red over 80%. If you ever see numbers climbing fast, something's off — open Vercel logs to investigate.

You can also check usage directly:
- **Anthropic console** ([console.anthropic.com](https://console.anthropic.com) → Usage) — official source of truth
- **In the app** — `/api/usage` endpoint returns today's and this month's totals as JSON

---

## If you get stuck

The most common failure modes, in order of likelihood:

1. **Status bar says "Config not loaded"** → environment variables not set in Vercel, or names are typo'd. Check Settings → Environment Variables. Names must match exactly: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

2. **"Ask the Tide" returns "The tide pulled back"** → Anthropic key is wrong, or you're out of credits. Test the key at console.anthropic.com.

3. **Folk / Threads tabs say "Loading..." forever** → Supabase tables didn't get created. Re-run the SQL schema. Or RLS policies blocking access — re-run the schema, it includes the policies.

4. **You changed something and now it's broken** → Vercel keeps a history of deployments. Click **Deployments**, find the last working one, click "..." → **Promote to Production**. You're back online instantly.

---

That's it. Welcome to the campaign.
