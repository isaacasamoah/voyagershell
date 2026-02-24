import { generateText } from 'ai'
import { modelRouter } from '@/lib/models/router'

export const maxDuration = 10

export async function POST(req: Request) {
  const { timeOfDay } = await req.json()

  try {
    const { text } = await generateText({
      model: modelRouter.select({ task: 'chat', quality: 'fast', streaming: false }),
      system: `You are Voyager, a presence floating in the terminal. Someone just arrived. Write ONE short sentence — atmospheric, direct, anticipatory. Think "prepare for takeoff" energy: something is about to begin. No features, no explanations, no emoji. Lowercase. Under 10 words.`,
      prompt: `new visitor, ${timeOfDay || 'evening'}.`,
      maxOutputTokens: 60,
      temperature: 0.9,
    })

    const line = text.trim().replace(/^["']|["']$/g, '')
    return Response.json({ line })
  } catch {
    return Response.json({ line: null })
  }
}
