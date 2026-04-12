// Adapter registry - Maps component types to React adapters
// Add new adapters here as they're built

import type { ComponentType } from '@/lib/ui/components'
import type { FC } from 'react'

import { VoyagePickerAdapter } from './VoyagePickerAdapter'
import { ActionButtonsAdapter } from './ActionButtonsAdapter'
import { ProgressAdapter } from './ProgressAdapter'
import { EmailInputAdapter } from './EmailInputAdapter'
import { ConfirmationAdapter } from './ConfirmationAdapter'
import { ApiKeyInputAdapter } from './ApiKeyInputAdapter'
import { ModuleReviewAdapter } from './ModuleReviewAdapter'
import { DocumentUploadAdapter } from './DocumentUploadAdapter'
import { KnowledgeGraphAdapter } from './KnowledgeGraphAdapter'

// Placeholder for unimplemented adapters
const NotImplementedAdapter: FC<{ type?: string }> = ({ type }) => {
  if (process.env.NODE_ENV === 'development') {
    return (
      <div className="text-xs text-amber-500/70 font-mono p-2 border border-amber-500/20 rounded-sm bg-amber-500/5">
        [Component: {type ?? 'unknown'} - adapter not implemented]
      </div>
    )
  }
  return null
}

// Adapter type - accepts any props, specific adapters narrow internally
type AnyAdapter = FC<Record<string, unknown>>

// Registry of all component adapters
export const adapters: Record<ComponentType, AnyAdapter> = {
  voyage_picker: VoyagePickerAdapter as unknown as AnyAdapter,
  conversation_picker: () => <NotImplementedAdapter type="conversation_picker" />,
  create_voyage_form: () => <NotImplementedAdapter type="create_voyage_form" />,
  invite_card: () => <NotImplementedAdapter type="invite_card" />,
  confirmation: ConfirmationAdapter as unknown as AnyAdapter,
  action_buttons: ActionButtonsAdapter as unknown as AnyAdapter,
  progress: ProgressAdapter as unknown as AnyAdapter,
  email_input: EmailInputAdapter as unknown as AnyAdapter,
  api_key_input: ApiKeyInputAdapter as unknown as AnyAdapter,
  module_review: ModuleReviewAdapter as unknown as AnyAdapter,
  document_upload: DocumentUploadAdapter as unknown as AnyAdapter,
  knowledge_graph: KnowledgeGraphAdapter as unknown as AnyAdapter,
}

// Re-export individual adapters for direct use
export { VoyagePickerAdapter } from './VoyagePickerAdapter'
export { ActionButtonsAdapter } from './ActionButtonsAdapter'
export { ProgressAdapter } from './ProgressAdapter'
export { EmailInputAdapter } from './EmailInputAdapter'
export { ConfirmationAdapter } from './ConfirmationAdapter'
export { ApiKeyInputAdapter } from './ApiKeyInputAdapter'
export { ModuleReviewAdapter } from './ModuleReviewAdapter'
export { DocumentUploadAdapter } from './DocumentUploadAdapter'
export { KnowledgeGraphAdapter } from './KnowledgeGraphAdapter'
