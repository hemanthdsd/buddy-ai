import axios from 'axios'
import { BrowserWindow } from 'electron'

// ─── Ollama Service ───────────────────────────────────────────────────────────
// All communication with the local Ollama server happens here.
// Ollama must be running: `ollama serve` (it starts automatically on Windows install)
// Default model: qwen2.5:3b  (fast, small, good quality)
// Vision model:  llava        (for screen capture analysis)
//
// Streaming: we use Ollama's stream=true mode so tokens appear one by one
// in the panel as they are generated — much better than waiting for the whole response.

const OLLAMA_BASE = 'http://localhost:11434'

// ── System prompt ─────────────────────────────────────────────────────────────
// Kept short — smaller system prompts = faster responses on local models.
const SYSTEM_PROMPT =
  'You are a text improvement assistant. Return ONLY the improved text. ' +
  'No explanations. No preamble. No "Here is the improved version:" prefix. ' +
  'Just the improved text itself.'

// ── Mode prompts (matches the modes in the UI) ────────────────────────────────
export const MODE_PROMPTS: Record<string, string> = {
  enhance:      'You are an expert prompt engineer. The user will provide a short idea or draft prompt. Expand it into a highly detailed, comprehensive, and effective AI prompt. Include necessary context, format requirements, and constraints. Output ONLY the new prompt, without any introductions or explanations.',
  improve:      'Rewrite this text to be clear, structured, and effective. Keep the original intent.',
  grammar:      'Fix all grammar, spelling, and punctuation errors. Keep the original style and meaning exactly.',
  professional: 'Rewrite this in a professional, formal business tone. Maintain the key message.',
  short:        'Make this text shorter and more concise. Remove unnecessary words. Keep the key message.',
  friendly:     'Rewrite this in a warm, friendly, and conversational tone.',
  email:        'Write a complete professional email. Include: Subject line, greeting, clear body paragraphs, and a professional closing.',
  continue:     'Continue writing from exactly where this text ends. Match the style, tone, and voice.',
  answer:       'You are an expert AI assistant. Provide a direct, correct solution to the user\'s question or code task. YOU MUST FORMAT YOUR RESPONSE EXACTLY LIKE THIS:\nSOLUTION:\n<your direct solution here>\nEXPLANATION:\n<your step-by-step explanation here>',
}

// ─── Check if Ollama is running ───────────────────────────────────────────────
export async function isOllamaRunning(): Promise<boolean> {
  try {
    await axios.get(`${OLLAMA_BASE}/api/tags`, { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

// ─── Get installed models ───────────────────────────────────────────────────
export async function getInstalledModels(): Promise<string[]> {
  try {
    const res = await axios.get(`${OLLAMA_BASE}/api/tags`, { timeout: 2000 })
    return res.data.models.map((m: any) => m.name)
  } catch {
    return []
  }
}

// ─── Get list of available models ────────────────────────────────────────────
export async function getAvailableModels(): Promise<string[]> {
  try {
    const res = await axios.get(`${OLLAMA_BASE}/api/tags`, { timeout: 3000 })
    return (res.data?.models ?? []).map((m: { name: string }) => m.name)
  } catch {
    return []
  }
}

// ─── Stream text processing ───────────────────────────────────────────────────
// Sends text + mode to Ollama, streams tokens back to the panel window.
export async function streamTextProcess(
  win: BrowserWindow,
  text: string,
  modeId: string,
  model: string
): Promise<void> {
  const modePrompt = MODE_PROMPTS[modeId] ?? MODE_PROMPTS.improve
  const fullPrompt = `${modePrompt}\n\nText:\n${text}`

  await streamRequest(win, '/api/generate', {
    model,
    prompt: fullPrompt,
    system: SYSTEM_PROMPT,
    stream: true,
    options: {
      temperature: 0.7,
      num_predict: 1024
    }
  })
}

// ─── Prefixed stream variant ──────────────────────────────────────────────────
// Same as streamTextProcess but emits events on '<prefix>ai-chunk' and
// '<prefix>ai-error' channels. Used by the Quick Panel to avoid cross-talk
// with the main AssistantPanel's 'ai-chunk' listener.
export async function streamTextWithPrefix(
  win: BrowserWindow,
  text: string,
  modeId: string,
  model: string,
  prefix: string
): Promise<void> {
  const modePrompt = MODE_PROMPTS[modeId] ?? MODE_PROMPTS.improve
  const fullPrompt = `${modePrompt}\n\nText:\n${text}`

  await streamRequestPrefixed(win, '/api/generate', {
    model,
    prompt: fullPrompt,
    system: SYSTEM_PROMPT,
    stream: true,
    options: { temperature: 0.7, num_predict: 1024 }
  }, prefix)
}

export async function streamChatProcess(
  win: BrowserWindow,
  messages: Array<{ role: string; content: string; images?: string[] }>,
  model: string
): Promise<void> {
  await streamRequest(win, '/api/chat', {
    model,
    messages,
    stream: true,
    options: { temperature: 0.5, num_predict: 1024 }
  })
}

// ─── Stream screen analysis ───────────────────────────────────────────────────
// Sends a screenshot (base64) + question to a vision-capable model (llava).
export async function streamScreenAnalysis(
  win: BrowserWindow,
  imageDataUrl: string,
  question: string,
  visionModel: string
): Promise<void> {
  // Strip the data:image/png;base64, prefix — Ollama wants raw base64
  const base64 = imageDataUrl.replace(/^data:image\/[a-z]+;base64,/, '')

  const prompt = question.trim() ||
    'Read the text, math, or code in the image. Identify the core task, problem, or question. ' +
    'CRITICAL RULES:\n' +
    '1. DO NOT describe the image visually (never say "The image shows...").\n' +
    '2. Output the direct answer or code solution immediately.\n' +
    '3. If it is a coding task, provide the code directly.\n' +
    '4. Be concise and to the point.\n' +
    '5. If there are MULTIPLE distinct questions, ask which to solve first.'

  await streamRequest(win, '/api/generate', {
    model: visionModel,
    prompt,
    images: [base64],
    stream: true,
    options: { temperature: 0.5, num_predict: 1024 }
  })
}

// ─── Core streaming helper ────────────────────────────────────────────────────
// prefix = '' for main panel ('ai-chunk'), 'qp-' for quick panel ('qp-ai-chunk')
async function streamRequest(
  win: BrowserWindow,
  endpoint: string,
  body: Record<string, unknown>,
  prefix = ''
): Promise<void> {
  try {
    const response = await axios.post(
      `${OLLAMA_BASE}${endpoint}`,
      body,
      {
        responseType: 'stream',
        timeout: 120_000   // 2 min — vision models can be slow
      }
    )

    let buffer = ''

    response.data.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()

      // Ollama streams newline-delimited JSON (NDJSON)
      // Buffer handles the case where a chunk contains a partial JSON line
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''  // keep the incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const json = JSON.parse(line)
          // /api/generate uses json.response, /api/chat uses json.message.content
          const token = json.response ?? json.message?.content
          if (token !== undefined) {
            win.webContents.send(`${prefix}ai-chunk`, { token, done: false })
          }
          if (json.done) {
            win.webContents.send(`${prefix}ai-chunk`, { token: '', done: true })
          }
          if (json.error) {
            win.webContents.send(`${prefix}ai-error`, {
              message: `Model error: ${json.error}`
            })
          }
        } catch {
          // Skip malformed partial JSON
        }
      }
    })

    response.data.on('end', () => {
      win.webContents.send(`${prefix}ai-chunk`, { token: '', done: true })
    })

    response.data.on('error', (err: Error) => {
      console.error('[Ollama] Stream error:', err.message)
      win.webContents.send(`${prefix}ai-error`, { message: `Stream error: ${err.message}` })
    })

  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; response?: { status: number; data?: { error?: string } } }

    let message: string

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      message =
        '❌ Cannot connect to Ollama.\n\n' +
        'Fix: Open a terminal and run:\n  ollama serve\n\n' +
        'Then make sure the model is downloaded:\n  ollama pull qwen2.5:3b'
    } else if (error.response?.status === 404) {
      message =
        `❌ Model not found.\n\n` +
        `Fix: Open a terminal and run:\n  ollama pull ${body.model}\n\n` +
        `Then try again.`
    } else {
      message = `❌ Error: ${error.response?.data?.error ?? error.message ?? 'Unknown error'}`
    }

    console.error('[Ollama] Error:', message)
    win.webContents.send(`${prefix}ai-error`, { message })
  }
}

// Alias for the quick panel — same function but with a channel prefix
export const streamRequestPrefixed = streamRequest
