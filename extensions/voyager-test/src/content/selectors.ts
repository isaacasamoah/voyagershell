/** DOM selectors for VoyagerShell UI elements. */
export const S = {
  chatInput: 'textarea.font-mono',
  messageStream: 'div.space-y-12',
  userMessage: 'div.opacity-80',
  assistantLabel: 'span.text-green-400',
  component: '[data-component-id]',
  componentActive: '[data-state="active"]',
  componentResolved: '[data-state="resolved"]',
  emailInput: '[data-state="active"] input[type="email"]',
  confirmationCard: '.border-amber-500\\/30',
  voyagePickerCard: '.border-purple-500\\/30',
  taskCard: '.bg-indigo-950\\/30',
  astronautImg: 'img[src*="/images/astronaut/"]',
  loadingArrow: 'span.text-amber-500',
  idleArrow: 'span.text-green-500.animate-pulse',
  streamCursor: 'span.w-2.h-4.bg-indigo-400',
  errorBox: '.text-red-400.border',
} as const
