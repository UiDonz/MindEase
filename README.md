# MindEase: AI Mental Wellness Companion

MindEase is a full-stack web app that combines AI conversation with **mood tracking**, **CBT thought records**, and **data-driven insights**. Unlike a general chatbot, it remembers how the user has actually been doing and uses that data to personalize every response.



> ⚠️ MindEase is a self-help tool and **not** a replacement for professional mental health care. If you are in crisis, call or text **988** (US).

---

## Features

### Accounts & security
- **Sign up / sign in** with username + email + password (you can sign in with either username or email)
- Passwords hashed with **bcrypt** (12 salt rounds); the plain password is never stored
- **Persistent sessions** stored in PostgreSQL (`connect-pg-simple`), so users stay logged in through server restarts
- Session cookies are `httpOnly`, `sameSite=lax`, and `secure` in production
- Session ID is regenerated on login (prevents session fixation)
- **Rate limiting** on auth routes (10 attempts / 15 min) and AI routes (20 requests / min per user)
- **Helmet** security headers and a strict Content-Security-Policy (no inline scripts)
- Every SQL query is **parameterized** (prevents SQL injection); all AI/user text is HTML-escaped before rendering (prevents XSS)
- JSON-only API for state-changing requests (basic CSRF protection)
- Users can **delete their account and all data** (password confirmation required)

### Main app (only reachable after sign-in)
| Page | What it does |
|---|---|
| **Home dashboard** | 7-day average mood with week-over-week change, check-in streak, totals, a 30-day mood & energy line chart (hand-drawn SVG), top emotions, and the user's most common thinking traps |
| **Talk** | Multi-session chat with the AI companion. Each reply comes with **emotions detected** in the user's message, an optional **coping exercise card**, and a **risk level**. Replies are personalized with the user's recent check-ins and thinking-trap history |
| **Check-in** | Daily mood (1–10), energy (1–10), sleep hours, emotion tags, and a note. History list with color-coded mood badges |
| **Thoughts** (CBT thought record) | User describes a situation, their automatic thought, and the emotion's intensity. Gemini returns the **cognitive distortions** found (from 12 standard CBT categories), **evidence for/against**, a **balanced thought**, reflection questions, and an estimated intensity after reframing, shown as before/after bars |
| **Insights** | Gemini analyzes the last 14 days of check-ins, thought records, and chat emotions, and returns a summary, mood trend, patterns, wins, and suggestions |
| **Account** | Profile info, sign out, delete account |

### Safety layer
- A **keyword crisis screen** runs on every message, check-in note, and thought record, *before* the AI is called (so it works even if the API is down)
- Gemini also rates every chat message's `risk_level` (`none` / `low` / `elevated` / `crisis`); the app uses whichever is more serious
- Elevated or crisis risk shows a banner with **988**, **Crisis Text Line**, and emergency resources. A "Need help now?" button is always visible

### Responsive design
- Desktop: sidebar navigation. Mobile (<820px): bottom tab bar, compact header, and a session dropdown in chat
- Accessible: semantic labels, keyboard focus styles, `aria-live` chat region, and support for reduced motion

---

## Why this isn't "just a ChatGPT wrapper"

| General AI chat | MindEase |
|---|---|
| Forgets you between chats | Every reply is grounded in your stored mood history and recurring thinking traps |
| Free-form text only | **Structured JSON** responses turned into UI: emotion chips, exercise cards, distortion cards, intensity bars, trend badges |
| No tracking | Mood/energy/sleep tracking with charts, streaks, and week-over-week comparison |
| No method | Implements a real CBT exercise (thought records) and saves the results |
| Pattern-finding is up to you | AI insights computed across 14 days of *your* data |
| Safety depends on the model | Independent keyword screen + model risk rating, with resources surfaced in the UI |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (custom, no framework), vanilla JavaScript |
| Backend | Node.js 18+, Express 5 |
| Database | PostgreSQL (hosted on Neon for production) |
| AI API | **Google Gemini API** via the official `@google/genai` SDK (model: `gemini-flash-latest`, configurable) |
| Auth | `bcryptjs`, `express-session`, `connect-pg-simple` |
| Security | `helmet`, `express-rate-limit` |
| Hosting | Render (free web service) + Neon (free Postgres) |

---

## Project structure

```
mindease/
├── server.js              # Express app: security, sessions, routes, error handler
├── db.js                  # Postgres pool + runs schema.sql on startup
├── schema.sql             # Database schema
├── middleware/
│   └── auth.js            # requireAuthApi / requireAuthPage / redirectIfAuthed
├── routes/
│   ├── auth.js            # signup, signin, signout, me, delete account
│   └── api.js             # conversations, messages, check-ins, thoughts, stats, insights
├── services/
│   ├── gemini.js          # All Gemini calls, JSON schemas, response validation
│   └── safety.js          # Crisis keyword screen + resources
├── public/
│   ├── index.html         # Landing page
│   ├── signup.html / signin.html
│   ├── app.html           # Main app (single page with multiple views)
│   ├── css/styles.css
│   └── js/
│       ├── common.js      # fetch wrapper, HTML escaping, toasts
│       ├── auth.js        # sign-up / sign-in form logic
│       ├── chart.js       # SVG mood chart
│       ├── app.js         # main app logic
│       └── landing.js
├── .env.example
├── render.yaml
└── package.json
```

---

## Database schema

```
users ─┬──< conversations ──< messages
       ├──< mood_checkins
       └──< thought_records
session  (managed by connect-pg-simple)
```

**users**
| Column | Type | Notes |
|---|---|---|
| id | SERIAL | Primary key |
| username | VARCHAR(30) | Unique |
| email | VARCHAR(255) | Unique, stored lowercase |
| password_hash | TEXT | bcrypt hash |
| created_at | TIMESTAMPTZ | Default `NOW()` |

**conversations**: `id`, `user_id → users.id`, `title`, `created_at`, `updated_at`

**messages**
| Column | Type | Notes |
|---|---|---|
| id | SERIAL | |
| conversation_id | INTEGER | FK → conversations |
| role | VARCHAR(10) | `'user'` or `'model'` |
| content | TEXT | |
| emotions | TEXT[] | Emotions Gemini detected in the user message |
| exercise | JSONB | `{ name, steps[] }` or null |
| risk_level | VARCHAR(10) | none / low / elevated / crisis |
| created_at | TIMESTAMPTZ | |

**mood_checkins**: `id`, `user_id`, `mood` (1–10), `energy` (1–10), `sleep_hours` (0–24, nullable), `emotions TEXT[]`, `note`, `created_at`

**thought_records**: `id`, `user_id`, `situation`, `automatic_thought`, `emotion`, `intensity_before` (0–100), `analysis JSONB` (parsed Gemini output), `created_at`

**session**: `sid`, `sess JSON`, `expire` (used for login sessions)

All child tables use `ON DELETE CASCADE`, so deleting a user removes all their data. The full SQL is in [`schema.sql`](schema.sql) and runs automatically when the server starts.

---

## How the Gemini integration works

All AI calls are in `services/gemini.js`:

1. **Structured output.** Each request sets `responseMimeType: 'application/json'` and a `responseSchema`, so Gemini must reply with JSON in an exact shape (e.g. `{ reply, emotions[], risk_level, suggested_exercise }`).
2. **Parsing & validation.** The JSON is parsed, and every field is checked: strings are trimmed and length-limited, arrays capped, enums verified (e.g. distortions must be one of the 12 allowed names), numbers clamped to valid ranges. Bad or missing fields fall back to safe defaults.
3. **Error handling.**
   - Missing API key → `503` "AI service is not configured"
   - Rate limited by Google (`429`) → friendly "wait a minute" message
   - Empty response (Gemini safety block) → "try rephrasing"
   - Network/5xx/invalid JSON → retried once, then `502` with a friendly message
   - On the frontend, a failed chat message is removed and the text is put back in the input so nothing is lost
4. **Personalization.** Before each chat call, the server builds context from the user's last 5 check-ins and their most frequent cognitive distortions, then adds it to Gemini's system instruction.

---

## API endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | — | Create account `{username, email, password}` |
| POST | `/api/auth/signin` | — | Sign in `{identifier, password}` |
| POST | `/api/auth/signout` | ✓ | Sign out |
| GET | `/api/auth/me` | ✓ | Current user |
| DELETE | `/api/auth/account` | ✓ | Delete account `{password}` |
| GET / POST | `/api/conversations` | ✓ | List / create chat sessions |
| GET | `/api/conversations/:id/messages` | ✓ | Messages in a session |
| POST | `/api/conversations/:id/messages` | ✓ | Send message → Gemini reply |
| DELETE | `/api/conversations/:id` | ✓ | Delete session |
| GET / POST | `/api/checkins` | ✓ | List (`?days=30`) / create check-in |
| GET / POST | `/api/thoughts` | ✓ | List / create thought record (Gemini analysis) |
| DELETE | `/api/thoughts/:id` | ✓ | Delete thought record |
| GET | `/api/stats` | ✓ | Dashboard numbers (`?tz=` for streaks) |
| GET | `/api/insights` | ✓ | Gemini insights from last 14 days |
| GET | `/health` | — | Health check for hosting |

---

## Running locally

**Requirements:** Node.js 18+, a PostgreSQL database (a free Neon database works from your laptop too), and a Gemini API key.

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
#    then edit .env: set DATABASE_URL, SESSION_SECRET, GEMINI_API_KEY

# 3. Start the server (tables are created automatically)
npm start          # or: npm run dev  (auto-restarts on file changes)

# 4. Open http://localhost:3000
```

**Get a Gemini API key:** go to [Google AI Studio](https://aistudio.google.com/apikey), sign in, and click **Create API key**. No card is needed.

**Testing without a key:** set `MOCK_AI=true` in `.env` to get placeholder AI responses.

**Model not found?** Model names change over time. List the models available to your key:
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"
```
Then set `GEMINI_MODEL` in `.env` to one of the "flash" models.

---

## Deployment (free, no card)

### 1. Database: Neon
1. Sign up at [neon.tech](https://neon.tech) (GitHub login works, no card).
2. Create a project and copy the **connection string**. It looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`.

### 2. Code: GitHub
Push this folder to a GitHub repo. `.gitignore` already keeps `.env` and `node_modules` out.

### 3. Server: Render
1. Sign up at [render.com](https://render.com) with GitHub, then choose **New → Web Service** and pick your repo.
2. Settings: **Runtime** Node, **Build command** `npm install`, **Start command** `npm start`, **Instance type** Free.
3. Add these **environment variables**:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = your Neon connection string
   - `SESSION_SECRET` = a long random string
   - `GEMINI_API_KEY` = your key
4. Click **Deploy**. When it's live, put the URL at the top of this README.

> Render's free instances sleep when idle, so the first visit after a while can take up to about a minute to load.

---

## Author
Donovin Bermudez
