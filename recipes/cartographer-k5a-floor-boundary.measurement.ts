import { createServer, type Server } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getCandidateClient: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/knowledge/kernel/candidate-client', () => ({
  getKnowledgeGraphCandidateClient: mocks.getCandidateClient,
}))

import {
  retrieveKnowledgeGraphClaims,
} from '@/lib/knowledge/kernel/boundary'

interface BoundaryTiming {
  readonly outcome: string
  readonly authMs: number
  readonly clientAcquisitionMs: number
  readonly transportMs: number
  readonly parseMs: number
  readonly beforeFloorMs: number
  readonly floorWaitMs: number
  readonly totalMs: number
}

const BOUNDARY_TIMING_MARK = 'voyager.knowledge-graph-boundary'

const VIEWER_ID = '74000000-0000-4000-8000-000000000001'
const AUTHORITY_ID = '74000000-0000-4000-8000-000000000002'
const CLAIMS = Array.from({ length: 8 }, (_, index) => ({
  knowledgeUnitId: `74000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`,
  claim: `Clean boundary measurement claim ${index + 1}.`,
  sourceEventId: `74000000-0000-4000-8002-${String(index + 1).padStart(12, '0')}`,
  sourceContent: `Clean boundary measurement source ${index + 1}.`,
  knowledgeType: 'domain',
  attentionScore: 0.7,
  tensions: [],
}))

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length

const sampleStddev = (values: readonly number[]): number => {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce(
    (sum, value) => sum + (value - average) ** 2,
    0,
  ) / (values.length - 1))
}

const round = (value: number): number => Number(value.toFixed(3))

describe('K5a clean boundary-overhead measurement', () => {
  let server: Server
  let origin: string

  beforeAll(async () => {
    server = createServer((request, response) => {
      request.resume()
      response.setHeader('Content-Type', 'application/json')
      if (request.url === '/auth/v1/user') {
        response.end(JSON.stringify({
          id: VIEWER_ID,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'k5a-floor@example.invalid',
        }))
        return
      }
      if (request.url === '/rest/v1/rpc/retrieve_knowledge_graph_claims_v3') {
        response.end(JSON.stringify({ claims: CLAIMS, truncated: false }))
        return
      }
      response.statusCode = 404
      response.end(JSON.stringify({ message: 'not found' }))
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('K5a measurement server did not bind a TCP port')
    origin = `http://127.0.0.1:${address.port}`

    mocks.requireAuth.mockImplementation(async () => {
      const authClient = createClient(origin, 'fixture-anon-key', {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data, error } = await authClient.auth.getUser('fixture-access-token')
      if (error || !data.user) throw new Error('local auth measurement failed')
      return data.user.id
    })
    let candidateClient: ReturnType<typeof createClient> | null = null
    mocks.getCandidateClient.mockImplementation(() => {
      if (!candidateClient) {
        candidateClient = createClient(origin, 'fixture-service-key', {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      }
      return candidateClient
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  })

  it('measures the real boundary phases over loopback Supabase HTTP', async () => {
    const observations: BoundaryTiming[] = []
    const run = async (): Promise<void> => {
      const result = await retrieveKnowledgeGraphClaims(
        { kind: 'person', authorityId: AUTHORITY_ID },
        {},
      )
      expect(result.outcome).toBe('success')
      if (result.outcome === 'success') expect(result.claims).toHaveLength(8)
      const entries = performance.getEntriesByName(BOUNDARY_TIMING_MARK)
      const entry = entries.at(-1) as PerformanceMark | undefined
      if (!entry?.detail) throw new Error('boundary timing mark missing')
      observations.push(entry.detail as BoundaryTiming)
      performance.clearMarks(BOUNDARY_TIMING_MARK)
    }

    await run()
    const coldClientAcquisitionMs = observations[0].clientAcquisitionMs
    for (let index = 0; index < 5; index += 1) await run()
    observations.length = 0
    for (let index = 0; index < 30; index += 1) await run()

    const phaseOverhead = observations.map((sample) =>
      sample.authMs + sample.clientAcquisitionMs
      + sample.transportMs + sample.parseMs)
    expect(observations).toHaveLength(30)
    expect(observations.every((sample) => sample.outcome === 'success')).toBe(true)
    expect(observations.every((sample) => sample.floorWaitMs > 0)).toBe(true)

    const report = {
      sample_count: observations.length,
      transport_shape: 'loopback_supabase_http_without_database_execution',
      claims_parsed_per_sample: CLAIMS.length,
      cold_client_acquisition_ms: round(coldClientAcquisitionMs),
      auth_p95_ms: round(percentile(observations.map((sample) => sample.authMs), 0.95)),
      client_acquisition_p95_ms: round(percentile(
        observations.map((sample) => sample.clientAcquisitionMs), 0.95,
      )),
      transport_p95_ms: round(percentile(
        observations.map((sample) => sample.transportMs), 0.95,
      )),
      parse_p95_ms: round(percentile(
        observations.map((sample) => sample.parseMs), 0.95,
      )),
      phase_overhead_p95_ms: round(percentile(phaseOverhead, 0.95)),
      phase_overhead_sample_stddev_ms: round(sampleStddev(phaseOverhead)),
      before_floor_p95_ms: round(percentile(
        observations.map((sample) => sample.beforeFloorMs), 0.95,
      )),
      total_p95_ms: round(percentile(
        observations.map((sample) => sample.totalMs), 0.95,
      )),
    }
    process.stdout.write(`K5A_FLOOR_BOUNDARY_MEASUREMENT:${JSON.stringify(report)}\n`)
  })
})
