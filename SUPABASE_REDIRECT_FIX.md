# Supabase Auth Redirects

For Sprint 4 production, update Supabase Auth to point at the Vercel frontend.

## Site URL

Set:

```text
https://forest-mockup.vercel.app
```

## Redirect URLs

Add:

```text
https://forest-mockup.vercel.app/**
https://forest-mockup-cobilanding.vercel.app/**
https://forest-mockup-lucasarano-cobilanding.vercel.app/**
http://localhost:3000/**
http://127.0.0.1:3000/**
http://localhost:5173/**
http://127.0.0.1:5173/**
http://localhost:4173/**
http://127.0.0.1:4173/**
```

## Required Vercel env vars

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SPRINT4_SERVER_URL`
- `VITE_APP_MODE=sprint4`

Do not set public AI keys in Vercel production for Sprint 4.
