// Inline component registry
// Components Voyager can render inline in conversation

// Component lifecycle state
export type ComponentState =
  | 'active'     // Interactive, waiting for user action
  | 'resolved'   // User made selection, show collapsed
  | 'dismissed'  // User closed without action

// Resolution data when component is resolved
export interface ComponentResolution {
  action: string        // What action was taken (e.g., 'selected', 'submitted')
  value?: unknown       // The selected/submitted value
  label?: string        // Human-readable label for display
}

export type ComponentType =
  | 'voyage_picker'       // List of voyages to select
  | 'conversation_picker' // List of conversations to resume
  | 'create_voyage_form'  // Inline form for new voyage
  | 'invite_card'         // Invite link + copy button
  | 'confirmation'        // Yes/No action confirmation
  | 'action_buttons'      // Contextual action buttons
  | 'progress'            // Loading/progress indicator
  | 'email_input'         // Email input via ask_captain tool
  | 'api_key_input'       // API key input via ask_captain tool
  | 'module_review'       // Module review card via ask_captain tool
  | 'document_upload'    // Document upload drop zone via ask_captain tool
  | 'knowledge_graph'    // Knowledge graph visualisation via ask_captain tool

export interface InlineComponent {
  id: string
  type: ComponentType
  props: Record<string, unknown>
  ephemeral: boolean       // Don't persist to conversation history
  state: ComponentState    // Current lifecycle state
  resolution?: ComponentResolution  // Present when state is 'resolved'
}

// Helper types for specific components
export interface VoyagePickerProps {
  voyages: Array<{ slug: string; name: string; role?: string }>
  onSelect: (slug: string) => void
}

export interface ActionButtonsProps {
  actions: Array<{
    id: string
    label: string
    variant?: 'primary' | 'secondary' | 'danger'
    onClick: () => void
  }>
}

export interface ProgressProps {
  message: string
  indeterminate?: boolean
  progress?: number // 0-100
}
