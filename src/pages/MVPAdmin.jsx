import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  Clock3,
  Download,
  Filter,
  Loader,
  Lock,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Button from '../components/Button'
import Input from '../components/Input'
import Logo from '../components/Logo'
import {
  clearStoredMvpAdminPassword,
  fetchMvpAdminDetail,
  fetchMvpAdminSummary,
  getStoredMvpAdminPassword,
  storeMvpAdminPassword,
} from '../lib/mvpAdminService'
import { ASSESSMENT_QUESTIONS, WATER_CURRICULUM } from '../lib/mvpContent'

const defaultFilters = {
  search: '',
  dateFrom: '',
  dateTo: '',
  status: '',
  highestPhaseReached: '',
  completionReason: '',
  guidedOutcome: '',
  airplaneOutcome: '',
  hasSkipped: '',
  surveyPreference: '',
}

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const formatMinutes = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return '0.0'
  return (ms / 60000).toFixed(1)
}

const formatDateTime = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

const buildCsv = (rows) => {
  const nodeHeaders = WATER_CURRICULUM.flatMap((node) => ([
    `${node.key}_mastery_minutes`,
    `${node.key}_attempts`,
    `${node.key}_interactions`,
  ]))

  const headers = [
    'timestamp',
    ...nodeHeaders,
    'guided_quiz_score_out_of_4',
    'freeform_quiz_score_out_of_4',
    'total_completion_minutes',
    'number_of_attempts_per_diagnostic_question_average',
    'number_of_node_interactions',
    'guided_confidence_before',
    'guided_confidence_after',
    'freeform_confidence_before',
    'freeform_confidence_after',
    'clarity_rating',
    'engagement_rating',
    'effectiveness_rating',
    'guided_usefulness',
    'freeform_usefulness',
    'clearer_system',
    'preferred_system',
    'positive_aspect_guided',
    'positive_aspect_freeform',
  ]

  const csvRows = [
    headers.join(','),
    ...rows.map((row) => {
      const nodeMetricMap = new Map((row.nodeMetrics || []).map((metric) => [metric.nodeKey, metric]))
      const nodeMetrics = WATER_CURRICULUM.map((node) => nodeMetricMap.get(node.key) || {})
      const totalAttempts = nodeMetrics.reduce((sum, metric) => sum + Number(metric.attemptCount || 0), 0)
      const averageAttempts = nodeMetrics.length ? (totalAttempts / nodeMetrics.length).toFixed(2) : ''
      const record = {
        timestamp: row.surveyCompletedAt ?? row.assessmentCompletedAt ?? row.updatedAt ?? row.createdAt ?? '',
        guided_quiz_score_out_of_4: row.guidedQuizScore ?? '',
        freeform_quiz_score_out_of_4: row.freeformQuizScore ?? '',
        total_completion_minutes: formatMinutes(row.totalCompletionTimeMs ?? row.waterTimeMs ?? 0),
        number_of_attempts_per_diagnostic_question_average: averageAttempts,
        number_of_node_interactions: nodeMetrics.reduce((sum, metric) => sum + Number(metric.interactionCount || 0), 0),
        guided_confidence_before: row.guidedConfidenceBefore ?? '',
        guided_confidence_after: row.guidedConfidenceAfter ?? '',
        freeform_confidence_before: row.freeformConfidenceBefore ?? '',
        freeform_confidence_after: row.freeformConfidenceAfter ?? '',
        clarity_rating: row.surveyClarityRating ?? '',
        engagement_rating: row.surveyEngagementRating ?? '',
        effectiveness_rating: row.surveyEffectivenessRating ?? '',
        guided_usefulness: row.surveyGuidedUsefulness ?? '',
        freeform_usefulness: row.surveyFreeformUsefulness ?? '',
        clearer_system: row.surveyClearerSystem ?? row.surveyClearerExplanations ?? '',
        preferred_system: row.surveyPreferredSystem ?? row.surveyPreferredModerateTopic ?? '',
        positive_aspect_guided: row.surveyPositiveAspectGuided ?? '',
        positive_aspect_freeform: row.surveyPositiveAspectFreeform ?? '',
      }

      WATER_CURRICULUM.forEach((node) => {
        const metric = nodeMetricMap.get(node.key) || {}
        record[`${node.key}_mastery_minutes`] = formatMinutes(metric.masteryTimeMs ?? 0)
        record[`${node.key}_attempts`] = metric.attemptCount ?? ''
        record[`${node.key}_interactions`] = metric.interactionCount ?? ''
      })

      return headers.map((header) => `"${`${record[header] ?? ''}`.replace(/"/g, '""')}"`).join(',')
    }),
  ]

  return csvRows.join('\n')
}

const ExportButton = ({ label, content, filename, disabled }) => (
  <Button
    type="button"
    variant="secondary"
    disabled={disabled}
    onClick={() => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    }}
  >
    <span className="flex items-center gap-2">
      <Download size={16} />
      {label}
    </span>
  </Button>
)

const MetricCard = ({ label, value, helper }) => (
  <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
    <p className="text-xs uppercase tracking-[0.25em] text-forest-emerald/80">{label}</p>
    <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    {helper && <p className="mt-2 text-sm text-forest-gray">{helper}</p>}
  </div>
)

const FilterSelect = ({ label, value, options, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-forest-light-gray mb-2">{label}</label>
    <select
      value={value}
      onChange={onChange}
      className="w-full rounded-lg border border-forest-border bg-forest-card/80 px-4 py-3 text-white focus:outline-none focus:border-forest-emerald"
    >
      <option value="">All</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </div>
)

const MVPAdmin = () => {
  const totalAssessmentQuestions = ASSESSMENT_QUESTIONS.length
  const [password, setPassword] = useState(getStoredMvpAdminPassword())
  const [authenticated, setAuthenticated] = useState(!!getStoredMvpAdminPassword())
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState(defaultFilters)
  const [summary, setSummary] = useState(null)
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortDirection, setSortDirection] = useState('desc')

  const loadSummary = async (nextPassword = password, nextFilters = filters) => {
    if (!nextPassword) return
    setLoading(true)
    setAuthError('')
    try {
      const data = await fetchMvpAdminSummary(nextPassword, nextFilters)
      setSummary(data)
      setAuthenticated(true)
      storeMvpAdminPassword(nextPassword)
    } catch (error) {
      setSummary(null)
      setDetail(null)
      setAuthenticated(false)
      clearStoredMvpAdminPassword()
      setAuthError(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authenticated || !password) return
    void loadSummary(password, filters)
  }, [authenticated, password, filters])

  const optionSets = useMemo(() => {
    const sessions = summary?.sessions || []
    const collect = (key) => [...new Set(sessions.map((session) => session[key]).filter(Boolean))].sort()
    return {
      statuses: collect('status'),
      highestPhases: collect('highestPhaseReached'),
      completionReasons: collect('completionReason'),
      guidedOutcomes: collect('guidedOutcome'),
      airplaneOutcomes: collect('airplaneOutcome'),
      surveyPreferences: collect('surveyPreference'),
    }
  }, [summary])

  const sortedSessions = useMemo(() => {
    const sessions = [...(summary?.sessions || [])]
    sessions.sort((left, right) => {
      const leftValue = left[sortBy] ?? ''
      const rightValue = right[sortBy] ?? ''
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue
      }
      return sortDirection === 'asc'
        ? `${leftValue}`.localeCompare(`${rightValue}`)
        : `${rightValue}`.localeCompare(`${leftValue}`)
    })
    return sessions
  }, [summary, sortBy, sortDirection])

  const loadDetail = async (sessionId) => {
    setSelectedSessionId(sessionId)
    setDetailLoading(true)
    try {
      const data = await fetchMvpAdminDetail(password, sessionId)
      setDetail(data)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    await loadSummary(password, filters)
  }

  if (!authenticated || !summary) {
    return (
      <div className="min-h-screen bg-[#07110d] text-white">
        <header className="px-6 py-6 md:px-10 border-b border-white/5">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <Logo />
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald">Admin</p>
              <h1 className="text-2xl font-semibold">MVP Analytics Dashboard</h1>
            </div>
          </div>
        </header>
        <main className="max-w-xl mx-auto px-6 py-16">
          <div className="rounded-[32px] border border-white/5 bg-forest-darker/70 p-8">
            <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald mb-3">Protected access</p>
            <h2 className="text-4xl font-semibold">Enter admin password</h2>
            <p className="mt-4 text-forest-light-gray">
              This dashboard shows participant logs, partial sessions, transcripts, quiz data, survey responses, and event timelines.
            </p>
            <form className="mt-8 space-y-5" onSubmit={handlePasswordSubmit}>
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                icon={Lock}
                required
              />
              {authError && (
                <div className="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex gap-2">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}
              <Button type="submit" variant="primary" fullWidth disabled={loading}>
                <span className="flex items-center justify-center gap-2">
                  {loading ? 'Unlocking...' : 'Open analytics dashboard'}
                  {loading ? <Loader size={18} className="animate-spin" /> : <BarChart3 size={18} />}
                </span>
              </Button>
            </form>
          </div>
        </main>
      </div>
    )
  }

  const aggregates = summary.aggregates || {}

  return (
    <div className="min-h-screen bg-[#07110d] text-white">
      <header className="px-6 py-6 md:px-10 border-b border-white/5">
        <div className="max-w-[1500px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald">Admin</p>
              <h1 className="text-2xl font-semibold">MVP Analytics Dashboard</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ExportButton
              label="Export filtered CSV"
              content={buildCsv(sortedSessions)}
              filename="mvp-admin-sessions.csv"
              disabled={!sortedSessions.length}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                clearStoredMvpAdminPassword()
                setAuthenticated(false)
                setSummary(null)
                setDetail(null)
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 py-8 space-y-8">
        <section className="rounded-[32px] border border-white/5 bg-forest-darker/60 p-6">
          <div className="flex items-center gap-2 text-forest-emerald text-sm font-medium">
            <Filter size={16} />
            Filters
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Input
              label="Search participant"
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Name or email"
              icon={Search}
            />
            <Input
              label="From date"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))}
            />
            <Input
              label="To date"
              type="date"
              value={filters.dateTo}
              onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              options={optionSets.statuses}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            />
            <FilterSelect
              label="Highest phase"
              value={filters.highestPhaseReached}
              options={optionSets.highestPhases}
              onChange={(event) => setFilters((prev) => ({ ...prev, highestPhaseReached: event.target.value }))}
            />
            <FilterSelect
              label="Completion reason"
              value={filters.completionReason}
              options={optionSets.completionReasons}
              onChange={(event) => setFilters((prev) => ({ ...prev, completionReason: event.target.value }))}
            />
            <FilterSelect
              label="Guided outcome"
              value={filters.guidedOutcome}
              options={optionSets.guidedOutcomes}
              onChange={(event) => setFilters((prev) => ({ ...prev, guidedOutcome: event.target.value }))}
            />
            <FilterSelect
              label="Airplane outcome"
              value={filters.airplaneOutcome}
              options={optionSets.airplaneOutcomes}
              onChange={(event) => setFilters((prev) => ({ ...prev, airplaneOutcome: event.target.value }))}
            />
            <FilterSelect
              label="Any skipped nodes"
              value={filters.hasSkipped}
              options={['yes', 'no']}
              onChange={(event) => setFilters((prev) => ({ ...prev, hasSkipped: event.target.value }))}
            />
            <FilterSelect
              label="Survey preference"
              value={filters.surveyPreference}
              options={optionSets.surveyPreferences}
              onChange={(event) => setFilters((prev) => ({ ...prev, surveyPreference: event.target.value }))}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setFilters(defaultFilters)}>
              Reset filters
            </Button>
            <Button type="button" variant="ghost" onClick={() => void loadSummary(password, filters)}>
              <span className="flex items-center gap-2">
                <RefreshCw size={16} />
                Refresh data
              </span>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total sessions" value={aggregates.totalSessions || 0} />
          <MetricCard label="Completed" value={aggregates.completedSessions || 0} />
          <MetricCard label="In progress" value={aggregates.inProgressSessions || 0} />
          <MetricCard label="Avg quiz score" value={aggregates.averageQuizScore || 0} helper={`Out of ${totalAssessmentQuestions}`} />
          <MetricCard label="Avg guided time" value={formatDuration(aggregates.averageGuidedTimeMs || 0)} />
          <MetricCard label="Avg airplane time used" value={formatDuration(aggregates.averageAirplaneTimeUsedMs || 0)} />
          <MetricCard
            label="Manual finishes"
            value={(aggregates.airplaneOutcomeBreakdown || []).find((item) => item.outcome === 'manual_finish')?.count || 0}
          />
          <MetricCard
            label="Timeout finishes"
            value={(aggregates.airplaneOutcomeBreakdown || []).find((item) => item.outcome === 'timeout')?.count || 0}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-[32px] border border-white/5 bg-forest-darker/60 p-6">
            <h2 className="text-xl font-semibold">Session overview</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-left text-forest-gray border-b border-white/5">
                    {[
                      ['participantName', 'Participant'],
                      ['status', 'Status'],
                      ['highestPhaseReached', 'Highest phase'],
                      ['completionReason', 'Completion reason'],
                      ['guidedOutcome', 'Guided outcome'],
                      ['airplaneOutcome', 'Airplane outcome'],
                      ['totalQuizScore', 'Quiz'],
                      ['waterTimeMs', 'Guided time'],
                      ['airplaneTimeUsedMs', 'Airplane used'],
                      ['lastActiveAt', 'Last active'],
                    ].map(([key, label]) => (
                      <th key={key} className="py-3 pr-4">
                        <button
                          type="button"
                          className="hover:text-white transition-colors"
                          onClick={() => {
                            if (sortBy === key) {
                              setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                            } else {
                              setSortBy(key)
                              setSortDirection('desc')
                            }
                          }}
                        >
                          {label}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedSessions.map((session) => (
                    <tr
                      key={session.id}
                      className="border-b border-white/5 cursor-pointer hover:bg-white/5"
                      onClick={() => void loadDetail(session.id)}
                    >
                      <td className="py-4 pr-4">
                        <p className="text-white font-medium">{session.participantName}</p>
                        <p className="text-xs text-forest-gray mt-1">{session.participantEmail}</p>
                      </td>
                      <td className="py-4 pr-4 capitalize">{session.status}</td>
                      <td className="py-4 pr-4">{session.highestPhaseReached}</td>
                      <td className="py-4 pr-4">{session.completionReason}</td>
                      <td className="py-4 pr-4">{session.guidedOutcome}</td>
                      <td className="py-4 pr-4">{session.airplaneOutcome}</td>
                      <td className="py-4 pr-4">{session.totalQuizScore}/{totalAssessmentQuestions}</td>
                      <td className="py-4 pr-4">{formatDuration(session.waterTimeMs)}</td>
                      <td className="py-4 pr-4">{formatDuration(session.airplaneTimeUsedMs)}</td>
                      <td className="py-4 pr-4">{formatDateTime(session.lastActiveAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sortedSessions.length && (
                <div className="py-12 text-center text-forest-gray">No sessions matched the current filters.</div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[32px] border border-white/5 bg-forest-darker/60 p-6">
              <h2 className="text-xl font-semibold">Drop-off by phase</h2>
              <div className="mt-5 space-y-4">
                {(aggregates.dropoffByPhase || []).map((item) => (
                  <div key={item.phase}>
                    <div className="flex items-center justify-between text-sm text-forest-light-gray">
                      <span>{item.phase}</span>
                      <span>{item.count}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-forest-emerald to-forest-teal"
                        style={{ width: `${aggregates.totalSessions ? (item.count / aggregates.totalSessions) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/5 bg-forest-darker/60 p-6">
              <h2 className="text-xl font-semibold">Skip rate by node</h2>
              <div className="mt-5 space-y-4">
                {(aggregates.skipRateByNode || []).map((item) => (
                  <div key={item.nodeKey}>
                    <div className="flex items-center justify-between text-sm text-forest-light-gray">
                      <span>{item.nodeKey}</span>
                      <span>{item.count} skips</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${Math.min(100, (item.rate || 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {!(aggregates.skipRateByNode || []).length && (
                  <p className="text-sm text-forest-gray">No skipped nodes in the current filtered set.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {(detailLoading || detail) && (
          <section className="rounded-[32px] border border-white/5 bg-forest-darker/70 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald mb-2">Session drilldown</p>
                <h2 className="text-2xl font-semibold">
                  {detail?.summary?.participantName || selectedSessionId || 'Loading session'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {detail && (
                  <ExportButton
                    label="Export session JSON"
                    content={JSON.stringify(detail, null, 2)}
                    filename={`mvp-session-${detail.summary.id}.json`}
                  />
                )}
                <Button type="button" variant="ghost" onClick={() => { setDetail(null); setSelectedSessionId('') }}>
                  <span className="flex items-center gap-2">
                    <X size={16} />
                    Close
                  </span>
                </Button>
              </div>
            </div>

            {detailLoading && (
              <div className="mt-6 rounded-2xl border border-white/5 bg-black/20 p-5 flex items-center gap-3 text-forest-light-gray">
                <Loader size={18} className="animate-spin text-forest-emerald" />
                Loading session detail...
              </div>
            )}

            {detail && (
              <div className="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
                <aside className="space-y-4">
                  <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
                    <h3 className="text-lg font-medium">Lifecycle summary</h3>
                    <div className="mt-4 space-y-2 text-sm text-forest-light-gray">
                      <p>Status: <span className="text-white">{detail.summary.status}</span></p>
                      <p>Current phase: <span className="text-white">{detail.summary.currentPhase}</span></p>
                      <p>Highest phase: <span className="text-white">{detail.summary.highestPhaseReached}</span></p>
                      <p>Completion reason: <span className="text-white">{detail.summary.completionReason}</span></p>
                      <p>Guided outcome: <span className="text-white">{detail.summary.guidedOutcome}</span></p>
                      <p>Airplane outcome: <span className="text-white">{detail.summary.airplaneOutcome}</span></p>
                      <p>Guided time: <span className="text-white">{formatDuration(detail.summary.waterTimeMs)}</span></p>
                      <p>Airplane used: <span className="text-white">{formatDuration(detail.summary.airplaneTimeUsedMs)}</span></p>
                      <p>Quiz score: <span className="text-white">{detail.summary.totalQuizScore}/{totalAssessmentQuestions}</span></p>
                      <p>Guided quiz: <span className="text-white">{detail.summary.guidedQuizScore ?? 0}/4</span></p>
                      <p>Free-form quiz: <span className="text-white">{detail.summary.freeformQuizScore ?? 0}/4</span></p>
                      <p>Created: <span className="text-white">{formatDateTime(detail.summary.createdAt)}</span></p>
                      <p>Last active: <span className="text-white">{formatDateTime(detail.summary.lastActiveAt)}</span></p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
                    <h3 className="text-lg font-medium">Node states</h3>
                    <div className="mt-4 space-y-3">
                      {(detail.detail.nodeProgress || []).map((node) => (
                        <div key={node.nodeKey} className="rounded-2xl border border-white/5 bg-white/5 p-4 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-white font-medium">{node.nodeKey}</span>
                            <span className="text-forest-light-gray">{node.status}</span>
                          </div>
                          <p className="mt-2 text-forest-gray">Mastery: {node.masteryScore}%</p>
                          <p className="text-forest-gray">Attempts: {node.attemptCount} | Interactions: {node.interactionCount}</p>
                          <p className="text-forest-gray">Started: {formatDateTime(node.startedAt)}</p>
                          <p className="text-forest-gray">Completed: {formatDateTime(node.completedAt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {detail.detail.surveyResponse && (
                    <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
                      <h3 className="text-lg font-medium">Survey</h3>
                      <div className="mt-4 space-y-2 text-sm text-forest-light-gray">
                        <p>Guided confidence before: <span className="text-white">{detail.detail.surveyResponse.guidedConfidenceBefore ?? '—'}</span></p>
                        <p>Guided confidence after: <span className="text-white">{detail.detail.surveyResponse.guidedConfidenceAfter ?? '—'}</span></p>
                        <p>Free-form confidence before: <span className="text-white">{detail.detail.surveyResponse.freeformConfidenceBefore ?? '—'}</span></p>
                        <p>Free-form confidence after: <span className="text-white">{detail.detail.surveyResponse.freeformConfidenceAfter ?? '—'}</span></p>
                        <p>Clarity rating: <span className="text-white">{detail.detail.surveyResponse.clarityRating ?? '—'}</span></p>
                        <p>Engagement rating: <span className="text-white">{detail.detail.surveyResponse.engagementRating ?? '—'}</span></p>
                        <p>Effectiveness rating: <span className="text-white">{detail.detail.surveyResponse.effectivenessRating ?? '—'}</span></p>
                        <p>Guided usefulness: <span className="text-white">{detail.detail.surveyResponse.guidedUsefulness ?? '—'}</span></p>
                        <p>Free-form usefulness: <span className="text-white">{detail.detail.surveyResponse.freeformUsefulness ?? '—'}</span></p>
                        <p>Clearer system: <span className="text-white">{detail.detail.surveyResponse.clearerSystem || detail.detail.surveyResponse.clearerExplanations || '—'}</span></p>
                        <p>Preferred system: <span className="text-white">{detail.detail.surveyResponse.preferredSystem || detail.detail.surveyResponse.preferredModerateTopic || '—'}</span></p>
                        <p>Guided positive aspect: <span className="text-white">{detail.detail.surveyResponse.positiveAspectGuided || '—'}</span></p>
                        <p>Free-form positive aspect: <span className="text-white">{detail.detail.surveyResponse.positiveAspectFreeform || '—'}</span></p>
                      </div>
                    </div>
                  )}
                </aside>

                <div className="space-y-6">
                  <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
                    <h3 className="text-lg font-medium">Event timeline</h3>
                    <div className="mt-4 max-h-[260px] overflow-y-auto space-y-3">
                      {(detail.detail.eventLogs || []).map((event) => (
                        <div key={event.id} className="rounded-2xl border border-white/5 bg-white/5 p-4">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-white font-medium">{event.eventType}</span>
                            <span className="text-forest-gray">{formatDateTime(event.createdAt)}</span>
                          </div>
                          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-forest-emerald/80">{event.phase || 'no phase'}</p>
                          <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-forest-light-gray">{JSON.stringify(event.payload, null, 2)}</pre>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
                    <h3 className="text-lg font-medium">Guided node transcripts</h3>
                    <div className="mt-4 space-y-4">
                      {(detail.detail.nodeProgress || []).map((node) => (
                        <div key={node.nodeKey} className="rounded-2xl border border-white/5 bg-white/5 p-4">
                          <h4 className="font-medium text-white">{node.nodeKey}</h4>
                          <div className="mt-3 space-y-3">
                            {(node.messages || []).map((message) => (
                              <div key={message.id} className={`rounded-2xl px-4 py-3 ${message.role === 'user' ? 'bg-forest-emerald/20' : 'bg-black/20'}`}>
                                <p className="text-xs uppercase tracking-[0.2em] text-forest-emerald/80 mb-2">{message.role}</p>
                                <div className="prose prose-invert prose-sm max-w-none">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {message.content}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
                    <h3 className="text-lg font-medium">Airplane transcript</h3>
                    <div className="mt-4 space-y-3">
                      {(detail.detail.chatMessages || []).map((message) => (
                        <div key={message.id} className={`rounded-2xl px-4 py-3 ${message.role === 'user' ? 'bg-forest-emerald/20' : 'bg-black/20'}`}>
                          <p className="text-xs uppercase tracking-[0.2em] text-forest-emerald/80 mb-2">{message.role}</p>
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
                    <h3 className="text-lg font-medium">Assessment answers</h3>
                    <div className="mt-4 space-y-3">
                      {(detail.detail.assessmentAnswers || []).map((answer) => (
                        <div key={answer.questionKey} className="rounded-2xl border border-white/5 bg-white/5 p-4 text-sm">
                          <p className="text-white font-medium">{answer.questionKey}</p>
                          <p className="mt-2 text-forest-light-gray">Topic: {answer.topic}</p>
                          <p className="text-forest-light-gray">Selected: {answer.selectedOption}</p>
                          <p className="text-forest-light-gray">Correct: {answer.isCorrect ? 'Yes' : 'No'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

export default MVPAdmin
