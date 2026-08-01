import { resolveUserModelWithMeta } from '@/lib/models'
import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import { runCartographer } from '@/lib/agents/cartographer'
import { rederiveKnowledgeUnit } from './extractor'
import { CARTOGRAPHER_EXTRACTOR_VERSION } from './contract'
import {
  embedCartographerText,
  findTopicCandidates,
  parseVectorString,
  toTopicCandidateSnapshot,
  toTopicWriteInputs,
} from './topics'
import type { ExtractionObject } from './contract'
import type { TopicBackfillUnit } from './types'
import { matchKnowledgeTopics } from './topic-matcher'
import {
  isRetryableTopicError,
  TOPIC_BACKFILL_RETRY_EXHAUSTED,
  TOPIC_WRITE_MAX_ATTEMPTS,
  TopicCandidatesRetryableError,
} from './topic-retry'
import { runCartographerRetry, waitForCartographerRetry } from './retry'

export interface TopicBackfillResult {
  activatedVersion: string
  drainedJobs: number
  rederivedUnits: number
  assertion: Json
}

const activateCurrentContract = async (): Promise<string> => {
  const { data, error } = await getAdminClient().rpc('activate_knowledge_topic_contract')
  if (error) throw new Error(error.message)
  if (data !== CARTOGRAPHER_EXTRACTOR_VERSION) {
    throw new Error('knowledge_topic_activation_returned_wrong_version')
  }
  return data
}

const listOldJobs = async (): Promise<Array<{
  source_event_id: string
  requesting_user_id: string
}>> => {
  const { data, error } = await getAdminClient().rpc('list_knowledge_topic_backfill_jobs')
  if (error) throw new Error(error.message)
  return data ?? []
}

const recheckOldJob = async (
  sourceEventId: string,
): Promise<'terminal' | 'lease_held' | 'unclaimable'> => {
  const { data, error } = await getAdminClient()
    .from('knowledge_extraction_jobs')
    .select('state, lease_expires_at')
    .eq('source_event_id', sourceEventId)
    .neq('extractor_version', CARTOGRAPHER_EXTRACTOR_VERSION)
  if (error) throw new Error(error.message)
  const active = (data ?? []).find((job) => (
    job.state !== 'succeeded' && job.state !== 'no_claim'
  ))
  if (!active) return 'terminal'
  if (active.state === 'leased'
    && active.lease_expires_at
    && Date.parse(active.lease_expires_at) > Date.now()) {
    return 'lease_held'
  }
  return 'unclaimable'
}

const listUnits = async (): Promise<TopicBackfillUnit[]> => {
  const { data, error } = await getAdminClient().rpc('list_knowledge_topic_backfill_units')
  if (error) throw new Error(error.message)
  return (data ?? []).map((unit) => ({
    unitId: unit.unit_id,
    sourceEventId: unit.source_event_id,
    sourceContent: unit.source_content,
    sourceActorId: unit.source_actor_id,
    claim: unit.claim,
    knowledgeAudienceId: unit.knowledge_audience_id,
    embedding: unit.embedding,
  }))
}

const rederiveUnit = async (unit: TopicBackfillUnit): Promise<void> => {
  const resolved = await resolveUserModelWithMeta(
    { task: 'classification', quality: 'balanced' },
    unit.sourceActorId,
  )
  const embedding = unit.embedding
    ? parseVectorString(unit.embedding)
    : await embedCartographerText(unit.claim)
  const extracted = await rederiveKnowledgeUnit(resolved.model, unit)
  if (extracted.kind === 'failed') {
    throw new Error(`knowledge_topic_backfill_${extracted.failure}:${extracted.errorClass}`)
  }
  const object = extracted.object as ExtractionObject
  if (object.claim !== unit.claim || object.aboutPersonId !== null) {
    throw new Error('knowledge_topic_backfill_changed_immutable_claim')
  }
  await runCartographerRetry({
    maxAttempts: TOPIC_WRITE_MAX_ATTEMPTS,
    run: async () => {
      const candidates = await findTopicCandidates(
        CARTOGRAPHER_EXTRACTOR_VERSION,
        unit.knowledgeAudienceId,
        embedding,
        unit.unitId,
      )
      const matched = await matchKnowledgeTopics(resolved.model, unit.claim, candidates)
      if (matched.kind === 'failed') {
        throw new Error(`knowledge_topic_backfill_${matched.failure}:${matched.errorClass}`)
      }
      const rawOutput = { ...object, topics: matched.topics }
      const { error } = await getAdminClient().rpc(
        'write_knowledge_topic_identity_backfill',
        {
          p_unit_id: unit.unitId,
          p_raw_output: rawOutput,
          p_knowledge_type: object.knowledgeType,
          p_attention_score: object.attentionScore,
          p_embedding: `[${embedding.join(',')}]`,
          p_topic_candidate_snapshot: toTopicCandidateSnapshot(candidates),
          p_topic_inputs: toTopicWriteInputs(matched.topics),
        },
      )
      if (error && isRetryableTopicError(error.message)) {
        throw new TopicCandidatesRetryableError()
      }
      if (error) throw new Error(error.message)
    },
    isRetryable: (error) => error instanceof TopicCandidatesRetryableError,
    wait: waitForCartographerRetry,
    onExhausted: async () => {
      throw new Error(TOPIC_BACKFILL_RETRY_EXHAUSTED)
    },
  })
}

export const runTopicBackfill = async (): Promise<TopicBackfillResult> => {
  const activatedVersion = await activateCurrentContract()
  let drainedJobs = 0
  for (;;) {
    const jobs = await listOldJobs()
    if (jobs.length === 0) break
    for (const job of jobs) {
      const result = await runCartographer({
        userId: job.requesting_user_id,
        sourceEventId: job.source_event_id,
      })
      if (result.kind === 'no_job' || result.kind === 'relation_completed') {
        const state = await recheckOldJob(job.source_event_id)
        if (state === 'terminal') continue
        if (state === 'lease_held') {
          await waitForCartographerRetry(5)
          continue
        }
      }
      if (result.kind !== 'completed'
        || (result.outcome !== 'succeeded' && result.outcome !== 'no_claim')) {
        throw new Error(`knowledge_topic_old_job_not_terminal:${job.source_event_id}`)
      }
      if (result.kind === 'completed') drainedJobs++
    }
  }
  let rederivedUnits = 0
  for (;;) {
    const units = await listUnits()
    if (units.length === 0) break
    for (const unit of units) {
      await rederiveUnit(unit)
      rederivedUnits++
    }
  }
  const { data: assertion, error } = await getAdminClient()
    .rpc('assert_knowledge_topic_backfill_complete')
  if (error) throw new Error(error.message)
  return { activatedVersion, drainedJobs, rederivedUnits, assertion }
}
