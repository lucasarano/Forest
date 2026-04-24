import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Loader, AlertCircle } from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth } from '../lib/auth'

const AuthCallback = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, profile, loading, error } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 8000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (loading) return
    if (!user) return // wait for the auth state event
    if (!profile) return // hydrate hasn't finished — keep waiting
    const params = new URLSearchParams(location.search)
    const redirect = params.get('redirect')
    navigate(redirect || (profile.role === 'teacher' ? '/teacher' : '/learn'), { replace: true })
  }, [loading, user, profile, location.search, navigate])

  return (
    <div className="min-h-screen bg-forest-darker flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-forest-light-gray">
        <Logo size="md" />
        {error ? (
          <div className="flex items-center gap-2 text-sm text-red-300">
            <AlertCircle size={14} /> {error}
          </div>
        ) : timedOut && !user ? (
          <div className="text-sm text-amber-300">
            Sign-in is taking longer than expected. <a href="/login" className="underline">Try again</a>.
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Loader size={14} className="animate-spin" /> Finishing sign-in...
          </div>
        )}
      </div>
    </div>
  )
}

export default AuthCallback
