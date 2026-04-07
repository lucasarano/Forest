import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Home, Loader, Plus, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import Button from '../components/Button'
import Input from '../components/Input'
import Logo from '../components/Logo'
import {
  clearStoredV2AdminPassword,
  createV2StudyConfig,
  fetchMvpV2AdminSummary,
  getStoredV2AdminPassword,
  storeV2AdminPassword,
} from '../lib/mvpV2AdminService'
import { DEFAULT_TIME_BUDGET_MS } from '../lib/sprint4/constants'

const formatMinutes = (ms) => `${Math.round((Number(ms || 0) / 60000) * 10) / 10}`

const MVPV2Admin = () => {
  const [password, setPassword] = useState(getStoredV2AdminPassword())
  const [seedConcept, setSeedConcept] = useState('')
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState(String(DEFAULT_TIME_BUDGET_MS / 60000))
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')

  const loadSummary = async (activePassword = password) => {
    if (!activePassword) return
    setLoading(true)
    setError('')
    try {
      const nextSummary = await fetchMvpV2AdminSummary(activePassword)
      setSummary(nextSummary)
      storeV2AdminPassword(activePassword)
    } catch (err) {
      clearStoredV2AdminPassword()
      setSummary(null)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (password) void loadSummary(password)
  }, [])

  const configs = useMemo(() => summary?.configs || [], [summary])

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!password || !seedConcept.trim()) return
    setCreating(true)
    setError('')
    try {
      await createV2StudyConfig({
        password,
        seedConcept: seedConcept.trim(),
        timeBudgetMs: Math.max(1, Number(timeBudgetMinutes || 0)) * 60000,
      })
      setSeedConcept('')
      await loadSummary(password)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = (configId) => {
    const url = `${window.location.origin}/mvp-v2?study=${configId}`
    navigator.clipboard.writeText(url)
    setCopied(configId)
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div className="relative w-full min-h-screen bg-forest-darker">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-forest-border bg-forest-card/50 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Logo variant="full" />
            </Link>
            <span className="text-[10px] uppercase tracking-[0.25em] text-forest-gray">Sprint 4 Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-3 py-1.5 bg-forest-card border border-forest-border rounded-lg text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors flex items-center gap-1.5 text-sm"
              >
                <Home size={14} />
                Home
              </motion.button>
            </Link>
            <Button type="button" variant="secondary" onClick={() => void loadSummary()} className="!py-1.5 !px-3 !text-sm">
              <span className="flex items-center gap-1.5">
                <RefreshCw size={14} />
                Refresh
              </span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 pb-14 pt-6">
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          {/* Create panel */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-xl border border-forest-border bg-forest-card/40 p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">Create Study Config</p>
              <h1 className="mt-3 text-2xl font-semibold text-white">New seed concept</h1>
              <p className="mt-3 text-sm text-forest-light-gray">
                The planner agent generates the initial graph, prompts, misconceptions, and external evaluation from this seed concept.
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleCreate}>
                <div>
                  <label className="mb-1.5 block text-xs text-forest-light-gray">Admin password</label>
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-forest-light-gray">Seed concept</label>
                  <textarea
                    value={seedConcept}
                    onChange={(e) => setSeedConcept(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-forest-border bg-forest-card/80 px-4 py-3 text-sm text-white outline-none transition focus:border-forest-emerald focus:ring-2 focus:ring-forest-emerald/50 placeholder-forest-gray"
                    placeholder="Example: How gradient descent minimizes loss in machine learning."
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-forest-light-gray">Time budget (minutes)</label>
                  <Input value={timeBudgetMinutes} onChange={(e) => setTimeBudgetMinutes(e.target.value)} placeholder="8" />
                </div>
                <Button type="submit" disabled={creating || !password || !seedConcept.trim()}>
                  <span className="flex items-center gap-2">
                    {creating ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                    Create config
                  </span>
                </Button>
              </form>
            </div>
          </motion.div>

          {/* Configs list */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="rounded-xl border border-forest-border bg-forest-card/40 p-5">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">Study Configs</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Generated concepts</h2>
                </div>
                {loading && <Loader size={18} className="animate-spin text-forest-light-gray" />}
              </div>

              <div className="space-y-3">
                {configs.map((config) => (
                  <div key={config.id} className="rounded-xl border border-forest-border bg-forest-darker/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-forest-gray font-mono truncate">{config.id}</p>
                        <h3 className="mt-1 text-base font-semibold text-white">{config.seedConcept}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(config.id)}
                        className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-forest-border text-xs text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors flex items-center gap-1.5"
                      >
                        <Copy size={12} />
                        {copied === config.id ? 'Copied!' : 'Copy link'}
                      </button>
                    </div>
                    {config.conceptSummary && (
                      <p className="mt-2 text-xs text-forest-light-gray line-clamp-2">{config.conceptSummary}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-forest-gray">
                      <span className="rounded-md border border-forest-border bg-forest-card px-2 py-0.5">
                        {formatMinutes(config.timeBudgetMs)} min
                      </span>
                      <span className="rounded-md border border-forest-border bg-forest-card px-2 py-0.5">
                        {config.sessionCount || 0} sessions
                      </span>
                      <span className="rounded-md border border-forest-border bg-forest-card px-2 py-0.5">
                        {config.guidedCount || 0} guided
                      </span>
                      <span className="rounded-md border border-forest-border bg-forest-card px-2 py-0.5">
                        {config.controlCount || 0} control
                      </span>
                      <span className="rounded-md border border-forest-border bg-forest-card px-2 py-0.5">
                        Avg eval {config.averageEvaluationScore || 0}
                      </span>
                    </div>
                  </div>
                ))}

                {!configs.length && !loading && (
                  <div className="rounded-xl border border-forest-border bg-forest-darker/50 px-4 py-6 text-center">
                    <p className="text-sm text-forest-gray">No study configs yet. Create one above.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-900/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default MVPV2Admin
