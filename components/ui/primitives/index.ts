// Voyager UI Primitives - Tier 1
// Composable building blocks for conversational UI
//
// These primitives follow the TUI design system:
// - Obsidian backgrounds (#050505)
// - Phosphor glows
// - Box-drawing characters
// - Monospace typography

// Typography
export { Text } from './Text'
export type { TextProps, TextVariant } from './Text'

// Status indicators

// Actions
export { Button } from './Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button'

// Separators

// Containers
export { Card, CardHeader, CardContent, CardActions } from './Card'
export type { CardProps, CardVariant } from './Card'

// Collections
export { List } from './List'
export type { ListProps, ListItem, ListVariant } from './List'

// ═══════════════════════════════════════════════════════════
// TIER 2: Data Display
// ═══════════════════════════════════════════════════════════

// User/entity representation

// Progress indicators
export { Progress } from './Progress'
export type { ProgressProps, ProgressVariant } from './Progress'

// Temporal sequences

// Metrics display

// Notices

// Content previews

// ═══════════════════════════════════════════════════════════
// TIER 3: Layout Helpers
// ═══════════════════════════════════════════════════════════

// Vertical arrangement
export { Stack } from './Stack'
export type { StackProps, StackGap, StackAlign, StackJustify } from './Stack'

// Horizontal arrangement
export { Inline } from './Inline'
export type { InlineProps, InlineGap, InlineAlign, InlineJustify } from './Inline'

// Grid layouts
