import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, BookOpen, Check, Download, Loader, LogOut, Pencil, Plus, RefreshCw, Trash2, TrendingUp, Users, X, Zap } from 'lucide-react'
import Logo from '../components/Logo'
import StudentDetail from '../components/teacher/StudentDetail'
import { useAuth } from '../lib/auth'
import {
  fetchTeacherTree,
  fetchTeacherAnalytics,
  createCourse,
  createHomework,
  createConcept,
  updateCourse,
  deleteCourse,
  updateHomework,
  deleteHomework,
  updateConcept,
  deleteConcept,
  fetchConcept,
} from '../lib/api'

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || ''

const fmt = (ms) => {
  if (!ms) return '0s'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

const pct = (n) => `${n ?? 0}%`

const Bar = ({ value, max, color = 'bg-emerald-500' }) => (
  <div className="w-full bg-white/10 rounded-full h-2">
    <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${max ? Math.round((value / max) * 100) : 0}%` }} />
  </div>
)

const Card = ({ label, value, sub }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
    <p className="text-xs text-gray-400 mb-1">{label}</p>
    <p className="text-2xl font-bold text-white">{value}</p>
    {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
  </div>
)

const TABS = ['Overview', 'Nodes', 'Students', 'Misconceptions', 'Engagement', 'Export']

const exportCSV = (students, label) => {
  const header = 'Session ID,Student,Phase,Eval Score,Mastery %,Turns,Tab Away (s),Voice Responses'
  const rows = students.map((s) =>
    [s.sessionId.slice(0, 8), s.studentName || '', s.phase, s.evalScore, s.masteryRate, s.turns, Math.round((s.tabAwayMs || 0) / 1000), s.speechResponses].join(',')
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `forest-${label || 'session-data'}.csv`
  a.click()
}

const TeacherDashboard = () => {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const password = ADMIN_PASSWORD
  const [mode, setMode] = useState('tree')
  const [tree, setTree] = useState({ courses: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadTree = useCallback(async () => {
    if (!password) {
      setError('Missing VITE_ADMIN_PASSWORD — set it in your environment.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetchTeacherTree(password)
      setTree(res || { courses: [] })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [password])

  useEffect(() => { loadTree() }, [loadTree])

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/"><Logo size="sm" /></Link>
          <span className="text-sm font-semibold text-white">Teacher Dashboard</span>
          <div className="ml-4 flex gap-1 rounded-lg border border-white/10 p-1">
            {['tree', 'analytics'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs rounded-md transition ${mode === m ? 'bg-emerald-500 text-black font-medium' : 'text-gray-400 hover:text-white'}`}
              >
                {m === 'tree' ? 'Courses' : 'Analytics'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 hidden sm:inline">
            {profile?.display_name || user?.email}
          </span>
          <button onClick={() => loadTree()} disabled={loading} className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 transition disabled:opacity-40">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 transition text-xs"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {mode === 'tree' && (
        <TreeView tree={tree} password={password} onChanged={() => loadTree()} />
      )}

      {mode === 'analytics' && (
        <AnalyticsView tree={tree} password={password} />
      )}
    </div>
  )
}

/* ─── Tree view (CRUD) ─────────────────────────────────────────── */

const TreeView = ({ tree, password, onChanged }) => {
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedHomeworkId, setSelectedHomeworkId] = useState('')
  const [editingConceptId, setEditingConceptId] = useState('')

  const selectedCourse = tree.courses?.find((c) => c.id === selectedCourseId) || null
  const selectedHomework = selectedCourse?.homeworks?.find((h) => h.id === selectedHomeworkId) || null

  const confirmDelete = (label) =>
    window.confirm(`Delete ${label}? This is permanent and cascades to everything inside.`)

  return (
    <div className="p-6 max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
      <Column
        title="Courses"
        items={tree.courses || []}
        selectedId={selectedCourseId}
        onSelect={(id) => { setSelectedCourseId(id); setSelectedHomeworkId('') }}
        form={<NewCourseForm password={password} onCreated={onChanged} />}
        renameItem={async (item, nextTitle) => {
          await updateCourse({ id: item.id, title: nextTitle, password })
          onChanged()
        }}
        deleteItem={async (item) => {
          if (!confirmDelete(`course "${item.title}" (and all its homeworks, concepts, and student progress)`)) return
          await deleteCourse({ id: item.id, password })
          if (item.id === selectedCourseId) { setSelectedCourseId(''); setSelectedHomeworkId('') }
          onChanged()
        }}
      />

      <Column
        title={selectedCourse ? `Homeworks — ${selectedCourse.title}` : 'Homeworks'}
        items={selectedCourse?.homeworks || []}
        selectedId={selectedHomeworkId}
        onSelect={setSelectedHomeworkId}
        form={selectedCourse ? <NewHomeworkForm courseId={selectedCourse.id} password={password} onCreated={onChanged} /> : null}
        empty={selectedCourse ? 'No homeworks yet' : 'Pick a course to view homeworks'}
        renameItem={selectedCourse ? async (item, nextTitle) => {
          await updateHomework({ id: item.id, title: nextTitle, password })
          onChanged()
        } : null}
        deleteItem={selectedCourse ? async (item) => {
          if (!confirmDelete(`homework "${item.title}" (and all its concepts)`)) return
          await deleteHomework({ id: item.id, password })
          if (item.id === selectedHomeworkId) setSelectedHomeworkId('')
          onChanged()
        } : null}
      />

      <Column
        title={selectedHomework ? `Concepts — ${selectedHomework.title}` : 'Concepts'}
        items={selectedHomework?.concepts || []}
        selectedId=""
        onSelect={(id) => setEditingConceptId(id)}
        form={selectedHomework ? <NewConceptForm homeworkId={selectedHomework.id} password={password} onCreated={onChanged} /> : null}
        empty={selectedHomework ? 'No concepts yet' : 'Pick a homework to view concepts'}
        renameItem={selectedHomework ? (item) => { setEditingConceptId(item.id) } : null}
        deleteItem={selectedHomework ? async (item) => {
          if (!confirmDelete(`concept "${item.title}"`)) return
          await deleteConcept({ id: item.id, password })
          onChanged()
        } : null}
      />

      {editingConceptId && (
        <EditConceptModal
          conceptId={editingConceptId}
          password={password}
          onClose={() => setEditingConceptId('')}
          onSaved={() => { setEditingConceptId(''); onChanged() }}
        />
      )}
    </div>
  )
}

const Column = ({ title, items, selectedId, onSelect, form, empty, renameItem, deleteItem }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden flex flex-col">
    <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold">{title}</div>
    <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
      {items.length === 0 && (
        <div className="px-4 py-6 text-xs text-gray-500 text-center">{empty || 'Empty'}</div>
      )}
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          selected={selectedId === item.id}
          onSelect={() => onSelect(item.id)}
          onRename={renameItem}
          onDelete={deleteItem}
        />
      ))}
    </div>
    {form && <div className="border-t border-white/10 p-4">{form}</div>}
  </div>
)

const Row = ({ item, selected, onSelect, onRename, onDelete }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { setDraft(item.title) }, [item.title])

  const canInlineRename = typeof onRename === 'function' && onRename.length >= 2

  const startEdit = (e) => {
    e.stopPropagation()
    if (!onRename) return
    if (canInlineRename) { setEditing(true); setDraft(item.title); setErr('') }
    else onRename(item)
  }

  const cancelEdit = (e) => {
    e?.stopPropagation()
    setEditing(false); setDraft(item.title); setErr('')
  }

  const saveEdit = async (e) => {
    e?.stopPropagation()
    const next = draft.trim()
    if (!next || next === item.title) { setEditing(false); return }
    setBusy(true); setErr('')
    try { await onRename(item, next); setEditing(false) }
    catch (er) { setErr(er.message) }
    finally { setBusy(false) }
  }

  const del = async (e) => {
    e.stopPropagation()
    if (!onDelete) return
    setBusy(true); setErr('')
    try { await onDelete(item) }
    catch (er) { setErr(er.message) }
    finally { setBusy(false) }
  }

  if (editing) {
    return (
      <div className="px-4 py-2 bg-white/5 space-y-1">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit()
              if (e.key === 'Escape') cancelEdit()
            }}
            className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-white outline-none focus:border-emerald-500"
          />
          <button onClick={saveEdit} disabled={busy} className="p-1.5 rounded-md text-emerald-400 hover:bg-white/10 disabled:opacity-40">
            {busy ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button onClick={cancelEdit} disabled={busy} className="p-1.5 rounded-md text-gray-400 hover:bg-white/10 disabled:opacity-40">
            <X size={14} />
          </button>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>
    )
  }

  return (
    <div
      className={`group flex items-center gap-1 px-4 py-3 text-sm transition ${selected ? 'bg-emerald-500/20 text-white' : 'text-gray-300 hover:bg-white/5'}`}
    >
      <button onClick={onSelect} className="flex-1 text-left truncate">{item.title}</button>
      {err && <span className="text-[10px] text-red-400 mr-1">{err}</span>}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
        {onRename && (
          <button onClick={startEdit} disabled={busy} className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40" title="Edit">
            <Pencil size={13} />
          </button>
        )}
        {onDelete && (
          <button onClick={del} disabled={busy} className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-white/10 disabled:opacity-40" title="Delete">
            {busy ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        )}
      </div>
    </div>
  )
}

const NewCourseForm = ({ password, onCreated }) => {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!title.trim()) return
    setBusy(true); setErr('')
    try {
      await createCourse({ title: title.trim(), password })
      setTitle('')
      onCreated()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Course title"
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={submit} disabled={busy || !title.trim()} className="w-full flex items-center justify-center gap-1 py-2 bg-emerald-500 text-black text-xs font-medium rounded-lg hover:brightness-110 transition disabled:opacity-40">
        {busy ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />} New course
      </button>
    </div>
  )
}

const NewHomeworkForm = ({ courseId, password, onCreated }) => {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!title.trim()) return
    setBusy(true); setErr('')
    try {
      await createHomework({ courseId, title: title.trim(), password })
      setTitle('')
      onCreated()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Homework title"
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={submit} disabled={busy || !title.trim()} className="w-full flex items-center justify-center gap-1 py-2 bg-emerald-500 text-black text-xs font-medium rounded-lg hover:brightness-110 transition disabled:opacity-40">
        {busy ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />} New homework
      </button>
    </div>
  )
}

const NewConceptForm = ({ homeworkId, password, onCreated }) => {
  const [title, setTitle] = useState('')
  const [seedQuestion, setSeedQuestion] = useState('')
  const [goalsText, setGoalsText] = useState('')
  const [minutes, setMinutes] = useState(15)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const parsedGoals = goalsText
    .split('\n')
    .map((line) => line.replace(/^[\s\-*•\d.)]+/, '').trim())
    .filter(Boolean)

  const submit = async () => {
    if (!title.trim() || !seedQuestion.trim()) return
    setBusy(true); setErr('')
    try {
      await createConcept({
        homeworkId,
        title: title.trim(),
        seedQuestion: seedQuestion.trim(),
        conceptGoals: parsedGoals,
        timeBudgetMs: Math.max(1, Number(minutes) || 15) * 60 * 1000,
        password,
      })
      setTitle(''); setSeedQuestion(''); setGoalsText(''); setMinutes(15)
      onCreated()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Concept title"
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
      />
      <textarea
        value={seedQuestion}
        onChange={(e) => setSeedQuestion(e.target.value)}
        placeholder="Seed question — what should students be able to answer?"
        rows={3}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 resize-none"
      />
      <div>
        <label className="block text-[11px] text-gray-400 mb-1">
          Requirements for understanding <span className="text-gray-600">(one per line)</span>
        </label>
        <textarea
          value={goalsText}
          onChange={(e) => setGoalsText(e.target.value)}
          placeholder={'e.g.\nStudents should know the components of a plant cell and how each contributes to photosynthesis\nStudents should solve simple math problems about limiting components'}
          rows={4}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 resize-none"
        />
        {parsedGoals.length > 0 && (
          <p className="mt-1 text-[10px] text-gray-500">
            {parsedGoals.length} goal{parsedGoals.length === 1 ? '' : 's'} — tutor will diagnose each.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">Time (min)</label>
        <input
          type="number"
          min={1}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white outline-none focus:border-emerald-500"
        />
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={submit} disabled={busy || !title.trim() || !seedQuestion.trim()} className="w-full flex items-center justify-center gap-1 py-2 bg-emerald-500 text-black text-xs font-medium rounded-lg hover:brightness-110 transition disabled:opacity-40">
        {busy ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />} New concept
        {busy && <span className="ml-1 text-[10px]">(planner ~30s)</span>}
      </button>
    </div>
  )
}

const EditConceptModal = ({ conceptId, password, onClose, onSaved }) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [seedQuestion, setSeedQuestion] = useState('')
  const [goalsText, setGoalsText] = useState('')
  const [minutes, setMinutes] = useState(15)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setErr('')
      try {
        const { concept } = await fetchConcept({ id: conceptId, password })
        if (cancelled) return
        setTitle(concept.title || '')
        setSeedQuestion(concept.seedQuestion || '')
        setGoalsText((concept.conceptGoals || []).join('\n'))
        setMinutes(Math.max(1, Math.round((concept.timeBudgetMs || 900000) / 60000)))
      } catch (e) {
        if (!cancelled) setErr(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [conceptId, password])

  const parsedGoals = goalsText
    .split('\n')
    .map((line) => line.replace(/^[\s\-*•\d.)]+/, '').trim())
    .filter(Boolean)

  const save = async () => {
    if (!title.trim() || !seedQuestion.trim()) return
    setSaving(true); setErr('')
    try {
      await updateConcept({
        id: conceptId,
        title: title.trim(),
        seedQuestion: seedQuestion.trim(),
        conceptGoals: parsedGoals,
        timeBudgetMs: Math.max(1, Number(minutes) || 15) * 60 * 1000,
        password,
      })
      onSaved()
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-gray-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Edit concept</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
              <Loader size={14} className="animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Seed question</label>
                <textarea
                  value={seedQuestion}
                  onChange={(e) => setSeedQuestion(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">
                  Requirements for understanding <span className="text-gray-600">(one per line)</span>
                </label>
                <textarea
                  value={goalsText}
                  onChange={(e) => setGoalsText(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 resize-none"
                />
                {parsedGoals.length > 0 && (
                  <p className="mt-1 text-[10px] text-gray-500">
                    {parsedGoals.length} goal{parsedGoals.length === 1 ? '' : 's'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Time (min)</label>
                <input
                  type="number"
                  min={1}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
            </>
          )}
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs text-gray-300 hover:text-white rounded-lg">Cancel</button>
          <button
            onClick={save}
            disabled={loading || saving || !title.trim() || !seedQuestion.trim()}
            className="flex items-center gap-1 px-4 py-2 bg-emerald-500 text-black text-xs font-medium rounded-lg hover:brightness-110 transition disabled:opacity-40"
          >
            {saving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />} Save changes
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Analytics view ───────────────────────────────────────────── */

const AnalyticsView = ({ tree, password }) => {
  const [scope, setScope] = useState('course')
  const [id, setId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('Overview')
  const [selectedSessionId, setSelectedSessionId] = useState('')

  const scopeOptions = useMemo(() => {
    if (scope === 'course') return (tree.courses || []).map((c) => ({ id: c.id, label: c.title }))
    if (scope === 'homework') {
      const out = []
      for (const c of tree.courses || []) {
        for (const h of c.homeworks || []) out.push({ id: h.id, label: `${c.title} · ${h.title}` })
      }
      return out
    }
    if (scope === 'concept') {
      const out = []
      for (const c of tree.courses || []) {
        for (const h of c.homeworks || []) {
          for (const cp of h.concepts || []) out.push({ id: cp.id, label: `${c.title} · ${h.title} · ${cp.title}` })
        }
      }
      return out
    }
    return []
  }, [tree, scope])

  const selectedLabel = scopeOptions.find((o) => o.id === id)?.label || ''

  useEffect(() => { setId(scopeOptions[0]?.id || '') }, [scope, scopeOptions.length])

  const load = useCallback(async () => {
    if (!id) { setData(null); return }
    setLoading(true); setError('')
    try {
      const res = await fetchTeacherAnalytics({ scope, id, password })
      setData(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [scope, id, password])

  useEffect(() => { load() }, [load])

  const o = data?.overview

  return (
    <>
      <div className="border-b border-white/10 px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-white/10 p-1">
          {['course', 'homework', 'concept'].map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1 text-xs rounded-md capitalize transition ${scope === s ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500 min-w-[200px]"
        >
          {scopeOptions.length === 0 && <option value="">No {scope}s yet</option>}
          {scopeOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
        <button onClick={load} disabled={loading || !id} className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 transition disabled:opacity-40">
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

      {!id && !loading && (
        <div className="p-12 text-center text-sm text-gray-500">
          Create a course, homework, and concept to view analytics.
        </div>
      )}

      {data && id && (
        <>
          <div className="border-b border-white/10 px-6 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${tab === t ? 'border-emerald-500 text-white font-medium' : 'border-transparent text-gray-400 hover:text-white'}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-6 max-w-6xl mx-auto">
            {tab === 'Overview' && o && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card label="Total sessions" value={o.totalSessions} />
                  <Card label="Completed" value={`${o.completedCount} / ${o.totalSessions}`} sub={pct(o.completionRate)} />
                  <Card label="Avg eval score" value={o.avgEvalScore ?? '—'} sub={o.avgEvalScore == null ? 'No engagement yet' : '/ 100'} />
                  <Card label="Avg mastery" value={pct(o.avgMasteryRate)} />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><TrendingUp size={14} className="text-emerald-400" /> Evaluation score</h3>
                    <Bar value={o.avgEvalScore ?? 0} max={100} color="bg-emerald-500" />
                    <p className="mt-2 text-xs text-gray-400">
                      {o.avgEvalScore == null ? 'No phase confidence yet' : `${o.avgEvalScore} / 100 — avg phase confidence across attempted phases`}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><BookOpen size={14} className="text-blue-400" /> Mastery rate</h3>
                    <Bar value={o.avgMasteryRate ?? 0} max={100} color="bg-blue-500" />
                    <p className="mt-2 text-xs text-gray-400">{pct(o.avgMasteryRate)}</p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Zap size={14} className="text-amber-400" /> Average turns</h3>
                    <p className="text-2xl font-bold text-white">{o.avgTurns ?? 0}</p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Users size={14} className="text-purple-400" /> Engagement</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-400">Avg tab away</span><span>{fmt(o.avgTabAwayMs)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Avg voice responses</span><span>{o.avgSpeechResponses ?? 0}</span></div>
                    </div>
                  </div>
                </div>

                {data.misconceptions?.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-sm font-semibold mb-3">Top misconceptions</h3>
                    <div className="space-y-3">
                      {data.misconceptions.slice(0, 5).map((m) => (
                        <div key={m.label} className="space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-xs text-gray-300 break-words leading-relaxed">{m.label}</span>
                            <span className="text-xs text-amber-400 font-medium shrink-0">{m.count}×</span>
                          </div>
                          <Bar value={m.count} max={data.misconceptions[0]?.count || 1} color="bg-amber-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'Nodes' && (
              <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-gray-400">
                      <th className="px-4 py-3 text-left">Node</th>
                      <th className="px-4 py-3 text-right">Sessions</th>
                      <th className="px-4 py-3 text-right">Mastery</th>
                      <th className="px-4 py-3 text-right">Skipped</th>
                      <th className="px-4 py-3 text-right">Avg attempts</th>
                      <th className="px-4 py-3 text-left">Top misconception</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.nodes || []).map((n) => (
                      <tr key={n.nodeId} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3 text-white">{n.title}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{n.sessionCount}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={n.masteryRate >= 70 ? 'text-emerald-400' : n.masteryRate >= 40 ? 'text-amber-400' : 'text-red-400'}>
                            {pct(n.masteryRate)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{n.skippedCount}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{n.avgAttempts}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 break-words leading-relaxed min-w-[12rem] max-w-md">{n.topMisconception || '—'}</td>
                      </tr>
                    ))}
                    {!data.nodes?.length && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No node data</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'Students' && (
              <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-gray-400">
                      <th className="px-4 py-3 text-left">Session</th>
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Phase</th>
                      <th className="px-4 py-3 text-right">Eval score</th>
                      <th className="px-4 py-3 text-right">Mastery</th>
                      <th className="px-4 py-3 text-right">Turns</th>
                      <th className="px-4 py-3 text-right">Tab away</th>
                      <th className="px-4 py-3 text-right">Voice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.students || []).map((s) => (
                      <tr
                        key={s.sessionId}
                        onClick={() => setSelectedSessionId(s.sessionId)}
                        className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-emerald-300 underline-offset-2 hover:underline">{s.sessionId.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-gray-300">{s.studentName || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 capitalize">{s.phase}</td>
                        <td className="px-4 py-3 text-right">{s.evalScore ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={s.masteryRate >= 70 ? 'text-emerald-400' : s.masteryRate >= 40 ? 'text-amber-400' : 'text-gray-400'}>
                            {s.masteryRate > 0 ? pct(s.masteryRate) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{s.turns}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{fmt(s.tabAwayMs)}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{s.speechResponses || 0}</td>
                      </tr>
                    ))}
                    {!data.students?.length && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No student data</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'Misconceptions' && (
              <div className="space-y-4">
                {(data.misconceptions || []).length === 0 && (
                  <p className="text-gray-500 text-sm">No misconceptions detected yet.</p>
                )}
                {(data.misconceptions || []).map((m) => (
                  <div key={m.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white break-words leading-relaxed">{m.label}</p>
                        <p className="text-xs text-gray-500 mt-1">{m.nodeIds?.length} node(s) affected</p>
                      </div>
                      <span className="text-sm font-bold text-amber-400 shrink-0">{m.count}×</span>
                    </div>
                    <div className="mt-3">
                      <Bar value={m.count} max={data.misconceptions[0]?.count || 1} color="bg-amber-500" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'Engagement' && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-sm font-semibold mb-4">Skip reasons</h3>
                    {(data.skipReasons || []).length === 0 && <p className="text-sm text-gray-500">No skips recorded.</p>}
                    <div className="space-y-3">
                      {(data.skipReasons || []).map((r) => (
                        <div key={r.reason}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-300 truncate max-w-xs">{r.reason || 'No reason given'}</span>
                            <span className="text-white ml-2 shrink-0">{r.count}×</span>
                          </div>
                          <Bar value={r.count} max={data.skipReasons[0]?.count || 1} color="bg-purple-500" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-sm font-semibold mb-4">Completion funnel</h3>
                    {o && (
                      <div className="space-y-3">
                        {[
                          ['Started', o.totalSessions],
                          ['Completed eval', (data.students || []).filter(s => ['survey','summary'].includes(s.phase)).length],
                          ['Completed survey', (data.students || []).filter(s => s.phase === 'summary').length],
                        ].map(([label, val]) => (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-400">{label}</span>
                              <span className="text-white">{val}</span>
                            </div>
                            <Bar value={val} max={o.totalSessions} color="bg-blue-500" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {data.students?.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-sm font-semibold mb-4">Tab-away time per session</h3>
                    <div className="space-y-2">
                      {data.students.map((s) => (
                        <div key={s.sessionId} className="flex items-center gap-3">
                          <span className="font-mono text-xs text-gray-500 w-16 shrink-0">{s.sessionId.slice(0, 8)}</span>
                          <Bar value={s.tabAwayMs || 0} max={Math.max(...data.students.map(x => x.tabAwayMs || 0), 1)} color="bg-orange-500" />
                          <span className="text-xs text-gray-400 w-12 text-right shrink-0">{fmt(s.tabAwayMs)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'Export' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                  <h3 className="text-sm font-semibold mb-2">Session CSV</h3>
                  <p className="text-xs text-gray-500 mb-4">One row per session: student, phase, eval score, mastery rate, turns, tab-away time, voice responses.</p>
                  <button
                    onClick={() => exportCSV(data.students || [], `${scope}-${id.slice(0, 8)}`)}
                    disabled={!data.students?.length}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-black font-medium rounded-xl text-sm hover:brightness-110 transition disabled:opacity-40"
                  >
                    <Download size={14} />
                    Download CSV ({data.students?.length || 0} sessions)
                  </button>
                </div>

                {o && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                    <h3 className="text-sm font-semibold mb-3">Summary snapshot</h3>
                    <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono bg-black/30 rounded-lg p-4">
{`Scope: ${scope} — ${selectedLabel}
Sessions: ${o.totalSessions}
Completion rate: ${o.completionRate}%
Avg eval score: ${o.avgEvalScore}
Avg mastery rate: ${o.avgMasteryRate}%
Avg turns: ${o.avgTurns}
Voice responses (avg): ${o.avgSpeechResponses}
Top misconception: ${data.misconceptions?.[0]?.label || 'none'}
Hardest node: ${data.nodes?.[0]?.title || 'none'} (${data.nodes?.[0]?.masteryRate}% mastery)`}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {selectedSessionId && (
        <StudentDetail
          sessionId={selectedSessionId}
          password={password}
          onClose={() => setSelectedSessionId('')}
        />
      )}
    </>
  )
}

export default TeacherDashboard
