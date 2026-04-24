import React, { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader, RefreshCw } from 'lucide-react'
import Logo from '../components/Logo'
import { fetchOpsHealth } from '../lib/api'

const ADMIN_KEY = 'forest-admin-password'

const StatRow = ({ label, value, ok }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
    <span className="text-sm text-gray-400">{label}</span>
    <div className="flex items-center gap-2">
      {ok !== undefined && (ok
        ? <CheckCircle2 size={13} className="text-emerald-400" />
        : <AlertCircle size={13} className="text-amber-400" />
      )}
      <span className="text-sm text-white font-medium">{value}</span>
    </div>
  </div>
)

const OpsDashboard = () => {
  const [password, setPassword] = useState(() => sessionStorage.getItem(ADMIN_KEY) || '')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authed, setAuthed] = useState(false)

  const load = useCallback(async (pw = password) => {
    if (!pw) return
    setLoading(true)
    setError('')
    try {
      const res = await fetchOpsHealth(pw)
      setData(res)
      sessionStorage.setItem(ADMIN_KEY, pw)
      setAuthed(true)
    } catch (err) {
      setError(err.message)
      setAuthed(false)
    } finally {
      setLoading(false)
    }
  }, [password])

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8">
            <Logo size={28} />
            <span className="text-white font-semibold">Ops Dashboard</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
            <p className="text-sm text-gray-400">System health and data validation.</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Admin password"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={() => load()}
              disabled={loading || !password}
              className="w-full py-3 bg-emerald-500 text-black font-medium rounded-xl text-sm hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader size={14} className="animate-spin" />}
              View Health
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/"><Logo size={24} /></Link>
          <span className="text-sm font-semibold">Ops Dashboard</span>
        </div>
        <button onClick={() => load()} disabled={loading} className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white transition disabled:opacity-40">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-24 gap-2 text-gray-400 text-sm">
          <Loader size={16} className="animate-spin" /> Loading...
        </div>
      )}

      {data && (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ['Total sessions', data.totalSessions],
              ['Completed', `${data.sessionsByPhase?.summary || 0} (${data.completionRate}%)`],
              ['Total events', data.totalEvents],
              ['Avg events/session', data.avgEventsPerSession],
            ].map(([label, val]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className="text-xl font-bold text-white">{val}</p>
              </div>
            ))}
          </div>

          {/* Session phase breakdown */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h3 className="text-sm font-semibold mb-4">Sessions by phase</h3>
            <div>
              {['self_report', 'learning', 'evaluation', 'survey', 'summary'].map((phase) => {
                const count = data.sessionsByPhase?.[phase] || 0
                return (
                  <StatRow
                    key={phase}
                    label={phase}
                    value={count}
                    ok={phase === 'summary' ? count > 0 : true}
                  />
                )
              })}
            </div>
          </div>

          {/* Data validation */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h3 className="text-sm font-semibold mb-4">Data validation</h3>
            <div>
              <StatRow
                label="Sessions with no events"
                value={data.sessionsWithNoEvents}
                ok={data.sessionsWithNoEvents === 0}
              />
              <StatRow
                label="Completed sessions missing eval score"
                value={data.sessionsWithNoEvalScore}
                ok={data.sessionsWithNoEvalScore === 0}
              />
              <StatRow
                label="Total events tracked"
                value={data.totalEvents}
                ok={data.totalEvents > 0}
              />
            </div>
          </div>

          {/* Event breakdown */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h3 className="text-sm font-semibold mb-4">Events by type</h3>
            <div className="space-y-2">
              {Object.entries(data.eventsByType || {})
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400 w-48 shrink-0">{type}</span>
                    <div className="flex-1 bg-white/10 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full"
                        style={{ width: `${Math.round((count / data.totalEvents) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-white w-10 text-right shrink-0">{count}</span>
                  </div>
                ))}
              {!Object.keys(data.eventsByType || {}).length && (
                <p className="text-sm text-gray-500">No events recorded yet.</p>
              )}
            </div>
          </div>

          {/* Recent events */}
          {data.recentEvents?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-sm font-semibold mb-4">Recent events (last 20)</h3>
              <div className="space-y-1">
                {data.recentEvents.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500 w-40 shrink-0">{new Date(e.at).toLocaleTimeString()}</span>
                    <span className="font-mono text-gray-300">{e.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Links */}
          <div className="flex gap-3 text-sm">
            <Link to="/teacher" className="text-emerald-400 hover:text-emerald-300 transition">→ Teacher Dashboard</Link>
            <Link to="/admin" className="text-gray-400 hover:text-white transition">→ Admin</Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default OpsDashboard
