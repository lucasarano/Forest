# Fix Supabase Email Redirect to Production URL

## Problem
After signup, the email confirmation link redirects to `localhost:3000` instead of the production Vercel URL.

## ✅ Step 1: Environment Variables (COMPLETED)

Environment variables have been added to Vercel:
- ✅ `VITE_SUPABASE_URL`
- ✅ `VITE_SUPABASE_ANON_KEY`
- ✅ `VITE_GEMINI_API_KEY`
- ✅ `VITE_OPENAI_API_KEY`

Latest deployment: https://forest-mockup.vercel.app

## 🔧 Step 2: Update Supabase Redirect URLs (ACTION REQUIRED)

You need to manually update your Supabase project settings to use the production URL.

### Instructions:

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard/project/unjyoakhdlwqlnrpyxts

2. **Navigate to Authentication Settings**:
   - Click on **Authentication** in the left sidebar
   - Click on **URL Configuration**

3. **Update Site URL**:
   - Find the **Site URL** field
   - Change from: `http://localhost:3000`
   - Change to: `https://forest-mockup.vercel.app`

4. **Add Redirect URLs**:
   - Find the **Redirect URLs** section
   - Add these URLs (one per line):
   ```
   https://forest-mockup.vercel.app/**
   https://forest-mockup-cobilanding.vercel.app/**
   https://forest-mockup-lucasarano-cobilanding.vercel.app/**
   http://localhost:3000/**
   ```

5. **Save Changes**: Click the **Save** button at the bottom

### Why This Fixes the Issue

- **Site URL**: This is the default redirect URL Supabase uses in email confirmation links
- **Redirect URLs**: These are the allowed URLs that Supabase will redirect to (whitelist for security)

## 🧪 Verification

After updating Supabase settings:

1. Visit https://forest-mockup.vercel.app/signup
2. Create a new test account
3. Check your email
4. The confirmation link should now point to `forest-mockup.vercel.app` instead of `localhost:3000`
5. Click the link - it should redirect to the production site

## 📝 Notes

- Changes take effect immediately (no need to redeploy)
- Keep `localhost:3000` in redirect URLs for local development
- The Site URL determines the default redirect in emails
- Redirect URLs act as a security whitelist

## 🚀 Current Deployment Status

- **Production URL**: https://forest-mockup.vercel.app
- **Environment Variables**: ✅ Configured
- **Supabase Redirect**: ⚠️ Needs manual update (see Step 2 above)
- **Latest Deployment**: https://vercel.com/cobilanding/forest-mockup
