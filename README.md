# Forest

Sprint 4 guided-learning frontend on Vercel, with a stateless Node/LangGraph backend designed to run on Render and persist session state in Supabase.

## Install

```bash
npm install
```

## Local development

Copy `.env.example` to `.env`, then set the frontend and backend variables you need.

Frontend:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SPRINT4_SERVER_URL=http://localhost:4001/api/sprint4`
- `VITE_APP_MODE=full`

Backend:
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MVP_ADMIN_PASSWORD`
- `ALLOWED_ORIGINS`

Run the frontend:

```bash
npm run dev
```

Run the Sprint 4 backend:

```bash
npm run sprint4:server
```

## Production rollout

Vercel frontend env vars:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SPRINT4_SERVER_URL=https://<render-service-domain>/api/sprint4`
- `VITE_APP_MODE=sprint4`

Render backend env vars:
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MVP_ADMIN_PASSWORD`
- `ALLOWED_ORIGINS`
- `NODE_ENV=production`

Production notes:
- Vercel production is Sprint-4-only when `VITE_APP_MODE=sprint4`.
- Do not set `VITE_OPENAI_API_KEY` or `VITE_GEMINI_API_KEY` in Vercel production.
- Render should run `server/sprint4Server.js` behind `/api/sprint4/*`.
- Supabase is the source of truth for sessions, graph nodes, evidence, messages, events, evaluation results, and survey responses.

## Deployment files

- `Dockerfile`: Render backend container
- `render.yaml`: Render service blueprint
- `vercel.json`: Vite SPA deployment on Vercel
- `supabase/migrations/*`: schema needed for the Render-backed Sprint 4 runtime
