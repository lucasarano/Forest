import { createStudyConfig, fetchV2AdminSummary } from './mvpV2Service'
import { DEFAULT_TIME_BUDGET_MS } from './sprint4/constants'

export const MVP_V2_ADMIN_PASSWORD_STORAGE_KEY = 'forest-mvp-v2-admin-password'

export const getStoredV2AdminPassword = () => sessionStorage.getItem(MVP_V2_ADMIN_PASSWORD_STORAGE_KEY) || ''
export const storeV2AdminPassword = (password) => sessionStorage.setItem(MVP_V2_ADMIN_PASSWORD_STORAGE_KEY, password)
export const clearStoredV2AdminPassword = () => sessionStorage.removeItem(MVP_V2_ADMIN_PASSWORD_STORAGE_KEY)

export const createV2StudyConfig = async ({ seedConcept, timeBudgetMs = DEFAULT_TIME_BUDGET_MS, password }) =>
  createStudyConfig({
    seedConcept,
    timeBudgetMs,
    password,
  })

export const fetchMvpV2AdminSummary = async (password) => fetchV2AdminSummary(password)
