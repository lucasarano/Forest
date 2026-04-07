import { supabase } from './supabase'

export const MVP_TOKEN_STORAGE_KEY = 'forest-mvp-session-token'
const MVP_CACHE_PREFIX = 'forest-mvp-session-cache:'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const invokeMvpFunction = async (name, body) => {
  const headers = supabaseAnonKey
    ? {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      }
    : {}

  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers,
  })

  if (error) {
    throw new Error(error.message || `Could not reach ${name}.`)
  }

  if (data?.error) {
    throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
  }

  return data
}

const invokeMvpFunctionWithFallback = async (names, body) => {
  let lastError = null

  for (const name of names) {
    try {
      return await invokeMvpFunction(name, body)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Could not reach any MVP session endpoint.')
}

export const getStoredMvpToken = () => localStorage.getItem(MVP_TOKEN_STORAGE_KEY) || ''
export const storeMvpToken = (token) => localStorage.setItem(MVP_TOKEN_STORAGE_KEY, token)
export const clearStoredMvpToken = () => localStorage.removeItem(MVP_TOKEN_STORAGE_KEY)
export const getMvpCacheKey = (token) => `${MVP_CACHE_PREFIX}${token}`

export const getStoredMvpCache = (token) => {
  if (!token) return null
  try {
    const raw = localStorage.getItem(getMvpCacheKey(token))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const storeMvpCache = (token, value) => {
  if (!token) return
  localStorage.setItem(getMvpCacheKey(token), JSON.stringify(value))
}

export const clearStoredMvpCache = (token) => {
  if (!token) return
  localStorage.removeItem(getMvpCacheKey(token))
}

export const startMvpSession = async (name, email) =>
  invokeMvpFunctionWithFallback(['mvp-session-bootstrap', 'mvp-load-session', 'mvp-create-session'], { name, email })

export const loadMvpSession = async (token) =>
  invokeMvpFunctionWithFallback(['mvp-session-bootstrap', 'mvp-load-session'], { token })

export const saveMvpProgress = async (token, payload) =>
  invokeMvpFunctionWithFallback(['mvp-sync', 'mvp-progress-sync', 'mvp-save-progress'], { token, ...payload })

export const submitMvpAssessment = async (token, answers, scores) =>
  invokeMvpFunctionWithFallback(['mvp-assessment-submit', 'mvp-submit-assessment'], {
    token,
    answers,
    totalQuizScore: scores?.totalQuizScore ?? 0,
    guidedQuizScore: scores?.guidedQuizScore ?? 0,
    freeformQuizScore: scores?.freeformQuizScore ?? 0,
  })

export const submitMvpSurvey = async (token, survey) =>
  invokeMvpFunctionWithFallback(['mvp-finish', 'mvp-survey-finish', 'mvp-survey-submit', 'mvp-submit-survey'], { token, ...survey })
