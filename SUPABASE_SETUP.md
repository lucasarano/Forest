# Supabase Setup Instructions

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up/sign in
2. Click "New Project"
3. Fill in your project details:
   - Name: Forest
   - Database Password: (choose a strong password)
   - Region: (choose closest to you)
4. Wait for the project to be created

## 2. Get Your API Credentials

1. In your Supabase project dashboard, go to **Settings** > **API**
2. You'll find:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **Project API keys** > **anon public**: `eyJhbGc...`

## 3. Configure Your App

1. Create a `.env` file in the root of your project (it's already in .gitignore):

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

2. Replace the values with your actual credentials from step 2

## 4. Configure Authentication Settings (Optional)

By default, Supabase requires email confirmation. To disable it for development:

1. Go to **Authentication** > **Providers** > **Email**
2. Disable "Confirm email"
3. Save

For production, keep email confirmation enabled for security.

## 5. Set Up Email Templates (Optional)

1. Go to **Authentication** > **Email Templates**
2. Customize the confirmation, password reset, and magic link emails
3. You can use your own SMTP server in **Settings** > **Auth** > **SMTP Settings**

## 6. Database Schema (Auto-created)

Supabase automatically creates the necessary auth tables. User data is stored in:
- `auth.users` - Core user data
- User metadata (like full_name) is stored in `user_metadata` field

## 7. Test the Setup

1. Start your app: `npm run dev`
2. Try signing up with a test email
3. Check the **Authentication** > **Users** section in Supabase to see the new user

## Security Notes

- Never commit your `.env` file (it's in .gitignore)
- The anon key is safe to use in the browser
- Row Level Security (RLS) is automatically enabled
- Service role key should NEVER be used in the frontend

## Troubleshooting

If you get connection errors:
1. Verify your `.env` file has the correct credentials
2. Restart the dev server after adding `.env`
3. Check that your Supabase project is active
4. Verify the Project URL doesn't have trailing slashes
