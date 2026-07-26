import { createClient } from '@supabase/supabase-js'
import type { CandidateDatabase } from './candidate-schema'

let client: ReturnType<typeof createClient<CandidateDatabase>> | null = null

/** Proof-only client for a disposable database with candidate 057-063 installed. */
export const getKnowledgeGraphCandidateClient = () => {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) throw new Error('Missing SUPABASE_SECRET_KEY for candidate graph client')
  client = createClient<CandidateDatabase>(url, secretKey)
  return client
}
