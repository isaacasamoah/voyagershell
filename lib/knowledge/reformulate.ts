// Multi-Query Reformulation via Gemini Flash
// Generates 1-2 alternative query phrasings for broader recall
//
// D1: Ships DISABLED by default — opt-in via hybridSearch({ reformulate: true })
// D2: Graceful degradation — any failure returns original query alone

const REFORMULATION_SYSTEM_PROMPT = `You are a search query reformulator. Given a user query, generate 1-2 alternative phrasings that would help find relevant results.

Strategies:
- Synonym expansion: replace key terms with synonyms or related terms
- Intent reframing: rephrase to capture the underlying intent differently
- Specificity adjustment: make abstract queries more concrete, or broaden overly narrow ones

Rules:
- Output a JSON array of strings (the alternative queries only, NOT the original)
- Generate 1-2 alternatives maximum
- Stay on-topic — NO topic drift
- Keep alternatives concise (similar length to original)

Example:
Input: "pricing discussions"
Output: ["cost and pricing conversations", "budget and rate negotiations"]`

interface ReformulationResult {
  original: string
  reformulations: string[]
}

// Gemini REST API response shape (subset)
interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[]
    }
  }[]
}

/**
 * Generate 1-2 query reformulations using Gemini Flash.
 * On any failure, returns the original query alone — no error surfaced.
 */
export const reformulateQuery = async (query: string): Promise<ReformulationResult> => {
  const fallback: ReformulationResult = { original: query, reformulations: [] }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) return fallback

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: REFORMULATION_SYSTEM_PROMPT }],
        },
        contents: [
          { role: 'user', parts: [{ text: query }] },
        ],
        generationConfig: {
          maxOutputTokens: 256,
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(3000), // 3s timeout — fast or skip
    })

    if (!response.ok) return fallback

    const data = (await response.json()) as GeminiResponse
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) return fallback

    const parsed = JSON.parse(text)

    // Validate: must be array of strings
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback
    const reformulations = parsed
      .filter((item: unknown): item is string => typeof item === 'string' && item.length > 0)
      .slice(0, 2) // Cap at 2

    return { original: query, reformulations }
  } catch {
    // Timeout, parse error, network error — all silent fallback
    return fallback
  }
}
