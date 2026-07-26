import { createKnowledgeRetrievalTools } from './knowledge-retrieval-tools'
import { createResearchRetrievalTools } from './research-retrieval-tools'
import { createTemporalRetrievalTool } from './temporal-retrieval-tool'
import type { ToolContext } from './tool-types'

/** Creates the agentic retrieval tool set bound to one request context. */
export const createRetrievalTools = (ctx: ToolContext) => ({
  ...createKnowledgeRetrievalTools(ctx),
  search_by_time: createTemporalRetrievalTool(ctx),
  ...createResearchRetrievalTools(ctx),
})

export type RetrievalTools = ReturnType<typeof createRetrievalTools>
