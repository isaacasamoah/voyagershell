import OpenAI from 'openai'

let openai: OpenAI | null = null

export const getOpenAI = (): OpenAI => {
  if (!openai) openai = new OpenAI()
  return openai
}

export const toVectorString = (embedding: number[]): string => (
  `[${embedding.join(',')}]`
)
