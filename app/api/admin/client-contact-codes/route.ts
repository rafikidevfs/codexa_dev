import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceActor, getWorkspacePermissions, requireWorkspacePermission } from '@/lib/supabase/workspace-auth'
import { normalizeWorkspaceRoleName } from '@/lib/workspace-access'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CodeRequest = { clientId?: unknown; codeId?: unknown }

function fail(error: unknown) {
  if (error instanceof AdminApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  const databaseError = error as { code?: string; message?: string }
  if (['42P01', '42883', 'PGRST202'].includes(databaseError?.code ?? '')) {
    return NextResponse.json(
      { error: 'A estrutura de códigos de cliente ainda não foi aplicada no Supabase.' },
      { status: 503 },
    )
  }

  console.error('Client contact code administration failed:', databaseError?.message ?? error)
  return NextResponse.json({ error: 'Não foi possível concluir a operação de códigos.' }, { status: 500 })
}

async function requireCodeAdmin(action: 'generate_contact_codes' | 'revoke_contact_codes') {
  const actor = await requireWorkspacePermission('clients', action)
  if (normalizeWorkspaceRoleName(actor.roleName) !== 'admin') {
    throw new AdminApiError('Somente a administração pode gerenciar códigos de cliente.', 403)
  }
  return actor
}

function validClientId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 160
}

export async function GET(request: Request) {
  try {
    const actor = await getWorkspaceActor()
    const permissions = await getWorkspacePermissions(actor)
    const isAdmin = permissions.has('*')
    if (!isAdmin && !permissions.has('clients:view')) {
      throw new AdminApiError('Você não tem permissão para visualizar clientes.', 403)
    }
    if (!isAdmin && !permissions.has('clients:view_contact_codes')) {
      throw new AdminApiError('Você não tem permissão para visualizar o código do cliente.', 403)
    }

    const clientId = new URL(request.url).searchParams.get('clientId')
    if (!validClientId(clientId)) {
      return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 })
    }

    const { data: visibleClient, error: visibilityError } = await actor.sessionSupabase
      .from('clients')
      .select('id')
      .eq('id', clientId.trim())
      .maybeSingle()
    if (visibilityError) throw visibilityError
    if (!visibleClient) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

    let query = actor.supabase
      .from('client_contact_codes')
      .select('id,client_id,code,created_at,revoked_at')
      .eq('client_id', clientId.trim())
    if (!isAdmin) query = query.is('revoked_at', null)

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(isAdmin ? 20 : 1)

    if (error) throw error
    return NextResponse.json({ codes: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCodeAdmin('generate_contact_codes')
    let body: CodeRequest
    try {
      body = await request.json() as CodeRequest
    } catch {
      return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
    }
    if (!validClientId(body.clientId)) {
      return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 })
    }

    const { data, error } = await actor.supabase.rpc('issue_client_contact_code', {
      p_client_id: body.clientId.trim(),
      p_actor_id: actor.actorId,
    })
    if (error) {
      if (error.code === 'P0002') return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
      throw error
    }
    return NextResponse.json({ code: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return fail(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireCodeAdmin('revoke_contact_codes')
    let body: CodeRequest
    try {
      body = await request.json() as CodeRequest
    } catch {
      return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
    }
    if (!validClientId(body.clientId) || typeof body.codeId !== 'string' || !uuidPattern.test(body.codeId)) {
      return NextResponse.json({ error: 'Código ou cliente inválido.' }, { status: 400 })
    }

    const { data, error } = await actor.supabase
      .from('client_contact_codes')
      .update({ revoked_at: new Date().toISOString(), revoked_by: actor.actorId })
      .eq('id', body.codeId)
      .eq('client_id', body.clientId.trim())
      .is('revoked_at', null)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Código ativo não encontrado para este cliente.' }, { status: 404 })
    return NextResponse.json({ revoked: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return fail(error)
  }
}
