import { createClient } from '@supabase/supabase-js'
import { loadLocalEnv } from '../server/loadEnv.js'
loadLocalEnv()
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { error: e1 } = await s.from('tutor_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
const { error: e2 } = await s.from('tutor_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
console.log('events err:', e1?.message || 'ok', 'sessions err:', e2?.message || 'ok')
const { count: c1 } = await s.from('tutor_sessions').select('*', { count: 'exact', head: true })
const { count: c2 } = await s.from('tutor_events').select('*', { count: 'exact', head: true })
console.log('remaining sessions:', c1, 'events:', c2)
