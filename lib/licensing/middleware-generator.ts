export type GeneratedRoute = { routePattern: string; moduleCode: string; blockedPath: string }

function quote(value: string) { return JSON.stringify(value) }

function normalizeRoute(route: GeneratedRoute) {
  const routePattern = route.routePattern.trim().replace(/\/+$/, '') || '/'
  return { ...route, routePattern: routePattern.startsWith('/') ? routePattern : `/${routePattern}` }
}

export function generateMiddleware(options: { apiUrl: string; routes: GeneratedRoute[] }) {
  const routes = options.routes.map(normalizeRoute)
  const matcher = [...new Set(routes.map((route) => route.routePattern))]
  const routeTable = routes.map((route) => `  { pattern: ${quote(route.routePattern)}, module: ${quote(route.moduleCode)}, blockedPath: ${quote(route.blockedPath)} },`).join('\n')
  return `import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const LICENSE_API_URL = process.env.CODEXA_LICENSE_API_URL ?? ${quote(options.apiUrl)}
const LICENSE_KEY = process.env.CODEXA_LICENSE_KEY
const ROUTES = [
${routeTable}
] as const

function matches(pathname: string, pattern: string) {
  const prefix = pattern.replace(/\\/:path\\*$/, '').replace(/\\/\\(\.\\*\\)$/, '') || '/'
  return prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(prefix + '/')
}

export async function middleware(request: NextRequest) {
  const route = ROUTES.find((item) => matches(request.nextUrl.pathname, item.pattern))
  if (!route || matches(request.nextUrl.pathname, route.blockedPath)) return NextResponse.next()
  if (!LICENSE_KEY) return NextResponse.rewrite(new URL(route.blockedPath, request.url))
  try {
    const response = await fetch(LICENSE_API_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + LICENSE_KEY, Accept: 'application/json' }, cache: 'no-store' })
    const result = await response.json() as { valid?: boolean; modules?: Array<{ code?: string; licensed?: boolean; enabled?: boolean }> }
    const module = result.modules?.find((item) => item.code === route.module)
    if (!response.ok || result.valid !== true || module?.licensed !== true || module.enabled !== true) return NextResponse.rewrite(new URL(route.blockedPath, request.url))
    return NextResponse.next()
  } catch {
    return NextResponse.rewrite(new URL('/licenca-indisponivel', request.url))
  }
}

export const config = { matcher: ${JSON.stringify(matcher)} }
`
}
