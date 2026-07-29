import { resolveUserModelWithMeta } from '@/lib/models'
import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import { runCartographer } from '@/lib/agents/cartographer'
import { rederiveKnowledgeUnit } from './extractor'
import {
  embedCartographerText,
  embedTopicInputs,
  findTopicCandidates,
} from './topics'
import type { ExtractionObject } from './contract'
import type { TopicBackfillUnit } from './types'

export interface TopicBackfillResult {
  activatedVersion: string
  drainedJobs: number
  rederivedUnits: number
  assertion: Json
}

const activateV3 = async (): Promise<string> => {
  const { data, error } = await getAdminClient().rpc('activate_knowledge_topic_contract')
  if (error) throw new Error(error.message)
  if (data !== 'cartographer-single-claim-v3') {
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
  }))
}

const rederiveUnit = async (unit: TopicBackfillUnit): Promise<void> => {
  const resolved = await resolveUserModelWithMeta(
    { task: 'classification', quality: 'balanced' },
    unit.sourceActorId,
  )
  const embedding = await embedCartographerText(unit.claim)
  const candidates = await findTopicCandidates(unit.knowledgeAudienceId, embedding)
  const extracted = await rederiveKnowledgeUnit(resolved.model, unit, candidates)
  if (extracted.kind === 'failed') {
    throw new Error(`knowledge_topic_backfill_${extracted.failure}:${extracted.errorClass}`)
  }
  if (!('topics' in extracted.object)) {
    throw new Error('knowledge_topic_backfill_contract_not_v3')
  }
  const object = extracted.object as ExtractionObject
  if (object.claim !== unit.claim || object.aboutPersonId !== null) {
    throw new Error('knowledge_topic_backfill_changed_immutable_claim')
  }
  const topicInputs = await embedTopicInputs(object.topics)
  const { error } = await getAdminClient().rpc('write_knowledge_topic_backfill', {
    p_unit_id: unit.unitId,
    p_raw_output: object,
    p_knowledge_type: object.knowledgeType,
    p_attention_score: object.attentionScore,
    p_embedding: `[${embedding.join(',')}]`,
    p_topic_inputs: topicInputs,
  })
  if (error) throw new Error(error.message)
}

export const runTopicBackfill = async (): Promise<TopicBackfillResult> => {
  const activatedVersion = await activateV3()
  let drainedJobs = 0
  for (;;) {
    const jobs = await listOldJobs()
    if (jobs.length === 0) break
    for (const job of jobs) {
      const result = await runCartographer({
        userId: job.requesting_user_id,
        sourceEventId: job.source_event_id,
      })
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
