import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { loadLocalEnv } from './loadEnv.js'

loadLocalEnv()

const hashToken = (token) => createHash('sha256').update(token).digest('hex')

let supabaseClient = null
const getSupabase = () => {
  if (supabaseClient) return supabaseClient
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  supabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return supabaseClient
}

const mapCourse = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapHomework = (row) => ({
  id: row.id,
  courseId: row.course_id,
  title: row.title,
  description: row.description || '',
  orderIndex: typeof row.order_index === 'number' ? row.order_index : 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapConcept = (row) => ({
  id: row.id,
  homeworkId: row.homework_id,
  title: row.title,
  seedQuestion: row.seed_question,
  conceptSummary: row.concept_summary || '',
  conceptGoals: Array.isArray(row.concept_goals) ? row.concept_goals.filter((g) => typeof g === 'string' && g.trim()) : [],
  timeBudgetMs: typeof row.time_budget_ms === 'number' ? row.time_budget_ms : 0,
  orderIndex: typeof row.order_index === 'number' ? row.order_index : 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/* ── Courses / Homeworks / Concepts ───────────────────────────── */

export const createCourse = async ({ title, description = '' }) => {
  const { data, error } = await getSupabase()
    .from('courses')
    .insert({ title, description })
    .select('*')
    .single()
  if (error || !data) throw error || new Error('Could not create course.')
  return mapCourse(data)
}

export const listCourses = async () => {
  const { data, error } = await getSupabase()
    .from('courses')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapCourse)
}

export const getCourse = async (id) => {
  const { data, error } = await getSupabase()
    .from('courses')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapCourse(data) : null
}

export const updateCourse = async ({ id, title, description }) => {
  const patch = {}
  if (typeof title === 'string') patch.title = title
  if (typeof description === 'string') patch.description = description
  if (Object.keys(patch).length === 0) return getCourse(id)
  const { data, error } = await getSupabase()
    .from('courses')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) throw error || new Error('Could not update course.')
  return mapCourse(data)
}

export const deleteCourse = async (id) => {
  const { error } = await getSupabase().from('courses').delete().eq('id', id)
  if (error) throw error
}

export const createHomework = async ({ courseId, title, description = '' }) => {
  const { data, error } = await getSupabase()
    .from('homeworks')
    .insert({ course_id: courseId, title, description })
    .select('*')
    .single()
  if (error || !data) throw error || new Error('Could not create homework.')
  return mapHomework(data)
}

export const listHomeworksByCourse = async (courseId) => {
  const { data, error } = await getSupabase()
    .from('homeworks')
    .select('*')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true })
  if (error) throw error
  return (data || []).map(mapHomework)
}

export const getHomework = async (id) => {
  const { data, error } = await getSupabase()
    .from('homeworks')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapHomework(data) : null
}

export const updateHomework = async ({ id, title, description }) => {
  const patch = {}
  if (typeof title === 'string') patch.title = title
  if (typeof description === 'string') patch.description = description
  if (Object.keys(patch).length === 0) return getHomework(id)
  const { data, error } = await getSupabase()
    .from('homeworks')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) throw error || new Error('Could not update homework.')
  return mapHomework(data)
}

export const deleteHomework = async (id) => {
  const { error } = await getSupabase().from('homeworks').delete().eq('id', id)
  if (error) throw error
}

export const createConceptRecord = async ({
  homeworkId,
  title,
  seedQuestion,
  conceptSummary = '',
  conceptGoals = [],
  timeBudgetMs,
}) => {
  const goals = Array.isArray(conceptGoals)
    ? conceptGoals.map((g) => `${g}`.trim()).filter(Boolean)
    : []
  const { data, error } = await getSupabase()
    .from('concepts')
    .insert({
      homework_id: homeworkId,
      title,
      seed_question: seedQuestion,
      concept_summary: conceptSummary,
      concept_goals: goals,
      time_budget_ms: timeBudgetMs,
    })
    .select('*')
    .single()
  if (error || !data) throw error || new Error('Could not create concept.')
  return mapConcept(data)
}

export const listConceptsByHomework = async (homeworkId) => {
  const { data, error } = await getSupabase()
    .from('concepts')
    .select('*')
    .eq('homework_id', homeworkId)
    .order('order_index', { ascending: true })
  if (error) throw error
  return (data || []).map(mapConcept)
}

export const getConcept = async (id) => {
  const { data, error } = await getSupabase()
    .from('concepts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapConcept(data) : null
}

export const updateConcept = async ({ id, title, seedQuestion, conceptSummary, conceptGoals, timeBudgetMs }) => {
  const patch = {}
  if (typeof title === 'string') patch.title = title
  if (typeof seedQuestion === 'string') patch.seed_question = seedQuestion
  if (typeof conceptSummary === 'string') patch.concept_summary = conceptSummary
  if (Array.isArray(conceptGoals)) {
    patch.concept_goals = conceptGoals.map((g) => `${g}`.trim()).filter(Boolean)
  }
  if (typeof timeBudgetMs === 'number' && Number.isFinite(timeBudgetMs) && timeBudgetMs > 0) {
    patch.time_budget_ms = timeBudgetMs
  }
  if (Object.keys(patch).length === 0) return getConcept(id)
  const { data, error } = await getSupabase()
    .from('concepts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) throw error || new Error('Could not update concept.')
  return mapConcept(data)
}

export const deleteConcept = async (id) => {
  const { error } = await getSupabase().from('concepts').delete().eq('id', id)
  if (error) throw error
}

export const fetchCatalog = async () => {
  const supabase = getSupabase()
  const [coursesRes, homeworksRes, conceptsRes] = await Promise.all([
    supabase.from('courses').select('*').order('created_at', { ascending: false }),
    supabase.from('homeworks').select('*').order('order_index', { ascending: true }),
    supabase.from('concepts').select('id, homework_id, title, order_index').order('order_index', { ascending: true }),
  ])
  if (coursesRes.error) throw coursesRes.error
  if (homeworksRes.error) throw homeworksRes.error
  if (conceptsRes.error) throw conceptsRes.error

  const conceptsByHomework = new Map()
  for (const row of conceptsRes.data || []) {
    const list = conceptsByHomework.get(row.homework_id) || []
    list.push({ id: row.id, title: row.title, orderIndex: row.order_index || 0 })
    conceptsByHomework.set(row.homework_id, list)
  }

  const homeworksByCourse = new Map()
  for (const row of homeworksRes.data || []) {
    const list = homeworksByCourse.get(row.course_id) || []
    list.push({
      id: row.id,
      title: row.title,
      description: row.description || '',
      orderIndex: row.order_index || 0,
      concepts: conceptsByHomework.get(row.id) || [],
    })
    homeworksByCourse.set(row.course_id, list)
  }

  return {
    courses: (coursesRes.data || []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      homeworks: homeworksByCourse.get(row.id) || [],
    })),
  }
}

/* ── Tutor Sessions ───────────────────────────────────────────── */

export const createTutorSession = async ({ sessionToken, conceptId, studentName, state }) => {
  const { data, error } = await getSupabase()
    .from('tutor_sessions')
    .insert({
      concept_id: conceptId,
      student_name: studentName || '',
      session_token_hash: hashToken(sessionToken),
      state,
      turn_index: state.turnIndex || 0,
      status: state.status || 'active',
    })
    .select('*')
    .single()
  if (error || !data) throw error || new Error('Could not create tutor session.')
  return { id: data.id, state: data.state }
}

export const getTutorSessionByToken = async (sessionToken) => {
  const { data, error } = await getSupabase()
    .from('tutor_sessions')
    .select('*')
    .eq('session_token_hash', hashToken(sessionToken))
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    conceptId: data.concept_id,
    studentName: data.student_name,
    state: data.state,
    turnIndex: data.turn_index,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    lastActiveAt: data.last_active_at,
  }
}

export const updateTutorSession = async ({ sessionToken, state }) => {
  const now = new Date().toISOString()
  const { data, error } = await getSupabase()
    .from('tutor_sessions')
    .update({
      state,
      turn_index: state.turnIndex || 0,
      status: state.status || 'active',
      updated_at: now,
      last_active_at: now,
    })
    .eq('session_token_hash', hashToken(sessionToken))
    .select('*')
    .single()
  if (error || !data) throw error || new Error('Could not update tutor session.')
  return { id: data.id, state: data.state, turnIndex: data.turn_index, status: data.status }
}

export const insertTutorEvent = async ({ sessionId, eventType, payload = {} }) => {
  const { error } = await getSupabase()
    .from('tutor_events')
    .insert({ session_id: sessionId, event_type: eventType, payload })
  if (error) throw error
}

export const listTutorSessionsSummary = async () => {
  const { data, error } = await getSupabase()
    .from('tutor_sessions')
    .select('id, concept_id, student_name, status, turn_index, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data || []
}

/* ── Teacher analytics ─────────────────────────────────────────── */

export const listConceptsForScope = async ({ scope, id }) => {
  const supabase = getSupabase()
  if (scope === 'concept') {
    const { data, error } = await supabase
      .from('concepts')
      .select('id, homework_id, title')
      .eq('id', id)
    if (error) throw error
    return data || []
  }
  if (scope === 'homework') {
    const { data, error } = await supabase
      .from('concepts')
      .select('id, homework_id, title')
      .eq('homework_id', id)
    if (error) throw error
    return data || []
  }
  if (scope === 'course') {
    const { data: hws, error: hwErr } = await supabase
      .from('homeworks')
      .select('id')
      .eq('course_id', id)
    if (hwErr) throw hwErr
    const hwIds = (hws || []).map((h) => h.id)
    if (hwIds.length === 0) return []
    const { data, error } = await supabase
      .from('concepts')
      .select('id, homework_id, title')
      .in('homework_id', hwIds)
    if (error) throw error
    return data || []
  }
  throw new Error(`Unknown scope "${scope}"`)
}

export const listSessionsByScope = async ({ scope, id }) => {
  const concepts = await listConceptsForScope({ scope, id })
  if (concepts.length === 0) return { sessions: [], concepts: [] }
  const conceptIds = concepts.map((c) => c.id)
  const { data, error } = await getSupabase()
    .from('tutor_sessions')
    .select('id, concept_id, student_name, status, turn_index, state, created_at, updated_at, last_active_at')
    .in('concept_id', conceptIds)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return { sessions: data || [], concepts }
}

export const getSessionDetail = async (sessionId) => {
  const supabase = getSupabase()
  const { data: session, error: sErr } = await supabase
    .from('tutor_sessions')
    .select('id, concept_id, student_name, status, turn_index, state, created_at, updated_at, last_active_at')
    .eq('id', sessionId)
    .maybeSingle()
  if (sErr) throw sErr
  if (!session) return null
  const { data: events, error: eErr } = await supabase
    .from('tutor_events')
    .select('id, event_type, payload, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(2000)
  if (eErr) throw eErr
  return { session, events: events || [] }
}

export const getAllEventsForSessions = async (sessionIds) => {
  if (!sessionIds?.length) return []
  const { data, error } = await getSupabase()
    .from('tutor_events')
    .select('id, session_id, event_type, payload, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true })
    .limit(10000)
  if (error) throw error
  return data || []
}

export const getConceptsByIds = async (ids) => {
  if (!ids?.length) return []
  const { data, error } = await getSupabase()
    .from('concepts')
    .select('id, title')
    .in('id', ids)
  if (error) throw error
  return data || []
}
