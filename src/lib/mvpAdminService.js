import { supabase } from './supabase'

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const MVP_ADMIN_PASSWORD_STORAGE_KEY = 'forest-mvp-admin-password'

const invokeAdminFunction = async (name, body) => {
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

const invokeAdminFunctionWithFallback = async (names, body) => {
  let lastError = null

  for (const name of names) {
    try {
      return await invokeAdminFunction(name, body)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Could not reach any MVP admin endpoint.')
}

export const getStoredMvpAdminPassword = () => sessionStorage.getItem(MVP_ADMIN_PASSWORD_STORAGE_KEY) || ''
export const storeMvpAdminPassword = (password) => sessionStorage.setItem(MVP_ADMIN_PASSWORD_STORAGE_KEY, password)
export const clearStoredMvpAdminPassword = () => sessionStorage.removeItem(MVP_ADMIN_PASSWORD_STORAGE_KEY)

export const fetchMvpAdminSummary = async (password, filters) =>
  invokeAdminFunction('mvp-admin-summary', { password, filters })

export const fetchMvpAdminDetail = async (password, sessionId) =>
  invokeAdminFunctionWithFallback(['mvp-admin-session-detail', 'mvp-admin-detail'], { password, sessionId })
