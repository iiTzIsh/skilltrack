# SkillTrack

A simple app for tracking what you want to learn, what you're learning, and what you've learned. It includes roadmap.sh-style visual roadmaps, notes, files, and a **Claude connector**, so Claude can create and edit your roadmaps from any chat with no API key.

**Tech:** React + TypeScript + Vite + Tailwind CSS · Supabase (auth, Postgres, realtime, storage) · Vercel (hosting + MCP serverless function)

## Features
- **Roadmaps (Map view)**: main topics run down a centre line with subtopics branching off both sides. Click a box for its details panel, or right-click it to mark it done
- **Subtopic status**: Pending / Learning / Done / Skip, with notes (Markdown) and resource links
- **Explore**: 8 ready-made roadmaps (Data Analyst, Data Scientist, Frontend, Backend, Python, SQL, Power BI, Git)
- **Board**: To learn / Learning / Learned columns with drag and drop
- **Topic pages**: subtopics, notes, files (preview PDF, Word, images, CSV, code), links, target date, priority
- **Notes**: pin them, link them to topics, attach files
- **Search** (`/` or `Ctrl+K`), dark mode, backup export/import
- **Sync**: sign in on any device. It can be installed on a phone as an app (Add to Home screen)
- **Claude connector**: Claude can list, create and edit roadmaps, topics, subtopics and notes, and read your progress

The same code also runs in two other ways:
- **Offline**: build without Supabase variables and open `dist/index.html` directly. Data stays in that browser.
- **Inside claude.ai** as an artifact

## Deploy (free)

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste [`supabase/setup.sql`](supabase/setup.sql) → **Run**.
3. **Authentication → Sign In / Providers → Email**: turn off **Confirm email**.
4. **Project Settings → API**: copy the **Project URL**, the **anon public** key and the **service_role** key.

### 2. Vercel
1. [vercel.com/new](https://vercel.com/new) → import this GitHub repo. Vercel detects the framework (Vite) automatically.
2. Add **Environment Variables**:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (**secret**) |
| `MCP_SECRET` | a long random text (see the app's Settings page) |

3. **Deploy**.

### 3. Create your account
Open the site → **Create an account**. Then in Supabase go to **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**, so nobody else can register.

> Optional: add `OWNER_USER_ID` (shown in the app's Settings) in Vercel and redeploy. If it isn't set, the connector uses the only user in the project.

### 4. Connect Claude
Claude → **Settings → Connectors → Add custom connector**
- Name: `SkillTrack`
- URL: `https://YOUR-SITE.vercel.app/mcp/YOUR_MCP_SECRET`

Then try something like: *"Create a beginner Docker roadmap in my SkillTrack"* or *"What should I learn next?"*

**Connector tools:** `list_roadmaps`, `get_roadmap`, `get_topic_details`, `get_progress`, `search`, `create_roadmap`, `update_roadmap`, `delete_roadmap`, `add_topics`, `update_topic`, `move_topic`, `delete_topic`, `add_subtopics`, `update_subtopic`, `delete_subtopics`, `list_notes`, `get_note`, `save_note`, `delete_note`

## Develop
```bash
npm install
cp .env.example .env.local   # fill in values (optional; without them the app runs in offline mode)
npm run dev                  # http://localhost:5173
npm run typecheck
npm run build
```

## Security notes
- Row Level Security limits each signed-in user to their own rows and files.
- The connector URL contains your `MCP_SECRET`, so treat it like a password. To revoke it, change `MCP_SECRET` in Vercel and redeploy.
- Never put the `service_role` key in the frontend or in Git. It lives only in Vercel's environment variables.
