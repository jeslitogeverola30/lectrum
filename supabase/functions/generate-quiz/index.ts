import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as pdfjsLib from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs"
import mammoth from "npm:mammoth@1.8.0"
import { Buffer } from "node:buffer"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL_FALLBACKS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
const DEFAULT_QUESTION_COUNT = 5
const MAX_SOURCE_CHARS = 30000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isRetryableGroqFailure = (status: number, message: string) => {
  const body = message.toLowerCase()
  return (
    status === 429 ||
    status >= 500 ||
    body.includes('high demand') ||
    body.includes('overloaded') ||
    body.includes('try again later')
  )
}

const decodeBase64ToBytes = (value: string): Uint8Array => {
  const sanitized = value.includes(',') ? value.split(',').pop() ?? '' : value
  const decoded = atob(sanitized)
  const bytes = new Uint8Array(decoded.length)

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }

  return bytes
}

const normalizeExtractedText = (value: string): string =>
  value.replace(/\u0000/g, ' ').replace(/\r/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

const parsePdfToText = async (fileBytes: Uint8Array): Promise<string> => {
  const loadingTask = pdfjsLib.getDocument({
    data: fileBytes,
    disableWorker: true,
    useSystemFonts: true,
    stopAtErrors: true,
  })

  const document = await loadingTask.promise
  const chunks: string[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
    chunks.push(pageText)
  }

  return normalizeExtractedText(chunks.join('\n'))
}

const parseDocxToText = async (fileBytes: Uint8Array): Promise<string> => {
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(fileBytes),
  })
  return normalizeExtractedText(result.value ?? '')
}

const deriveFileType = (mimeType: string, fileName: string): 'pdf' | 'docx' | null => {
  const normalizedMime = (mimeType || '').toLowerCase()
  const normalizedName = (fileName || '').toLowerCase()

  if (normalizedMime.includes('pdf') || normalizedName.endsWith('.pdf')) {
    return 'pdf'
  }

  if (
    normalizedMime.includes('officedocument.wordprocessingml.document') ||
    normalizedName.endsWith('.docx')
  ) {
    return 'docx'
  }

  return null
}

const extractSourceText = async (payload: {
  input_text?: string
  file_base64?: string
  file_mime_type?: string
  file_name?: string
}): Promise<string> => {
  if (payload.file_base64) {
    const fileType = deriveFileType(payload.file_mime_type ?? '', payload.file_name ?? '')

    if (!fileType) {
      throw new Error('Unsupported file type. Please upload a PDF or DOCX file.')
    }

    const fileBytes = decodeBase64ToBytes(payload.file_base64)
    const extractedText = fileType === 'pdf' ? await parsePdfToText(fileBytes) : await parseDocxToText(fileBytes)

    if (!extractedText) {
      throw new Error('Could not extract readable text from the uploaded file.')
    }

    return extractedText.slice(0, MAX_SOURCE_CHARS)
  }

  const plainInputText = (payload.input_text ?? '').trim()
  if (!plainInputText) {
    throw new Error('Missing content. Provide input_text or upload a PDF/DOCX file.')
  }

  return plainInputText.slice(0, MAX_SOURCE_CHARS)
}

const callGroqWithFallback = async (prompt: string, apiKey: string) => {
  let lastError = 'Unknown Groq error'

  for (const model of MODEL_FALLBACKS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            messages: [
              {
                role: 'system',
                content: 'You are a strict quiz JSON generator. Return only JSON and no markdown.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            response_format: { type: 'json_object' },
          }),
        }
      )

      if (response.ok) {
        return response.json()
      }

      const errorText = await response.text()
      lastError = `${model} attempt ${attempt} failed (${response.status}): ${errorText}`

      if (!isRetryableGroqFailure(response.status, errorText)) {
        break
      }

      await wait(800 * attempt)
    }
  }

  throw new Error(`All Groq model attempts failed. ${lastError}`)
}

const buildPrompt = (sourceText: string, questionCount: number) => `
Create a multiple-choice quiz from the provided source text.

Rules:
- Return valid JSON only, no markdown.
- Return this exact object shape:
{
  "quiz": [
    {
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "answerIndex": 0,
      "explanation": "..."
    }
  ]
}
- Generate exactly ${questionCount} items.
- Each question must have exactly 4 options.
- answerIndex must be an integer from 0 to 3.
- Use only information supported by the source text.

SOURCE TEXT:
"""
${sourceText}
"""
`

const normalizeQuizPayload = (rawContent: string, questionCount: number) => {
  const parsed = JSON.parse(rawContent)
  const items = Array.isArray(parsed) ? parsed : parsed?.quiz

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Model response did not include a valid quiz array.')
  }

  const normalized = items.slice(0, questionCount).map((item: any, index: number) => {
    const options = Array.isArray(item?.options)
      ? item.options.map((option: unknown) => String(option)).filter(Boolean).slice(0, 4)
      : []

    if (options.length !== 4) {
      throw new Error(`Question ${index + 1} did not include exactly 4 options.`)
    }

    const normalizedAnswerIndex = Number.isInteger(item?.answerIndex)
      ? item.answerIndex
      : Number.parseInt(String(item?.answerIndex ?? 0), 10)

    return {
      question: String(item?.question ?? '').trim(),
      options,
      answerIndex:
        Number.isInteger(normalizedAnswerIndex) && normalizedAnswerIndex >= 0 && normalizedAnswerIndex <= 3
          ? normalizedAnswerIndex
          : 0,
      explanation: String(item?.explanation ?? '').trim(),
    }
  })

  if (!normalized.every((item) => item.question.length > 0)) {
    throw new Error('Model response included an empty question.')
  }

  return normalized
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    const requestedQuestionCount = Number.parseInt(String(payload?.question_count ?? DEFAULT_QUESTION_COUNT), 10)
    const questionCount = Number.isFinite(requestedQuestionCount)
      ? Math.max(1, Math.min(10, requestedQuestionCount))
      : DEFAULT_QUESTION_COUNT

    if (!groqApiKey) {
      return new Response(JSON.stringify({ error: 'Missing GROQ_API_KEY secret in Supabase function environment.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const sourceText = await extractSourceText(payload)
    const prompt = buildPrompt(sourceText, questionCount)

    const data = await callGroqWithFallback(prompt, groqApiKey)
    const generatedJsonString = data?.choices?.[0]?.message?.content

    if (!generatedJsonString || typeof generatedJsonString !== 'string') {
      throw new Error(`Groq returned an unexpected response shape: ${JSON.stringify(data)}`)
    }

    const quizJson = normalizeQuizPayload(generatedJsonString, questionCount)

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