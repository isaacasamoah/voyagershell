// ConfirmationAdapter - Yes/No confirmation dialog
// Active state: message + confirm/cancel buttons
// Resolved state: brief summary of choice

'use client'

import { Card, Stack, Text, Button, Inline } from '@/components/ui/primitives'
import type { ComponentState, ComponentResolution } from '@/lib/ui/components'

interface ConfirmationAdapterProps {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  __state?: ComponentState
  __resolution?: ComponentResolution
  onAction?: (action: string, data?: unknown) => void
}

export const ConfirmationAdapter = ({
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  __state = 'active',
  __resolution,
  onAction,
}: ConfirmationAdapterProps) => {
  // Resolved state - collapsed summary
  if (__state === 'resolved' && __resolution) {
    const approved = __resolution.value === true
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className={approved ? 'text-green-500' : 'text-slate-500'}>
          {approved ? '✓' : '✗'}
        </span>
        <Text variant="body">
          {__resolution.label ?? (approved ? 'Confirmed' : 'Cancelled')}
        </Text>
      </div>
    )
  }

  // Dismissed state
  if (__state === 'dismissed') {
    return (
      <Text variant="caption" className="opacity-50">
        [Confirmation dismissed]
      </Text>
    )
  }

  // Active state - message + buttons
  return (
    <Card variant="outlined" className="border-amber-500/30 bg-amber-500/5">
      <Stack gap="sm">
        <Text variant="body" className="text-slate-200">{message}</Text>
        <Inline gap="sm">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onAction?.('confirmation_response', true)}
          >
            {confirmLabel}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAction?.('confirmation_response', false)}
          >
            {cancelLabel}
          </Button>
        </Inline>
      </Stack>
    </Card>
  )
}
