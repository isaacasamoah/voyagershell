export type RoomCommand =
  | { op: 'add' | 'remove'; name: string }
  | { op: 'voyager-in' | 'voyager-out' }

/** Deterministic room grammar parsed before the model. */
export const parseRoomCommand = (text: string): RoomCommand | null => {
  const match = /^([+\-])\s*([a-z0-9_][a-z0-9_ .'-]*)$/i.exec(text.trim())
  if (!match) return null
  const sign = match[1]
  const name = match[2].trim()
  if (/^voyager$/i.test(name)) return { op: sign === '+' ? 'voyager-in' : 'voyager-out' }
  return { op: sign === '+' ? 'add' : 'remove', name }
}
