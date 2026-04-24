import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase'

const AuthContext = createContext(null)

const PENDING_ROLE_KEY = 'forest:auth:pendingRole'

export const setPendingRole = (role) => {
  if (role === 'student' || role === 'teacher') {
    localStorage.setItem(PENDING_ROLE_KEY, role)
  }
}
export const popPendingRole = () => {
  const v = localStorage.getItem(PENDING_ROLE_KEY)
  localStorage.removeItem(PENDING_ROLE_KEY)
  return v === 'student' || v === 'teacher' ? v : null
}

const fetchProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, role')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

const ensureProfile = async (user, fallbackRole = 'student', fallbackName = '') => {
  if (!user) return null
  const existing = await fetchProfile(user.id)
  if (existing) return existing
  const role =
    user.user_metadata?.role === 'teacher' || user.user_metadata?.role === 'student'
      ? user.user_metadata.role
      : (fallbackRole || 'student')
  const display_name =
    fallbackName ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (user.email ? user.email.split('@')[0] : '')
  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: user.id, email: user.email || null, display_name, role })
    .select('id, email, display_name, role')
    .single()
  if (error) throw error
  return data
}

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const hydrate = useCallback(async (currentSession) => {
    if (!currentSession?.user) {
      setProfile(null)
      return
    }
    try {
      const pendingRole = popPendingRole()
      const next = await ensureProfile(currentSession.user, pendingRole || 'student')
      setProfile(next)
      setError('')
    } catch (err) {
      console.error('Failed to load profile', err)
      setError(err.message || 'Could not load profile')
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null)
      setLoading(false)
      hydrate(nextSession)
    })

    return () => {
      sub?.subscription?.unsubscribe?.()
    }
  }, [hydrate])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      profile,
      role: profile?.role || null,
      loading,
      error,
      signOut,
    }),
    [session, profile, loading, error, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export const ProtectedRoute = ({ children, role }) => {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-forest-darker flex items-center justify-center text-forest-light-gray text-sm">
        Loading...
      </div>
    )
  }

  if (!user) {
    const search = new URLSearchParams({ redirect: location.pathname + location.search }).toString()
    const roleParam = role ? `&role=${role}` : ''
    return <Navigate to={`/login?${search}${roleParam}`} replace />
  }

  if (role && profile && profile.role !== role) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-white/10 bg-white/5 p-6 space-y-3">
          <h1 className="text-lg font-semibold">Access denied</h1>
          <p className="text-sm text-gray-400">
            This area requires a <span className="font-medium text-white">{role}</span> account.
            You're signed in as <span className="font-medium text-white">{profile.role}</span>.
          </p>
          <a href="/" className="inline-block text-sm text-emerald-400 hover:text-emerald-300">← Back home</a>
        </div>
      </div>
    )
  }

  return children
}
