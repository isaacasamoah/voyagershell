import type { UIMessage } from 'ai'

export interface AskCaptainPart {
  toolCallId: string
  state: string
  input: unknown
  result: unknown
}

export const getMessageText = (message: UIMessage): string => {
  if (!Array.isArray(message.parts)) return ''
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => (
      part.type === 'text'
    ))
    .map((part) => part.text)
    .join('')
}

export const getAskCaptainParts = (
  message: UIMessage,
): AskCaptainPart[] => {
  if (!Array.isArray(message.parts)) return []
  const results: AskCaptainPart[] = []
  for (const partValue of message.parts) {
    const part = partValue as Record<string, unknown>
    const isAskCaptain =
      part.type === 'tool-ask_captain'
      || (part.type === 'dynamic-tool' && part.toolName === 'ask_captain')
    if (!isAskCaptain) continue
    results.push({
      toolCallId: part.toolCallId as string,
      state: part.state as string,
      input: part.input,
      result: part.result,
    })
  }
  return results
}
