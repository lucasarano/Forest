# Forest

Forest is a guided-learning web app where students work through teacher-authored concepts with an AI tutor that explicitly tracks them across four learning phases (Explanation → Causality → Transfer → Recall), branches into prerequisites when understanding is shaky, and surfaces per-session analytics to teachers.

## Stack

- **Frontend**: React 18 + Vite + Tailwind (SPA, responsive for desktop and mobile).
- **Backend**: Node.js (Express) at `server/`, stateless — session state lives in Supabase.
- **Database**: Supabase (Postgres) with Supabase Auth.
- **AI**: OpenAI via `src/lib/tutor`, centralised in `src/lib/tutor/constants.js` (`DEFAULT_MODEL = 'gpt-5.4-mini'`).
- **Deployment**: Vercel (frontend), Render (backend), Supabase (DB + auth).

## Repo layout

```
src/
  pages/              Home, Login, Learn, TeacherDashboard, OpsDashboard, AuthCallback
  components/         Reusable UI
  hooks/              useTabVisibility, etc.
  lib/
    api.js            Client-side fetch wrappers for the backend
    auth.jsx          Supabase auth context
    supabase.js       Supabase client
    tutor/
      runtime.js      Turn orchestration (runTurn)
      ai.js           OpenAI wrapper
      state.js        Session state shape + logEvent
      constants.js    PHASES, DEFAULT_MODEL, thresholds
      layout.js       Concept-graph layout
      agents/         Non-phase-specific agents
        intentClassifier.js, phaseRouter.js, recallScheduler.js,
        returnManager.js, subtopicInference.js
      phases/         Phase-specific orchestration + prompts
        explanation.js, causality.js, transfer.js, recall.js
server/
  server.js           Express routes (tutor, teacher, ops, auth)
  db.js               Supabase service-role client
  teacherAnalytics.js Dashboard metric aggregation
  loadEnv.js          Local .env loader
supabase/
  migrations/         Schema (profiles, courses, homeworks, concepts,
                      tutor_sessions, tutor_events)
  functions/          Edge functions
scripts/
  dev-all.sh          Start frontend + backend together
```

## Install

```bash
npm install
```

## Local development

Copy `.env.example` to `.env` and fill in values.

**Frontend (`VITE_*`)**
- `VITE_SERVER_URL` — e.g. `http://localhost:4001/api`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ADMIN_PASSWORD` — unlocks the Teacher and Ops dashboards in dev

**Backend**
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MVP_ADMIN_PASSWORD` — must match `VITE_ADMIN_PASSWORD`
- `ALLOWED_ORIGINS` — comma-separated list of dev/prod origins

Run:

```bash
npm run dev        # frontend on 5173
npm run server     # backend on 4001
npm run dev:all    # both, via scripts/dev-all.sh
```

## Production

- **Vercel** (frontend): set `VITE_SERVER_URL` to the Render backend URL and the Supabase + admin vars above. Do **not** set `VITE_OPENAI_API_KEY` in Vercel — the key lives on the backend only.
- **Render** (backend): runs `node server/server.js`. Set all backend env vars plus `NODE_ENV=production`.
- **Supabase** is the source of truth for sessions, events, and the course/homework/concept catalog.

## Dashboards

- `/learn` — student tutoring UI.
- `/teacher` — teacher dashboard: per-course/homework/concept mastery, nodes (prerequisite branches), students, misconceptions, engagement (tab-away, speech share). Password-gated.
- `/ops` — operations dashboard: session counts, completion rate, event-type breakdown, data-integrity checks, recent events. Password-gated.

## Deployment files

- `Dockerfile` — Render backend container
- `render.yaml` — Render service blueprint
- `vercel.json` — Vite SPA on Vercel
- `supabase/migrations/*` — schema required by the backend
