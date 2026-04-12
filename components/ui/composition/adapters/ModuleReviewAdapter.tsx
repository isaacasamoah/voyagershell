// ModuleReviewAdapter - Review card for a Forge draft module
// Active state: module info + Install/Cancel buttons
// Resolved state: brief summary of choice

'use client'

import { Card, Stack, Text, Button, Inline } from '@/components/ui/primitives'
import type { ComponentState, ComponentResolution } from '@/lib/ui/components'

interface ManifestPreview {
  id: string
  name: string
  description: string
  toolCount: number
  hasConnection: boolean
}

interface ModuleReviewAdapterProps {
  draftId?: string
  draftSummary?: string
  manifestPreview?: ManifestPreview
  __state?: ComponentState
  __resolution?: ComponentResolution
  onAction?: (action: string, data?: unknown) => void
  onSendMessage?: (text: string) => void
}

export const ModuleReviewAdapter = ({
  draftId,
  draftSummary,
  manifestPreview,
  __state = 'active',
  __resolution,
  onAction,
  onSendMessage,
}: ModuleReviewAdapterProps) => {
  // Resolved state - collapsed summary
  if (__state === 'resolved' && __resolution) {
    const installed = __resolution.action === 'install'
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className={installed ? 'text-green-500' : 'text-slate-500'}>
          {installed ? '✓' : '✗'}
        </span>
        <Text variant="body">
          {__resolution.label ?? (installed ? 'Module installed' : 'Draft cancelled')}
        </Text>
      </div>
    )
  }

  // Dismissed state
  if (__state === 'dismissed') {
    return (
      <Text variant="caption" className="opacity-50">
        [Module review dismissed]
      </Text>
    )
  }

  // Active state - module info + buttons
  return (
    <Card variant="outlined" className="border-indigo-500/30 bg-indigo-500/5">
      <Stack gap="sm">
        {manifestPreview ? (
          <>
            <Text variant="body" className="text-slate-200 font-medium">
              {manifestPreview.name}
            </Text>
            <Text variant="caption" className="text-slate-400">
              {manifestPreview.description}
            </Text>
            <Inline gap="md">
              <Text variant="caption" className="text-slate-500">
                {manifestPreview.toolCount} tool{manifestPreview.toolCount !== 1 ? 's' : ''}
              </Text>
              {manifestPreview.hasConnection && (
                <Text variant="caption" className="text-slate-500">
                  Has connection
                </Text>
              )}
            </Inline>
          </>
        ) : (
          <Text variant="body" className="text-slate-200">
            {draftSummary ?? 'Module draft ready for review'}
          </Text>
        )}
        <Inline gap="sm">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onAction?.('module_review_response', 'install')
              onSendMessage?.(`Install draft ${draftId}`)
            }}
          >
            Install
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onAction?.('module_review_response', 'cancel')
              onSendMessage?.('Cancel draft')
            }}
          >
            Cancel
          </Button>
        </Inline>
      </Stack>
    </Card>
  )
}
