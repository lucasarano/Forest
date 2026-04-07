import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const parseEnvFile = (filePath) => {
  const raw = readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

export const loadLocalEnv = (cwd = process.cwd()) => {
  const candidates = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
  ]

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      parseEnvFile(filePath)
    }
  }
}

