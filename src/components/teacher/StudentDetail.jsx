import React, { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { X, Loader, AlertCircle, ChevronDown, ChevronRight, Sparkles, AlertTriangle, Info, Flame } from 'lucide-react'
import { fetchTeacherSessionDetail } from '../../lib/api'
import ConfidenceChart from './ConfidenceChart'

const SEVERITY = {
  critical: { icon: Flame, color: 'text-red-300', bg: 'bg-red-500/10 border-red-500/30' },
  warn: { icon: AlertTriangle, color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/30' },
  info: { icon: Info, color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/30' },
}

const STATUS_COLOR = {
  mastered: 'bg-emerald-500/20 text-emerald-300',
  in_progress: 'bg-blue-500/20 text-blue-300',
  active: 'bg-blue-500/20 text-blue-300',
  skipped: 'bg-gray-500/20 text-gray-300',
  needs_review: 'bg-amber-500/20 text-amber-300',
  locked: 'bg-white/10 text-gray-400',
  completed: 'bg-emerald-500/20 text-emerald-300',
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString()
}

const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString()
}

const PhaseBar = ({ phase, data }) => {
  const pct = Math.round((data.confidence || 0) * 100)
  const passed = data.state === 'passed'
  const color = passed ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="capitalize w-24 text-gray-400">{phase}</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`${color} h-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-gray-300">{pct}%</span>
      <span className="w-16 text-right text-gray-500">{data.attempts || 0} att</span>
      <span className="w-16 text-right text-gray-500 capitalize">{data.state || 'locked'}</span>
    </div>
  )
}

const Message = ({ m }) => {
  const isTutor = m.role === 'tutor'
  return (
    <div className={`flex ${isTutor ? 'justify-start' : 'justify-end'} mb-2`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isTutor ? 'bg-white/10 text-white rounded-bl-sm' : 'bg-emerald-500/20 text-emerald-100 rounded-br-sm'}`}>
        <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-1">
          <span className="uppercase tracking-wider">{m.role}</span>
          {m.phase && <span className="capitalize">· {m.phase}</span>}
          {m.createdAt && <span>· {fmtTime(m.createdAt)}</span>}
        </div>
        <div className="prose prose-invert prose-sm max-w-none [&>p]:my-1">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {m.content || ''}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

const NodeCard = ({ node, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen)
  const statusClass = STATUS_COLOR[node.status] || STATUS_COLOR.locked
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          {open ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <span className="text-sm text-white truncate">{node.title}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${statusClass}`}>{node.status}</span>
          {node.reason && <span className="text-[10px] text-gray-500 truncate">· {node.reason}</span>}
        </div>
        <span className="text-xs text-gray-500 shrink-0">{(node.messages || []).length} msgs</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="space-y-1.5 pt-2 border-t border-white/5">
            {['explanation', 'causality', 'transfer', 'recall'].map((ph) => (
              <PhaseBar key={ph} phase={ph} data={node.phases?.[ph] || {}} />
            ))}
          </div>
          {(node.messages || []).length === 0 ? (
            <p className="text-xs text-gray-500 italic pt-2">No messages logged for this node.</p>
          ) : (
            <div className="pt-2 max-h-[500px] overflow-y-auto pr-1">
              {node.messages.map((m) => <Message key={m.id} m={m} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const InsightPill = ({ ins }) => {
  const cfg = SEVERITY[ins.severity] || SEVERITY.info
  const Icon = cfg.icon
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${cfg.bg}`} title={ins.detail || ''}>
      <Icon size={14} className={`${cfg.color} mt-0.5 shrink-0`} />
      <div className="min-w-0">
        <p className={`text-xs font-medium ${cfg.color}`}>{ins.summary}</p>
        {ins.detail && <p className="text-[10px] text-gray-400 mt-0.5">{ins.detail}</p>}
      </div>
    </div>
  )
}

const StudentDetail = ({ sessionId, password, onClose }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nodeFilter, setNodeFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchTeacherSessionDetail({ sessionId, password })
      .then((res) => { if (!cancelled) setData(res) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionId, password])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const nodeOptions = useMemo(() => {
    const out = [{ id: 'all', label: 'All nodes' }]
    for (const n of data?.nodes || []) out.push({ id: n.id, label: n.title })
    return out
  }, [data])

  const header = data?.session

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-4xl h-full bg-gray-950 border-l border-white/10 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">
              {header?.studentName || 'Student'} <span className="text-gray-500 font-normal">· {header?.conceptTitle}</span>
            </h2>
            {header && (
              <p className="text-xs text-gray-500 mt-0.5">
                {header.turns} turns · {header.masteredCount}/{header.nodeCount} nodes mastered · started {fmtDate(header.startedAt)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400 text-sm">
            <Loader size={16} className="animate-spin" /> Loading session…
          </div>
        )}

        {error && (
          <div className="m-6 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {data && !loading && (
          <div className="p-6 space-y-6">
            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Status" value={header.status} />
              <Stat label="Turns" value={header.turns} />
              <Stat label="Mastery" value={`${header.masteryRate}%`} />
              <Stat label="Last active" value={fmtDate(header.lastActiveAt)} small />
            </div>

            {/* Insights */}
            {data.insights?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Sparkles size={14} className="text-amber-400" /> Insights
                </h3>
                <div className="grid md:grid-cols-2 gap-2">
                  {data.insights.map((ins, i) => <InsightPill key={i} ins={ins} />)}
                </div>
              </div>
            )}

            {/* Confidence chart */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Confidence over time</h3>
                <select
                  value={nodeFilter}
                  onChange={(e) => setNodeFilter(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-emerald-500"
                >
                  {nodeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <ConfidenceChart series={data.confidenceSeries || []} nodeFilter={nodeFilter} />
            </div>

            {/* Nodes + transcripts */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Concept tree &amp; conversation</h3>
              {(data.nodes || []).length === 0 && <p className="text-sm text-gray-500">No nodes yet.</p>}
              {(data.nodes || []).map((n, i) => <NodeCard key={n.id} node={n} defaultOpen={i === 0} />)}
            </div>

            {/* Raw events */}
            <details className="rounded-xl border border-white/10 bg-white/5 p-4">
              <summary className="text-xs text-gray-400 cursor-pointer">Raw event log ({(data.events || []).length})</summary>
              <div className="mt-3 max-h-64 overflow-y-auto">
                <table className="w-full text-[11px] font-mono">
                  <tbody>
                    {(data.events || []).map((e) => (
                      <tr key={e.id} className="border-b border-white/5">
                        <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{fmtTime(e.createdAt)}</td>
                        <td className="py-1 pr-2 text-emerald-300">{e.type}</td>
                        <td className="py-1 text-gray-400 break-all">{JSON.stringify(e.payload || {}).slice(0, 200)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

const Stat = ({ label, value, small }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
    <p className={`${small ? 'text-xs' : 'text-lg font-semibold'} text-white capitalize truncate`}>{value ?? '—'}</p>
  </div>
)

export default StudentDetail
