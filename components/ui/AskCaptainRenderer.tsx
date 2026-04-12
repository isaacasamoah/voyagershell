// AskCaptainRenderer - Renders ask_captain tool calls inline in the chat stream
// Bridges AI SDK DynamicToolUIPart → InlineComponent adapters
//
// The ask_captain tool input has a discriminated union on `type`:
//   email_input | conversation_picker | voyage_picker | confirmation
//
// This component maps each type to its adapter, handling:
// - Active state (awaiting user input)
// - Resolved state (user has interacted, show collapsed summary)
// - sendMagicLink passthrough for email_input (D16: client-side immediate)

'use client'

import { useState, useCallback } from 'react'
import { EmailInputAdapter } from './composition/adapters/EmailInputAdapter'
import { ConfirmationAdapter } from './composition/adapters/ConfirmationAdapter'
import { VoyagePickerAdapter } from './composition/adapters/VoyagePickerAdapter'
import { ApiKeyInputAdapter } from './composition/adapters/ApiKeyInputAdapter'
import { ModuleReviewAdapter } from './composition/adapters/ModuleReviewAdapter'
import { DocumentUploadAdapter } from './composition/adapters/DocumentUploadAdapter'
import { KnowledgeGraphAdapter } from './composition/adapters/KnowledgeGraphAdapter'
import { Text } from '@/components/ui/primitives'
import type { ComponentState, ComponentResolution } from '@/lib/ui/components'
import type { AskCaptainInput } from '@/lib/tools/captain'
import type { GraphPayload } from '@/lib/knowledge/graph'

// Parse voyage picker result from tool execution (server-side fetched)
const parseVoyagePickerResult = (result: unknown): {
  voyages: Array<{ slug: string; name: string; role?: string }>
  currentSlug: string | null
} | null => {
  if (typeof result !== 'string') return null
  try {
    const parsed = JSON.parse(result)
    if (parsed?.rendered && Array.isArray(parsed.voyages)) {
      return { voyages: parsed.voyages, currentSlug: parsed.currentSlug ?? null }
    }
  } catch { /* not JSON — plain text message (e.g. "no voyages") */ }
  return null
}

interface AskCaptainRendererProps {
  /** The tool call input from the AI SDK dynamic-tool part */
  input: AskCaptainInput
  /** The tool call state from AI SDK */
  toolState: string
  /** The tool execution result (server-side data for voyage_picker) */
  toolResult?: unknown
  /** Unique tool call ID */
  toolCallId: string
  /** Send magic link (from useAuth) */
  sendMagicLink?: (email: string) => Promise<{ success: boolean; error?: string }>
  /** Send a message as the user (for component interactions) */
  onSendMessage: (text: string) => void
  /** Switch voyage context on the client (voyage_picker side effect) */
  onVoyageSwitch?: (slug: string) => void
  /** Graph payload from sibling show_knowledge_graph tool result (knowledge_graph only) */
  graphPayload?: GraphPayload
}

export const AskCaptainRenderer = ({
  input,
  toolState,
  toolResult,
  toolCallId,
  sendMagicLink,
  onSendMessage,
  onVoyageSwitch,
  graphPayload,
}: AskCaptainRendererProps) => {
  const [componentState, setComponentState] = useState<ComponentState>('active')
  const [resolution, setResolution] = useState<ComponentResolution | undefined>()

  // Resolve component and send result as next user message
  const handleAction = useCallback((action: string, data?: unknown) => {
    if (componentState !== 'active') return

    switch (input.type) {
      case 'email_input': {
        if (action === 'email_submitted' && typeof data === 'string') {
          setComponentState('resolved')
          setResolution({
            action: 'submitted',
            value: data,
            label: data,
          })
          // Send email as user message so Voyager knows
          onSendMessage(`My email is ${data}`)
        }
        break
      }
      case 'confirmation': {
        if (action === 'confirmation_response') {
          const approved = data === true
          setComponentState('resolved')
          setResolution({
            action: approved ? 'confirmed' : 'cancelled',
            value: approved,
            label: approved ? 'Confirmed' : 'Cancelled',
          })
          onSendMessage(approved ? 'Yes' : 'No')
        }
        break
      }
      case 'voyage_picker': {
        if (typeof data === 'string') {
          const pickerData = parseVoyagePickerResult(toolResult)
          const voyage = pickerData?.voyages.find(v => v.slug === data)
          setComponentState('resolved')
          setResolution({
            action: 'selected',
            value: data,
            label: voyage?.name ?? data,
          })
          // Switch client state first, then notify Voyager
          onVoyageSwitch?.(data)
          onSendMessage(`Switch to ${voyage?.name ?? data}`)
        }
        break
      }
      case 'conversation_picker': {
        if (typeof data === 'string') {
          const conv = input.conversations?.find(c => c.id === data)
          setComponentState('resolved')
          setResolution({
            action: 'selected',
            value: data,
            label: conv?.title ?? 'conversation',
          })
          onSendMessage(`Resume conversation: ${conv?.title ?? data}`)
        }
        break
      }
      case 'api_key_input': {
        if (action === 'key_saved') {
          const d = data as { provider?: string; purpose?: string; hint?: string } | undefined
          const label = d
            ? `Saved ${d.provider} ${d.purpose} key (****${d.hint})`
            : 'Key saved'
          setComponentState('resolved')
          setResolution({
            action: 'key_saved',
            value: d,
            label,
          })
        }
        break
      }
      case 'module_review': {
        if (action === 'module_review_response') {
          const installed = data === 'install'
          setComponentState('resolved')
          setResolution({
            action: installed ? 'install' : 'cancel',
            value: data,
            label: installed
              ? `Installing ${input.manifestPreview?.name ?? 'module'}...`
              : 'Draft cancelled',
          })
        }
        break
      }
      case 'document_upload': {
        if (action === 'document_uploaded') {
          const d = data as { fileName?: string } | undefined
          setComponentState('resolved')
          setResolution({
            action: 'document_uploaded',
            value: d,
            label: `Uploaded ${d?.fileName ?? 'document'} — processing.`,
          })
        }
        break
      }
    }
  }, [componentState, input, onSendMessage, onVoyageSwitch])

  // If tool is still streaming input, show loading
  if (toolState === 'input-streaming') {
    return (
      <div className="text-xs text-slate-500 animate-pulse font-mono">
        Preparing component...
      </div>
    )
  }

  // Render the appropriate adapter
  switch (input.type) {
    case 'email_input':
      return (
        <EmailInputAdapter
          message={input.message}
          __state={componentState}
          __resolution={resolution}
          onAction={handleAction}
          sendMagicLink={sendMagicLink}
        />
      )

    case 'confirmation':
      return (
        <ConfirmationAdapter
          message={input.message ?? 'Please confirm'}
          confirmLabel={input.confirmLabel}
          cancelLabel={input.cancelLabel}
          __state={componentState}
          __resolution={resolution}
          onAction={handleAction}
        />
      )

    case 'voyage_picker': {
      // Server-fetched voyages from tool result (D2)
      const pickerData = parseVoyagePickerResult(toolResult)
      return (
        <VoyagePickerAdapter
          voyages={pickerData?.voyages ?? []}
          onSelect={(slug) => handleAction('voyage_select', slug)}
          __state={componentState}
          __resolution={resolution}
        />
      )
    }

    case 'api_key_input':
      return (
        <ApiKeyInputAdapter
          provider={input.provider}
          purpose={input.purpose}
          voyageSlug={input.voyageSlug}
          message={input.message}
          __state={componentState}
          __resolution={resolution}
          onAction={handleAction}
          onSendMessage={onSendMessage}
        />
      )

    case 'module_review':
      return (
        <ModuleReviewAdapter
          draftId={input.draftId}
          draftSummary={input.draftSummary}
          manifestPreview={input.manifestPreview}
          __state={componentState}
          __resolution={resolution}
          onAction={handleAction}
          onSendMessage={onSendMessage}
        />
      )

    case 'document_upload':
      return (
        <DocumentUploadAdapter
          voyageSlug={input.voyageSlug}
          message={input.message}
          __state={componentState}
          __resolution={resolution}
          onAction={handleAction}
          onSendMessage={onSendMessage}
        />
      )

    case 'knowledge_graph':
      return (
        <KnowledgeGraphAdapter
          payload={graphPayload}
          scope={input.scope}
          renderMode={input.renderMode}
          __state={componentState}
          __resolution={resolution}
        />
      )

    case 'conversation_picker':
      // Basic list rendering — full adapter can be built later
      if (componentState === 'resolved' && resolution) {
        return (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-green-500">✓</span>
            <Text variant="body">
              Resuming <span className="text-indigo-400">{resolution.label}</span>
            </Text>
          </div>
        )
      }
      return (
        <div className="space-y-1">
          {(input.conversations ?? []).map(conv => (
            <button
              key={conv.id}
              type="button"
              onClick={() => handleAction('conversation_select', conv.id)}
              className="block w-full text-left px-3 py-2 rounded-sm border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm font-mono"
            >
              <span className="text-slate-200">{conv.title}</span>
              {conv.preview && (
                <span className="block text-xs text-slate-500 mt-0.5 truncate">{conv.preview}</span>
              )}
            </button>
          ))}
        </div>
      )

    default:
      return (
        <Text variant="caption" className="text-amber-500/70">
          [Unknown ask_captain type: {(input as AskCaptainInput).type}]
        </Text>
      )
  }
}
