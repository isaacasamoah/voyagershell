import OpenAI from 'openai'

let openai: OpenAI | null = null

const getOpenAI = (): OpenAI => {
  if (!openai) openai = new OpenAI()
  return openai
}

export const generateSearchEmbedding = async (text: string): Promise<number[]> => {
  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

export const toVectorString = (embedding: number[]): string =>
  `[${embedding.join(',')}]`
