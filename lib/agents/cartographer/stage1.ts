import { generateObject } from 'ai'
import { z } from 'zod'
import { log } from '@/lib/debug/logger'
import { resolveUserModel } from '@/lib/models'
import type { KnowledgeType } from '@/lib/knowledge/events'
import type { KnowledgeEventRow, Stage1Assessment } from './types'

const STAGE1_PROMPT = `You are the Cartographer for Voyager. You classify knowledge events from an ongoing conversation.

For EACH event, determine:

1. knowledge_type: one of "domain", "operational", or "preference"
   - "domain": facts, concepts, decisions, insights, technical knowledge
   - "operational": tasks, processes, what happened, meeting notes, project updates
   - "preference": user likes, dislikes, habits, communication preferences

2. attention_score: 0.0 to 1.0 (continuous)
   - For domain/operational: importance (1.0 = always surface, 0.0 = deep search only)
   - Substantive domain knowledge -> 0.5-0.9 based on likely future relevance
   - Trivial messages ("ok", "thanks", acknowledgments) -> 0.1 or less

   PREFERENCE DETECTION RULES:
   - Explicit preferences: user directly states a preference ("remember X", "always call me Y", "I prefer Z", "don't ever W"). These get attention 1.0.
   - Implicit preferences: observed from patterns or inferred from behaviour (user consistently uses short messages -> prefers brevity). These get attention 0.5.
   - When unsure if explicit or implicit, default to implicit (0.5). Promotion is cheap, demotion loses trust.

3. context_snippet: A declarative statement about the knowledge itself. This is prepended before re-embedding and DRAMATICALLY improves retrieval.

   QUALITY RULES:
   - GOOD: Declarative statements about the knowledge. "Isaac prefers direct communication." "The auth system uses JWT with 24h expiry." "Project deadline is March 15."
   - BAD: Descriptions of the conversation. "User mentioned during onboarding." "Discussed in architecture meeting." "User said this while chatting."
   - The snippet should stand alone as a useful fact, not describe when/how it was learned.

   PREFIX RULES for preferences:
   - Explicit preferences (attention 1.0): prefix with "Explicit preference: "
   - Implicit/observed preferences (attention < 1.0): prefix with "Observed preference: "
   - Non-preference types: no prefix required, just write the declarative statement.

Output a JSON array. One entry per event. Use the event IDs exactly as provided.`

const stage1Schema = z.object({
  assessments: z.array(z.object({
    eventId: z.string(),
    knowledgeType: z.enum(['domain', 'operational', 'preference']),
    attentionScore: z.number().describe('0.0 to 1.0'),
    contextSnippet: z.string(),
  })),
})

export const runStage1 = async (
  transcript: string,
  events: KnowledgeEventRow[],
  userId: string,
): Promise<Stage1Assessment[]> => {
  if (events.length === 0) return []

  const eventList = events
    .map((event) => `[${event.event_id}]: ${event.content.slice(0, 500)}`)
    .join('\n\n')
  const userPrompt = `## Conversation Transcript
${transcript}

## Knowledge Events to Assess
${eventList}

Assess each event and return structured output.`

  try {
    const { object } = await generateObject({
      model: await resolveUserModel({ task: 'chat', quality: 'balanced' }, userId),
      system: STAGE1_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      schema: stage1Schema,
      maxOutputTokens: 4096,
    })

    return object.assessments.map((assessment) => ({
      eventId: assessment.eventId,
      knowledgeType: assessment.knowledgeType as KnowledgeType,
      attentionScore: assessment.attentionScore,
      contextSnippet: assessment.contextSnippet,
    }))
  } catch (error) {
    log.agent('Stage 1 structured output failed', { error: String(error) }, 'error')
    return []
  }
}
