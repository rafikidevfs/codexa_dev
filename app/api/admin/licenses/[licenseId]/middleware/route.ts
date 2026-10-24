import { NextResponse } from 'next/server'
import { AdminApiError, requireWorkspacePermission } from '@/lib/supabase/admin-server'
import { generateMiddleware } from '@/lib/licensing/middleware-generator'

const CENTRAL_LICENSE_API_URL = 'https://gestao-de-software-house.vercel.app/api/licenses/validate'

function errorResponse(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Middleware generation failed:', error)
  return NextResponse.json({ error: 'Não foi possível gerar o middleware.' }, { status: 500 })
}

export async function GET(_request: Request, context: { params: Promise<{ licenseId: string }> }) {
  try {
    const { licenseId } = await context.params
    const { supabase } = await requireWorkspacePermission('licenses', 'view')
    const [{ data: license, error: licenseError }, { data: mappings, error: mappingsError }] = await Promise.all([
      supabase.from('licenses').select('id,system_id').eq('id', licenseId).maybeSingle(),
      supabase.from('license_route_mappings').select('id,route_pattern,blocked_path,system_module_id').eq('license_id', licenseId).order('route_pattern'),
    ])
    if (licenseError) return errorResponse(licenseError)
    if (mappingsError) {
      if (mappingsError.code === '42P01' || mappingsError.code === 'PGRST205') {
        return NextResponse.json({ error: 'A tabela de rotas ainda não foi criada. Execute o arquivo supabase/manual/license_route_mappings.sql no Supabase.' }, { status: 503 })
      }
      return errorResponse(mappingsError)
    }
    if (!license) return NextResponse.json({ error: 'Licença não encontrada.' }, { status: 404 })
    const moduleIds = [...new Set((mappings ?? []).map((mapping) => mapping.system_module_id))]
    const { data: modules, error: modulesError } = moduleIds.length
      ? await supabase.from('system_modules').select('id,internal_code').in('id', moduleIds)
      : { data: [], error: null }
    if (modulesError) return errorResponse(modulesError)
    const moduleCodes = new Map((modules ?? []).map((module) => [module.id, module.internal_code]))
    const routes = (mappings ?? []).map((mapping) => ({
      routePattern: mapping.route_pattern,
      blockedPath: mapping.blocked_path,
      moduleCode: moduleCodes.get(mapping.system_module_id) ?? '',
    })).filter((route) => route.moduleCode)
    const invalidMappings = (mappings ?? []).filter((mapping) => !moduleCodes.has(mapping.system_module_id))
    const warnings: string[] = []
    if (invalidMappings.length) warnings.push(`${invalidMappings.length} rota(s) apontam para módulo inexistente ou não associado ao sistema.`)
    if (!routes.length) warnings.push('Nenhuma rota configurada. Cadastre ao menos uma rota antes de usar o middleware em produção.')
    return NextResponse.json({
      routes,
      warnings,
      readyForProduction: routes.length > 0 && invalidMappings.length === 0,
      middleware: generateMiddleware({ apiUrl: CENTRAL_LICENSE_API_URL, routes }),
    })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request, context: { params: Promise<{ licenseId: string }> }) {
  try {
    const { licenseId } = await context.params
    const body = await request.json() as { routePattern?: unknown; moduleId?: unknown; blockedPath?: unknown }
    if (typeof body.routePattern !== 'string' || !body.routePattern.startsWith('/') || typeof body.moduleId !== 'string') return NextResponse.json({ error: 'Informe uma rota e um módulo válidos.' }, { status: 400 })
    const blockedPath = typeof body.blockedPath === 'string' && body.blockedPath.startsWith('/') ? body.blockedPath : '/licenca-bloqueada'
    const { supabase } = await requireWorkspacePermission('licenses', 'manage_licenses')
    const { data: license } = await supabase.from('licenses').select('id,system_id').eq('id', licenseId).maybeSingle()
    const { data: module } = await supabase.from('system_modules').select('id,system_id').eq('id', body.moduleId).maybeSingle()
    if (!license || !module || (module.system_id !== null && module.system_id !== license.system_id)) return NextResponse.json({ error: 'Licença ou módulo não encontrado para este sistema.' }, { status: 400 })
    const { data, error } = await supabase.from('license_route_mappings').upsert({ license_id: licenseId, system_module_id: module.id, route_pattern: body.routePattern, blocked_path: blockedPath, updated_at: new Date().toISOString() }, { onConflict: 'license_id,route_pattern' }).select('id,route_pattern,blocked_path,system_module_id').single()
    if (error) return errorResponse(error)
    return NextResponse.json({ mapping: data }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}
