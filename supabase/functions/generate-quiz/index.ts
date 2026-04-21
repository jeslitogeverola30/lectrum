import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL_FALLBACKS = ['gemini-2.5-flash']

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isRetryableGeminiFailure = (status: number, message: string) => {
  const body = message.toLowerCase()
  return (
    status === 429 ||
    status >= 500 ||
    body.includes('high demand') ||
    body.includes('overloaded') ||
    body.includes('try again later')
  )
}

const callGeminiWithFallback = async (prompt: string, apiKey: string) => {
  let lastError = 'Unknown Gemini error'

  for (const model of MODEL_FALLBACKS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      )

      if (response.ok) {
        return response.json()
      }

      const errorText = await response.text()
      lastError = `${model} attempt ${attempt} failed (${response.status}): ${errorText}`

      if (!isRetryableGeminiFailure(response.status, errorText)) {
        break
      }

      await wait(800 * attempt)
    }
  }

  throw new Error(`All Gemini model attempts failed. ${lastError}`)
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { input_text } = await req.json()
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Missing GEMINI_API_KEY secret in Supabase function environment.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // The strict prompt engineering telling Gemini exactly what we want
    const prompt = `
      You are an expert quiz creator. Create a multiple-choice quiz based on the following topic or text: "${input_text}".
      You must return ONLY a raw JSON array of 5 questions. Do not include markdown formatting like \`\`\`json.
      
      The JSON structure MUST be an array of objects like this:
      [
        {
          "question": "The question text here",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "answerIndex": 0, // The index (0-3) of the correct option
          "explanation": "A short explanation of why this is correct."
        }
      ]
    `;

    const data = await callGeminiWithFallback(prompt, geminiApiKey)
    const generatedJsonString = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!generatedJsonString) {
      throw new Error(`Gemini returned an unexpected response shape: ${JSON.stringify(data)}`)
    }

    const quizJson = JSON.parse(generatedJsonString);

    return new Response(JSON.stringify({ quiz: quizJson }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})