// Adapter registry - Maps component types to React adapters
// Add new adapters here as they're built

import type { ComponentType } from '@/lib/ui/components'
import type { FC } from 'react'

import { VoyagePickerAdapter } from './VoyagePickerAdapter'
import { ActionButtonsAdapter } from './ActionButtonsAdapter'
import { ProgressAdapter } from './ProgressAdapter'
import { EmailInputAdapter } from './EmailInputAdapter'
import { ConfirmationAdapter } from './ConfirmationAdapter'

// Adapter type - accepts any props, specific adapters narrow internally
type AnyAdapter = FC<Record<string, unknown>>

// Registry of all component adapters
export const adapters: Record<ComponentType, AnyAdapter> = {
  voyage_picker: VoyagePickerAdapter as unknown as AnyAdapter,
  confirmation: ConfirmationAdapter as unknown as AnyAdapter,
  action_buttons: ActionButtonsAdapter as unknown as AnyAdapter,
  progress: ProgressAdapter as unknown as AnyAdapter,
  email_input: EmailInputAdapter as unknown as AnyAdapter,
}

// Re-export individual adapters for direct use
export { VoyagePickerAdapter } from './VoyagePickerAdapter'
export { ActionButtonsAdapter } from './ActionButtonsAdapter'
export { ProgressAdapter } from './ProgressAdapter'
export { EmailInputAdapter } from './EmailInputAdapter'
export { ConfirmationAdapter } from './ConfirmationAdapter'
