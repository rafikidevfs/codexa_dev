'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Check, Copy, KeyRound, Loader2, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import { isModuleAvailable } from '@/lib/licensing/module-status'
import { IntegrationHelp } from '@/components/integration-help'

type Client = { id: string; name: string }
type System = { id: string; name: string; client_id: string | null }
type Module = {
  id: string
  name: string
  internal_code: string
  availability_status: string
  is_contracted: boolean
  is_enabled: boolean
}
type License = {
  id: string
  client_id: string
  system_id: string
  status: string
  expires_at: string | null
  allowed_domain: string | null
  created_at: string
  plan_id: string | null
  contract_id: string | null
  modules: Module[]
}
type LicenseData = { clients: Client[]; systems: System[]; licenses: License[] }
type MiddlewareData = { middleware: string; routes: Array<{ routePattern: string; moduleCode: string; blockedPath: string }>; warnings: string[]; readyForProduction: boolean }

const inputClass = 'field rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-400/60'
const statusNames: Record<string, string> = { active: 'Ativa', suspended: 'Suspensa', revoked: 'Revogada' }
const defaultLicenseSiteUrl = 'https://gestao-de-software-house.vercel.app'

function licenseStatusLabel(license: License) {
  if (license.status === 'active' && license.expires_at && new Date(license.expires_at).getTime() < Date.now()) return 'Expirada'
  return statusNames[license.status] ?? license.status
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const result = await response.json() as T & { error?: string; warning?: string | null }
  if (!response.ok) throw new Error(result.error || 'A solicitação não foi concluída.')
  return result
}

export function LicenseWorkspace({ permissions }: { permissions: string[] }) {
  const canManage = permissions.includes('*') || permissions.includes('licenses:manage_licenses')
  const [data, setData] = useState<LicenseData>({ clients: [], systems: [], licenses: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [expandedLicenseId, setExpandedLicenseId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newLicenseKey, setNewLicenseKey] = useState('')
  const [integrationToken, setIntegrationToken] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [selectedSystem, setSelectedSystem] = useState('')
  const [scriptOrigin, setScriptOrigin] = useState(defaultLicenseSiteUrl)
  const [middlewareByLicense, setMiddlewareByLicense] = useState<Record<string, MiddlewareData>>({})
  const [middlewareLoadingId, setMiddlewareLoadingId] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await requestJson<LicenseData>('/api/admin/licenses'))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as licenças.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const visibleSystems = useMemo(
    () => data.systems.filter((system) => !system.client_id || system.client_id === selectedClient),
    [data.systems, selectedClient],
  )
  const filteredLicenses = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return data.licenses
    return data.licenses.filter((license) => {
      const client = data.clients.find((item) => item.id === license.client_id)?.name ?? ''
      const system = data.systems.find((item) => item.id === license.system_id)?.name ?? ''
      return `${client} ${system} ${license.status}`.toLowerCase().includes(term)
    })
  }, [data, search])

  async function createLicense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await requestJson<{ license: License; licenseKey: string; warning: string | null }>(
        '/api/admin/licenses',
        {
          method: 'POST',
          body: JSON.stringify({
            clientId: form.get('clientId'),
            systemId: form.get('systemId'),
            expiresAt: form.get('expiresAt') || null,
            allowedDomain: form.get('allowedDomain') || null,
          }),
        },
      )
      setNewLicenseKey(result.licenseKey)
      const integration = await requestJson<{ integrationToken: string }>(`/api/admin/licenses/${result.license.id}/integration`, { method: 'POST' })
      setIntegrationToken(integration.integrationToken)
      setNotice(result.warning || 'Licença e integração preparadas. Guarde os dois segredos: eles não serão exibidos novamente.')
      setShowForm(false)
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível criar a licença.')
    } finally {
      setSaving(false)
    }
  }

  async function updateLicense(licenseId: string, changes: { status?: string; expiresAt?: string | null }) {
    setError('')
    setNotice('')
    try {
      const result = await requestJson<{ license: { id: string; status: string; expires_at: string | null }; warning: string | null }>(
        `/api/admin/licenses/${licenseId}`,
        { method: 'PATCH', body: JSON.stringify(changes) },
      )
      setData((current) => ({
        ...current,
        licenses: current.licenses.map((item) => item.id === licenseId
          ? { ...item, status: result.license.status, expires_at: result.license.expires_at }
          : item),
      }))
      if (result.warning) setNotice(result.warning)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Não foi possível atualizar a licença.')
    }
  }

  async function updateModule(licenseId: string, module: Module, contracted: boolean, enabled: boolean) {
    setError('')
    setNotice('')
    try {
      const result = await requestJson<{ warning: string | null }>(
        `/api/admin/licenses/${licenseId}/modules/${module.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ contracted, enabled: contracted && enabled }),
        },
      )
      setData((current) => ({
        ...current,
        licenses: current.licenses.map((license) => license.id === licenseId
          ? {
              ...license,
              modules: license.modules.map((item) => item.id === module.id
                ? { ...item, is_contracted: contracted, is_enabled: contracted && enabled }
                : item),
            }

          : license),
      }))
      if (result.warning) setNotice(result.warning)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Não foi possível atualizar o módulo.')
    }
  }

  async function deleteLicense(license: License) {
    const clientName = data.clients.find((client) => client.id === license.client_id)?.name ?? 'este cliente'
    const systemName = data.systems.find((system) => system.id === license.system_id)?.name ?? 'este sistema'
    if (!window.confirm(`Excluir permanentemente a licença de ${clientName} (${systemName})? Os módulos associados também serão removidos.`)) return

    setDeletingId(license.id)
    setError('')
    setNotice('')
    try {
      const result = await requestJson<{ warning?: string | null }>(`/api/admin/licenses/${license.id}`, { method: 'DELETE' })
      setData((current) => ({ ...current, licenses: current.licenses.filter((item) => item.id !== license.id) }))
      setNotice(result.warning || 'Licença excluída.')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir a licença.')
    } finally {
      setDeletingId('')
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(newLicenseKey)
      setNotice('Chave copiada para a área de transferência.')
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione e copie a chave exibida.')
    }
  }

  async function loadMiddleware(licenseId: string) {
    setMiddlewareLoadingId(licenseId)
    setError('')
    try {
      const result = await requestJson<MiddlewareData>(`/api/admin/licenses/${licenseId}/middleware`)
      setMiddlewareByLicense((current) => ({ ...current, [licenseId]: result }))
    } catch (middlewareError) {
      setError(middlewareError instanceof Error ? middlewareError.message : 'Não foi possível gerar o middleware.')
    } finally {
      setMiddlewareLoadingId('')
    }
  }

  async function copyMiddleware(licenseId: string) {
    const middleware = middlewareByLicense[licenseId]?.middleware
    if (!middleware) return
    try {
      await navigator.clipboard.writeText(middleware)
      setNotice('Middleware copiado para a área de transferência.')
    } catch {
      setError('Não foi possível copiar automaticamente o middleware.')
    }
  }

  function downloadMiddleware(licenseId: string) {
    const middleware = middlewareByLicense[licenseId]?.middleware
    if (!middleware) return
    const blob = new Blob([middleware], { type: 'text/typescript;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'middleware.ts'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <section className="space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Produtos e acesso</p>
        <h1 className="text-2xl font-semibold text-white">Licenças</h1>
        <div className="flex items-start gap-2"><p className="mt-1.5 text-sm text-slate-500">Gerencie chaves, validade, contratação e liberação dos módulos por sistema.</p><IntegrationHelp title="licenças" steps={['Selecione o cliente e o sistema que receberão a licença.', 'Defina a validade, se houver, e emita a licença.', 'Dentro da licença, marque primeiro os módulos contratados.', 'Depois marque Liberado apenas para módulos disponíveis ao cliente.', 'Altere status ou validade quando o acesso precisar ser suspenso ou renovado.']} /></div>
      </div>
      {canManage && <button onClick={() => { setShowForm((value) => !value); setError('') }} className="flex w-fit items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-400">
        {showForm ? <X className="size-4" /> : <Plus className="size-4" />}{showForm ? 'Fechar' : 'Nova licença'}
      </button>}
    </header>

    {error && <div role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

    {newLicenseKey && <div className="rounded-xl border border-blue-400/20 bg-blue-400/[0.06] p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-blue-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-blue-100">Chave de licença — exibida uma única vez</p>
          <code className="mt-2 block break-all rounded-lg bg-black/20 p-3 text-xs text-slate-200">{newLicenseKey}</code>
          {integrationToken && <><p className="mt-4 text-xs font-medium text-blue-100">Token server-to-server — exibido uma única vez</p><code className="mt-2 block break-all rounded-lg bg-black/20 p-3 text-xs text-amber-200">{integrationToken}</code><p className="mt-1 text-[11px] text-slate-500">Configure como CODEXA_LICENSE_KEY apenas no servidor do cliente. Nunca coloque este token no navegador.</p></>}
          <p className="mt-4 text-xs font-medium text-blue-100">Script visual opcional para entregar ao cliente</p>
          <code className="mt-2 block break-all rounded-lg bg-black/20 p-3 text-xs text-slate-300">{`<script src="${scriptOrigin}/client-script.js?token=${newLicenseKey}&api=${encodeURIComponent(`${scriptOrigin}/api/licenses/validate`)}" defer></script>`}</code>
          <button onClick={() => void copyKey()} className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"><Copy className="size-3.5" />Copiar chave</button>
        </div>
        <button onClick={() => setNewLicenseKey('')} aria-label="Ocultar chave" className="rounded p-1 text-slate-500 hover:text-white"><X className="size-4" /></button>
      </div>
    </div>}

    {showForm && <form onSubmit={(event) => void createLicense(event)} className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
      <div className="mb-4"><h2 className="text-sm font-semibold text-white">Emitir licença</h2><p className="mt-1 text-xs text-slate-500">A chave é gerada aleatoriamente e armazenada somente como hash. Informe a URL pública que hospedará o script de validação.</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-xs text-slate-500">URL pública do site
          <input name="siteUrl" type="url" value={scriptOrigin} onChange={(event) => setScriptOrigin(event.target.value.replace(/\/$/, ''))} placeholder={defaultLicenseSiteUrl} required className={`${inputClass} mt-2 w-full`} />
          <span className="mt-1 block text-[11px] text-slate-600">Será usada no script entregue ao cliente. Padrão: {defaultLicenseSiteUrl}</span>
        </label>
        <label className="text-xs text-slate-500">Cliente
          <select required name="clientId" value={selectedClient} onChange={(event) => { setSelectedClient(event.target.value); setSelectedSystem('') }} className={`${inputClass} mt-2 w-full`}>
            <option value="">Selecione o cliente</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Sistema
          <select required name="systemId" value={selectedSystem} onChange={(event) => setSelectedSystem(event.target.value)} className={`${inputClass} mt-2 w-full`}>
            <option value="">Selecione o sistema</option>{visibleSystems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Domínio autorizado (opcional)
          <input name="allowedDomain" type="text" placeholder="cliente.com.br" className={`${inputClass} mt-2 w-full`} />
          <span className="mt-1 block text-[11px] text-slate-600">Aceita o domínio e seus subdomínios. Não inclua protocolo ou caminho.</span>
        </label>
        <label className="text-xs text-slate-500">Válida até (opcional)
          <input name="expiresAt" type="date" className={`${inputClass} mt-2 w-full`} />
        </label>
      </div>
      <button disabled={saving} className="mt-4 flex items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
        {saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}Emitir licença
      </button>
    </form>}

    <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-[#11161e] px-3 py-2.5">
      <Search className="size-4 text-slate-500" />
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por cliente, sistema ou status" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
    </div>

    {loading ? <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#11161e] p-8 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Carregando licenças...</div>
      : filteredLicenses.length ? <div className="space-y-3">{filteredLicenses.map((license) => {
        const client = data.clients.find((item) => item.id === license.client_id)?.name ?? 'Cliente não encontrado'
        const system = data.systems.find((item) => item.id === license.system_id)?.name ?? 'Sistema não encontrado'
        return <article key={license.id} className="rounded-xl border border-white/[0.07] bg-[#11161e]">
          <div className="grid gap-3 border-b border-white/[0.06] px-4 py-3 lg:grid-cols-[1fr_130px_165px_auto] lg:items-center">
            <div><p className="text-sm font-medium text-white">{client}</p><p className="mt-1 text-xs text-slate-500">{system}</p>{license.allowed_domain && <p className="mt-1 text-[11px] text-blue-300/70">Domínio: {license.allowed_domain}</p>}<p className="mt-2 text-[11px] text-slate-600">Criada em {new Date(license.created_at).toLocaleDateString('pt-BR')}</p></div>
            {canManage ? <label className="text-[11px] text-slate-500">Status
              <span className={`mt-1.5 block text-xs font-medium ${licenseStatusLabel(license) === 'Ativa' ? 'text-emerald-200' : 'text-amber-100'}`}>{licenseStatusLabel(license)}</span>
              <select value={license.status} onChange={(event) => void updateLicense(license.id, { status: event.target.value })} className={`${inputClass} mt-1.5 w-full text-xs`}>
                {Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label> : <div className="text-[11px] text-slate-500">Status<span className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${licenseStatusLabel(license) === 'Ativa' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-100'}`}>{licenseStatusLabel(license)}</span></div>}
            {canManage ? <label className="text-[11px] text-slate-500">Expira em
              <input type="date" value={license.expires_at ? new Date(license.expires_at).toISOString().slice(0, 10) : ''} onChange={(event) => void updateLicense(license.id, { expiresAt: event.target.value || null })} className={`${inputClass} mt-1.5 w-full text-xs`} />
            </label> : <div className="text-[11px] text-slate-500">Expira em<span className="mt-2 block text-xs text-slate-300">{license.expires_at ? new Date(license.expires_at).toLocaleDateString('pt-BR') : 'Sem expiração'}</span></div>}
            {canManage && <button type="button" onClick={() => void deleteLicense(license)} disabled={deletingId === license.id} title="Excluir licença permanentemente" aria-label={`Excluir licença de ${client}`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400/20 px-3 py-2.5 text-xs font-medium text-rose-200 hover:bg-rose-400/10 disabled:cursor-wait disabled:opacity-50">
              {deletingId === license.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}<span className="lg:hidden">Excluir</span>
            </button>}
          </div>
          <div className="border-t border-white/[0.06] px-5 py-3"><button type="button" onClick={() => setExpandedLicenseId((current) => current === license.id ? null : license.id)} aria-expanded={expandedLicenseId === license.id} className="flex w-full items-center justify-between text-left text-xs font-medium text-blue-200"><span>{expandedLicenseId === license.id ? 'Ocultar detalhes avançados' : 'Ver detalhes avançados'}</span><span>{license.modules.filter((module) => module.is_enabled).length} módulos liberados</span></button></div>
          {expandedLicenseId === license.id && <div className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-xs font-semibold text-slate-200">Módulos contratados e liberados</h2><p className="mt-1 text-[11px] text-slate-600">A liberação só fica disponível após marcar o módulo como contratado.</p></div>
              <span className="text-[11px] text-slate-500">{license.modules.filter((module) => module.is_enabled).length} liberados</span>
            </div>
            {license.modules.length ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{license.modules.map((module) => <div key={module.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
              <div className="min-w-0"><p className="truncate text-xs font-medium text-slate-200">{module.name}</p><p className="mt-1 truncate font-mono text-[10px] text-slate-600">{module.internal_code} · {module.availability_status}</p></div>
              <div className="flex shrink-0 items-center gap-3">
                <label className="flex items-center gap-1.5 text-[10px] text-slate-500"><input type="checkbox" checked={module.is_contracted} disabled={!canManage} onChange={(event) => void updateModule(license.id, module, event.target.checked, event.target.checked && module.is_enabled)} className="accent-blue-500 disabled:opacity-40" />Contratado</label>
                <label className="flex items-center gap-1.5 text-[10px] text-slate-500"><input type="checkbox" checked={module.is_enabled} disabled={!canManage || !module.is_contracted || !isModuleAvailable(module.availability_status)} onChange={(event) => void updateModule(license.id, module, module.is_contracted, event.target.checked)} className="accent-emerald-500 disabled:opacity-40" />Liberado</label>
              </div>
            </div>)}</div> : <p className="rounded-lg border border-dashed border-white/[0.08] p-5 text-center text-xs text-slate-600">Nenhum módulo cadastrado para este sistema.</p>}
            <div className="mt-6 rounded-lg border border-blue-400/15 bg-blue-400/[0.04] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-xs font-semibold text-blue-100">Middleware para o projeto do cliente</h3><p className="mt-1 text-[11px] text-slate-500">Gere o arquivo e copie para <code>middleware.ts</code> na raiz do projeto Next.js do cliente.</p></div>
                <button type="button" onClick={() => void loadMiddleware(license.id)} disabled={middlewareLoadingId === license.id} className="rounded-lg bg-blue-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-400 disabled:opacity-50">{middlewareLoadingId === license.id ? 'Gerando...' : middlewareByLicense[license.id] ? 'Regenerar arquivo' : 'Gerar middleware'}</button>
              </div>
              {middlewareByLicense[license.id] && <>
                {middlewareByLicense[license.id].warnings.map((warning) => <p key={warning} role="alert" className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">{warning}</p>)}
                <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 p-3 text-[11px] text-slate-400">
                  <p className="font-medium text-slate-200">Rotas protegidas: {middlewareByLicense[license.id].routes.length}</p>
                  {middlewareByLicense[license.id].routes.length ? <ul className="mt-2 flex flex-col gap-1">{middlewareByLicense[license.id].routes.map((route) => <li key={`${route.routePattern}-${route.moduleCode}`}>{route.routePattern} → {route.moduleCode}</li>)}</ul> : <p className="mt-1">Configure as associações de rota e módulo antes de usar este arquivo em produção.</p>}
                  <p className="mt-2">API central: https://gestao-de-software-house.vercel.app/api/licenses/validate · Variável necessária: CODEXA_LICENSE_KEY</p>
                </div>
                <textarea readOnly value={middlewareByLicense[license.id].middleware} aria-label="Código do middleware" className="mt-3 min-h-64 w-full rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[10px] leading-relaxed text-slate-300 outline-none" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void copyMiddleware(license.id)} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-slate-200 hover:bg-white/5">Copiar código</button><button type="button" onClick={() => downloadMiddleware(license.id)} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-slate-200 hover:bg-white/5">Baixar middleware.ts</button></div></>}
            </div>
          </div>}
        </article>
      })}</div> : <div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-10 text-center"><Check className="mx-auto size-6 text-slate-600" /><p className="mt-3 text-sm text-slate-400">Nenhuma licença encontrada</p><p className="mt-1 text-xs text-slate-600">Emita uma licença para começar a controlar o acesso aos módulos.</p></div>}
  </section>
}
