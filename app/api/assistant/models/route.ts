import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceActor } from '@/lib/supabase/workspace-auth'
import { getDefaultOpenRouterModel, getOpenRouterChatModels, OpenRouterError } from '@/lib/assistant/openrouter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await getWorkspaceActor()
    const models = await getOpenRouterChatModels()
    return NextResponse.json(
      { models, defaultModel: getDefaultOpenRouterModel() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    if (error instanceof AdminApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof OpenRouterError) {
      const status = error.category === 'authentication' ? 503 : error.category === 'configuration' ? 503 : 502
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error('[Codexa Assistant] model_catalog_failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return NextResponse.json({ error: 'Não foi possível carregar o catálogo de modelos agora.' }, { status: 502 })
  }
}
