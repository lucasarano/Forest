import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Loader, Mail, Lock, AlertCircle, GraduationCap, Users } from 'lucide-react'
import Logo from '../components/Logo'
import { supabase } from '../lib/supabase'
import { useAuth, setPendingRole } from '../lib/auth'

const roleFromQuery = (search) => {
  const params = new URLSearchParams(search)
  const r = params.get('role')
  return r === 'teacher' ? 'teacher' : 'student'
}

const homeForRole = (role) => (role === 'teacher' ? '/teacher' : '/learn')

const Login = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, profile, loading: authLoading } = useAuth()

  const initialRole = useMemo(() => roleFromQuery(location.search), [location.search])
  const redirectTo = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('redirect') || ''
  }, [location.search])

  const [mode, setMode] = useState('signin')
  const [role, setRole] = useState(initialRole)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => { setRole(initialRole) }, [initialRole])

  // If already signed in, bounce to the right place.
  useEffect(() => {
    if (authLoading) return
    if (user && profile) {
      navigate(redirectTo || homeForRole(profile.role), { replace: true })
    }
  }, [authLoading, user, profile, redirectTo, navigate])

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    if (busy) return
    setError(''); setInfo('')
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        setPendingRole(role)
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { role, display_name: displayName.trim() || email.trim().split('@')[0] },
          },
        })
        if (signUpError) throw signUpError
        if (!data.session) {
          setInfo('Check your email to confirm your account, then come back and sign in.')
          setBusy(false)
          return
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
      }
      // useAuth + the redirect effect above will pick this up.
    } catch (err) {
      setError(err.message || 'Authentication failed.')
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    if (busy) return
    setError(''); setInfo('')
    setBusy(true)
    try {
      setPendingRole(role)
      const redirectUrl = new URL('/auth/callback', window.location.origin)
      if (redirectTo) redirectUrl.searchParams.set('redirect', redirectTo)
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl.toString() },
      })
      if (oauthError) throw oauthError
    } catch (err) {
      setError(err.message || 'Google sign-in failed.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-forest-darker flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex justify-center mb-6">
          <Link to="/"><Logo size="md" /></Link>
        </div>

        <div className="rounded-2xl border border-forest-border bg-forest-card/40 p-6 backdrop-blur">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-semibold text-white">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </h1>
          </div>
          <p className="text-sm text-forest-light-gray mb-5">
            {mode === 'signin'
              ? 'Welcome back. Continue where you left off.'
              : 'Pick your role and create an account to get started.'}
          </p>

          {mode === 'signup' && (
            <div className="mb-4">
              <label className="block text-[11px] uppercase tracking-[0.2em] text-forest-emerald font-semibold mb-2">
                I am a...
              </label>
              <div className="grid grid-cols-2 gap-2">
                <RoleButton
                  active={role === 'student'}
                  onClick={() => setRole('student')}
                  icon={<GraduationCap size={16} />}
                  label="Student"
                />
                <RoleButton
                  active={role === 'teacher'}
                  onClick={() => setRole('teacher')}
                  icon={<Users size={16} />}
                  label="Teacher"
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-gray-900 font-medium text-sm hover:bg-gray-100 transition disabled:opacity-60 mb-4"
          >
            <GoogleMark />
            Continue with Google
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-forest-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-forest-card/40 px-3 text-[11px] uppercase tracking-[0.2em] text-forest-gray">
                or with email
              </span>
            </div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs text-forest-light-gray mb-1">Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-xl border border-forest-border bg-forest-darker/60 px-4 py-2.5 text-sm text-white outline-none focus:border-forest-emerald transition placeholder:text-forest-gray"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-forest-light-gray mb-1">Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-gray" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-forest-border bg-forest-darker/60 pl-9 pr-4 py-2.5 text-sm text-white outline-none focus:border-forest-emerald transition placeholder:text-forest-gray"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-forest-light-gray mb-1">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-gray" />
                <input
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-forest-border bg-forest-darker/60 pl-9 pr-4 py-2.5 text-sm text-white outline-none focus:border-forest-emerald transition placeholder:text-forest-gray"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {info && (
              <div className="rounded-xl border border-forest-emerald/30 bg-forest-emerald/10 px-3 py-2 text-xs text-forest-emerald">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-forest-emerald text-forest-darker font-medium text-sm hover:brightness-110 transition disabled:opacity-60"
            >
              {busy ? <Loader size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="mt-5 text-center text-xs text-forest-light-gray">
            {mode === 'signin' ? (
              <>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(''); setInfo('') }}
                  className="text-forest-emerald hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(''); setInfo('') }}
                  className="text-forest-emerald hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

const RoleButton = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition ${
      active
        ? 'border-forest-emerald bg-forest-emerald/10 text-white'
        : 'border-forest-border bg-forest-darker/40 text-forest-light-gray hover:border-forest-emerald/40'
    }`}
  >
    {icon}
    {label}
  </button>
)

const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.2 29.2 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.6 29.1 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.3-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.6 29.1 5 24 5 16.3 5 9.6 9.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 43c5 0 9.5-1.9 12.9-5l-6-4.9C29 34.6 26.6 35.5 24 35.5c-5.2 0-9.6-2.7-11.3-6.9l-6.5 5C9.5 38.6 16.2 43 24 43z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.4 4.2-4.4 5.5l6 4.9C40.6 35.6 43 30.2 43 24c0-1.2-.1-2.3-.4-3.5z"/>
  </svg>
)

export default Login
