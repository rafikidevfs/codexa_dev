import { randomUUID } from 'node:crypto'
import { createOpenAI } from '@ai-sdk/openai'
import { convertToModelMessages, streamText, type UIMessage } from 'ai'
import { NextResponse } from 'next/server'
import { getWorkspaceActor } from '@/lib/supabase/workspace-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim()

type ErrorRecord = Record<string, unknown>
type ErrorCategory =
  | 'authentication'
  | 'rate_limit'
  | 'model_not_found'
  | 'model_unavailable'
  | 'timeout'
  | 'connection'
  | 'invalid_response'
  | 'provider_error'
  | 'internal_error'

function asRecord(value: unknown): ErrorRecord | undefined {
  return typeof value === 'object' && value !== null ? value as ErrorRecord : undefined
}

function readString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim()
}

function readCode(...values: unknown[]): string | undefined {
  const value = values.find((item) => typeof item === 'string' || typeof item === 'number')
  return value === undefined ? undefined : String(value)
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-or-v1|sk)-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/(api[_-]?key|authorization)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500)
}

function parseProviderError(value: unknown): ErrorRecord | undefined {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return undefined
    }
  }

  const record = asRecord(parsed)
  return asRecord(record?.error) ?? record
}

function getErrorDetails(error: unknown, statusOverride?: number) {
  const record = asRecord(error)
  const cause = asRecord(record?.cause)
  const providerError = parseProviderError(record?.responseBody) ?? parseProviderError(record?.data)
  const metadata = asRecord(providerError?.metadata)
  const providerMessage = readString(
    providerError?.message,
    typeof providerError?.error === 'string' ? providerError.error : undefined,
    record?.message,
    cause?.message,
  )
  const statusCode = statusOverride
    ?? (typeof record?.statusCode === 'number' ? record.statusCode : undefined)
    ?? (typeof cause?.statusCode === 'number' ? cause.statusCode : undefined)
    ?? (typeof providerError?.status === 'number' ? providerError.status : undefined)
  const code = readCode(providerError?.code, record?.code, cause?.code)
  const name = readString(record?.name, cause?.name)
  const searchable = `${providerMessage ?? ''} ${code ?? ''} ${name ?? ''}`.toLowerCase()
  let category: ErrorCategory = 'internal_error'

  if (statusCode === 401 || statusCode === 403 || /unauthorized|invalid api.?key|authentication failed|forbidden/.test(searchable)) {
    category = 'authentication'
  } else if (statusCode === 429 || /rate.?limit|too many requests/.test(searchable)) {
    category = 'rate_limit'
  } else if (statusCode === 404 || /model (not found|does not exist)|unknown model|no such model/.test(searchable)) {
    category = 'model_not_found'
  } else if (/no endpoints|no available providers|model unavailable|temporarily unavailable/.test(searchable)) {
    category = 'model_unavailable'
  } else if (statusCode === 408 || statusCode === 504 || /timeout|timed out|aborterror/.test(searchable)) {
    category = 'timeout'
  } else if (/econnreset|econnrefused|enotfound|fetch failed|network error/.test(searchable)) {
    category = 'connection'
  } else if (/invalid response|malformed|jsonparse|parse error|unexpected end/.test(searchable)) {
    category = 'invalid_response'
  } else if (statusCode !== undefined) {
    category = 'provider_error'
  }

  return {
    category,
    errorName: name,
    statusCode,
    providerCode: code,
    provider: readString(metadata?.provider_name, metadata?.provider),
    providerMessage: providerMessage ? sanitizeDiagnosticText(providerMessage) : undefined,
    retryable: typeof record?.isRetryable === 'boolean' ? record.isRetryable : undefined,
  }
}

function getPublicErrorMessage(category: ErrorCategory): string {
  switch (category) {
    case 'authentication':
      return 'A autenticação do serviço de IA falhou. Peça ao administrador para verificar a configuração.'
    case 'rate_limit':
      return 'O limite temporário do serviço de IA foi atingido. Tente novamente em instantes.'
    case 'model_not_found':
    case 'model_unavailable':
      return 'O modelo de IA configurado não está disponível no momento. Peça ao administrador para revisar o modelo.'
    case 'timeout':
      return 'A geração demorou mais que o esperado. Tente novamente.'
    case 'connection':
      return 'Não foi possível conectar ao serviço de IA. Tente novamente.'
    case 'invalid_response':
      return 'O serviço de IA retornou uma resposta inválida. Tente novamente.'
    default:
      return 'Não foi possível concluir a resposta da IA. Tente novamente.'
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID()
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey || !OPENROUTER_MODEL) {
    const missingConfiguration = [
      ...(!apiKey ? ['OPENROUTER_API_KEY'] : []),
      ...(!OPENROUTER_MODEL ? ['OPENROUTER_MODEL'] : []),
    ]
    console.error('[Codexa Assistant] configuration_error', {
      requestId,
      provider: 'openrouter',
      missingEnvironmentVariables: missingConfiguration,
    })
    return NextResponse.json(
      { error: 'O assistente está temporariamente indisponível. A configuração do provedor precisa ser verificada.' },
      { status: 503 },
    )
  }

  try {
    const openrouter = createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: { 'HTTP-Referer': process.env.SITE_URL ?? 'https://codexa.dev', 'X-Title': 'Codexa Assistant' },
      fetch: async (input, init) => {
        const response = await fetch(input, init)
        const contentType = response.headers.get('content-type')
        console.info('[Codexa Assistant] openrouter_response', {
          requestId,
          model: OPENROUTER_MODEL,
          statusCode: response.status,
          contentType,
        })

        if (!response.ok) {
          const providerBody = await response.clone().json().catch(() => undefined)
          console.error('[Codexa Assistant] openrouter_http_error', {
            requestId,
            model: OPENROUTER_MODEL,
            contentType,
            ...getErrorDetails(providerBody, response.status),
          })
        }

        return response
      },
    })

    await getWorkspaceActor()
    const body = await request.json() as { messages?: UIMessage[]; context?: string }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'Envie uma mensagem.' }, { status: 400 })
    }

    const result = streamText({
      model: openrouter.chat(OPENROUTER_MODEL),
      system: `Você é o assistente da Codexa, um ERP/CRM empresarial. Responda em português do Brasil, com objetividade e clareza. Ajude o usuário a encontrar módulos, entender dados e executar fluxos do workspace. Não invente dados, permissões ou ações realizadas. Quando faltar contexto, faça uma pergunta curta. Contexto atual: ${body.context ?? 'workspace Codexa'}`,
      messages: await convertToModelMessages(body.messages),
      maxOutputTokens: 900,
      onStart: ({ callId, provider, modelId }) => {
        console.info('[Codexa Assistant] generation_started', { requestId, callId, provider, modelId })
      },
      onEnd: ({ callId, finishReason, usage }) => {
        console.info('[Codexa Assistant] generation_finished', {
          requestId,
          callId,
          model: OPENROUTER_MODEL,
          finishReason,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
          },
        })
      },
    })

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        const details = getErrorDetails(error)
        console.error('[Codexa Assistant] streaming_error', {
          requestId,
          model: OPENROUTER_MODEL,
          ...details,
        })
        return getPublicErrorMessage(details.category)
      },
    })
  } catch (error) {
    const details = getErrorDetails(error)
    console.error('[Codexa Assistant] request_error', {
      requestId,
      model: OPENROUTER_MODEL,
      ...details,
    })
    return NextResponse.json({ error: 'Não foi possível responder agora.' }, { status: 500 })
  }
}
