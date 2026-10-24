'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EntityAttachments } from '@/components/entity-attachments'
import { uploadContractAttachment } from '@/lib/contract-attachments'
import { BriefcaseBusiness, Eye, FileText, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { ListingControls } from '@/components/listing-controls'

type Tab = 'proposals' | 'contracts'
type Contract = { id: string; contract_number: string; title: string; status: string; contracted_value: number; ends_at: string | null; client_id: string | null; proposal_id: string | null; contract_type: string | null; description: string | null; starts_at: string | null; observations: string | null }
type Proposal = { id: string; proposal_number: string; title: string; status: string; total: number; valid_until: string | null; client_id: string | null; lead_id: string | null; description: string | null }
type Client = { id: string; legal_name: string; trade_name: string | null }

const proposalStatuses = ['Rascunho', 'Enviada', 'Em negociação', 'Aprovada', 'Rejeitada', 'Cancelada', 'Expirada'] as const
const proposalStatusSet = new Set<string>(proposalStatuses)

const inputClass = 'w-full rounded-lg border border-white/10 bg-[#151b24] p-3 text-sm text-white'
const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))

export function CommercialWorkspace({ initialTab = 'proposals', permissions = [] }: { initialTab?: Tab; permissions?: string[] }) {
  const [tab, setTab] = useState(initialTab)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)
  const [modal, setModal] = useState(false)
  const [record, setRecord] = useState<Contract | Proposal | null>(null)
  const [editingRecord, setEditingRecord] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [contractResult, proposalResult, clientResult] = await Promise.all([
      supabase.from('contracts').select('id,contract_number,title,status,contracted_value,ends_at,client_id,proposal_id,contract_type,description,starts_at,observations').order('created_at', { ascending: false }),
      supabase.from('proposals').select('id,proposal_number,title,status,total,valid_until,client_id,lead_id,description').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,legal_name,trade_name').order('legal_name'),
    ])
    if (contractResult.error || proposalResult.error || clientResult.error) setError('Não foi possível carregar os registros comerciais.')
    setContracts((contractResult.data ?? []) as Contract[])
    setProposals((proposalResult.data ?? []) as Proposal[])
    setClients((clientResult.data ?? []) as Client[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const rows = useMemo(() => {
    const term = query.toLowerCase()
    return tab === 'contracts'
      ? contracts.filter((item) => `${item.contract_number} ${item.title} ${item.status}`.toLowerCase().includes(term) && (!statusFilter || item.status === statusFilter))
      : proposals.filter((item) => `${item.proposal_number} ${item.title} ${item.status}`.toLowerCase().includes(term) && (!statusFilter || item.status === statusFilter))
  }, [tab, contracts, proposals, query, statusFilter])
  const pageRows = rows.slice(page * 10, page * 10 + 10)
  const statusOptions = [...new Set(rows.map((item) => item.status).filter(Boolean))]
  const canCreate = permissions.includes('*') || permissions.includes(`${tab}:create`)
  const canUpdate = permissions.includes('*') || permissions.includes(`${tab}:update`)
  const canDelete = permissions.includes('*') || permissions.includes(`${tab}:delete`)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate) {
      setError(`Seu cargo não tem permissão para criar ${tab === 'contracts' ? 'contratos' : 'propostas'}.`)
      return
    }
    setSaving(true)
    setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const client = createClient()
    try {
      if (tab === 'proposals') {
        const unit = Number(data.unit_value || 0)
        const quantity = Number(data.quantity || 1)
        const discount = Number(data.discount || 0)
        const status = String(data.status || 'Rascunho')
        if (!proposalStatusSet.has(status)) throw new Error('Status de proposta inválido.')
        const { error: insertError } = await client.from('proposals').insert({
          proposal_number: `PROP-${Date.now()}`,
          title: data.title,
          description: data.description || null,
          items: [{ description: data.item_description, quantity, unit_value: unit }],
          subtotal: unit * quantity,
          discount,
          total: Math.max(0, unit * quantity - discount),
          valid_until: data.valid_until || null,
          client_id: data.client_id || null,
          status,
        })
        if (insertError) throw insertError
      } else {
        const file = data.document instanceof File ? data.document : undefined
        if (file?.size && (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024)) {
          setError('O documento deve ser PDF e ter no máximo 10 MB.')
          return
        }
        const { data: created, error: insertError } = await client.from('contracts').insert({
          contract_number: `CONT-${Date.now()}`,
          title: data.title,
          description: data.description || null,
          contract_type: data.contract_type || 'Prestação de serviços',
          client_id: data.client_id || null,
          starts_at: data.starts_at || null,
          ends_at: data.ends_at || null,
          contracted_value: Number(data.contracted_value || 0),
          status: data.status || 'Preparação',
          observations: data.observations || null,
        }).select('id').single()
        if (insertError) throw insertError
        if (file?.size) {
          try {
            await uploadContractAttachment(created.id, file)
          } catch (cause) {
            console.error('Contract attachment upload failed:', cause)
            setError(`Contrato criado, mas o anexo não foi salvo: ${cause instanceof Error ? cause.message : 'erro inesperado'}`)
          }
        }
      }
      setModal(false)
      await load()
    } catch (cause) {
      console.error('Commercial record creation failed:', cause)
      const message = cause instanceof Error ? cause.message : 'erro inesperado'
      setError(`Não foi possível salvar: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!record || !canUpdate) return
    setSaving(true)
    setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const proposalStatus = String(data.status || '')
    if (tab === 'proposals' && !proposalStatusSet.has(proposalStatus)) {
      setError('Selecione um status válido para a proposta.')
      setSaving(false)
      return
    }
    const payload = tab === 'contracts'
      ? { title: data.title, description: data.description || null, contract_type: data.contract_type || 'Prestação de serviços', client_id: data.client_id || null, starts_at: data.starts_at || null, ends_at: data.ends_at || null, contracted_value: Number(data.amount || 0), status: data.status, observations: data.observations || null }
      : { title: data.title, description: data.description || null, client_id: data.client_id || null, total: Number(data.amount || 0), valid_until: data.valid_until || null, status: proposalStatus }
    const { error: updateError } = await createClient().from(tab).update(payload).eq('id', record.id)
    if (updateError) {
      console.error('Commercial record update failed:', updateError.message)
      setError(`Não foi possível salvar as alteraç��es: ${updateError.message}`)
    } else {
      setEditingRecord(false)
      setRecord(null)
      await load()
    }
    setSaving(false)
  }

  async function remove(id: string) {
    if (!canDelete || !window.confirm('Excluir este registro?')) return
    const { error: deleteError } = await createClient().from(tab).delete().eq('id', id)
    if (deleteError) setError(`Não foi possível excluir: ${deleteError.message}`)
    else await load()
  }

  const recordClientName = record?.client_id
    ? clients.find((client) => client.id === record.client_id)?.trade_name || clients.find((client) => client.id === record.client_id)?.legal_name
    : null

  return <section className="mt-6 rounded-xl border border-white/[0.07] bg-[#11161e]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-5">
      <div><p className="text-xs uppercase tracking-[0.16em] text-violet-400">Comercial e documentos</p><h2 className="mt-1 text-lg font-semibold text-white">{tab === 'contracts' ? 'Contratos' : 'Propostas'}</h2></div>
      <div className="flex gap-2">
        <button onClick={() => { setTab('proposals'); setRecord(null) }} className={`rounded-lg px-3 py-2 text-xs ${tab === 'proposals' ? 'bg-violet-500 text-white' : 'bg-white/[0.04] text-slate-400'}`}>Propostas</button>
        <button onClick={() => { setTab('contracts'); setRecord(null) }} className={`rounded-lg px-3 py-2 text-xs ${tab === 'contracts' ? 'bg-violet-500 text-white' : 'bg-white/[0.04] text-slate-400'}`}>Contratos</button>
        <button disabled={!canCreate} title={canCreate ? undefined : 'Seu cargo não tem permissão para criar neste módulo'} onClick={() => { setError(''); setModal(true) }} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="mr-1 inline size-3.5" />Novo</button>
      </div>
    </div>
    <div className="flex gap-2 border-b border-white/[0.07] p-4"><Search className="size-4 text-slate-600" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} placeholder="Pesquisar..." className="w-full bg-transparent text-sm text-white outline-none" /></div>
    <ListingControls total={rows.length} page={page} onPageChange={setPage} hasActiveFilters={Boolean(statusFilter)} onClear={() => { setStatusFilter(''); setPage(0) }}>
      <label className="text-xs text-slate-400">Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0) }} className={`${inputClass} mt-1 min-w-44`}><option value="">Todos os status</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
    </ListingControls>
    {error && <p role="alert" className="m-4 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-300">{error}</p>}
    {loading ? <div className="p-8 text-center text-xs text-slate-500">Carregando...</div> : <div className="divide-y divide-white/[0.06]">
      {pageRows.map((row) => <div key={row.id} className="flex items-center gap-3 p-4">
        <div className="grid size-9 place-items-center rounded-lg bg-violet-500/10 text-violet-300">{tab === 'contracts' ? <BriefcaseBusiness className="size-4" /> : <FileText className="size-4" />}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-200">{row.title}</p><p className="text-xs text-slate-500">{'contract_number' in row ? row.contract_number : row.proposal_number} · {row.status}</p></div>
        <button onClick={() => { setRecord(row); setEditingRecord(false); setError('') }} aria-label={`Ver detalhes de ${row.title}`} title="Ver detalhes e anexos" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-2 text-xs text-slate-300 hover:bg-white/[0.04]"><Eye className="size-3.5" />Detalhes</button>
        {canUpdate && <button onClick={() => { setRecord(row); setEditingRecord(true); setError('') }} aria-label={`Editar ${row.title}`} className="rounded p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil className="size-4" /></button>}
        {canDelete && <button onClick={() => void remove(row.id)} className="p-2 text-slate-600 hover:text-rose-300" aria-label="Excluir"><Trash2 className="size-4" /></button>}
      </div>)}
      {!rows.length && <p className="p-8 text-center text-sm text-slate-500">Nenhum registro encontrado.</p>}
    </div>}
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#11161e] p-6">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-white">Novo {tab === 'contracts' ? 'contrato' : 'proposta'}</h3><button type="button" onClick={() => setModal(false)} aria-label="Fechar"><X className="text-slate-400" /></button></div>
      <div className="mt-5 grid gap-3"><input name="title" required placeholder="Título" className={inputClass} /><select name="client_id" className={inputClass}><option value="">Cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.trade_name || client.legal_name}</option>)}</select>{tab === 'proposals' && <label className="text-xs text-slate-400">Status<select name="status" defaultValue="Rascunho" className={`${inputClass} mt-1`}>{proposalStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>}<input name={tab === 'proposals' ? 'unit_value' : 'contracted_value'} type="number" step="0.01" placeholder={tab === 'proposals' ? 'Valor unitário' : 'Valor contratado'} className={inputClass} />{tab === 'contracts' && <label className="rounded-lg border border-dashed border-violet-400/30 p-4 text-xs text-slate-400">PDF do contrato<input name="document" type="file" accept="application/pdf,.pdf" className="mt-2 block w-full text-xs" /></label>}{tab === 'proposals' && <><input name="quantity" type="number" min="1" step="1" defaultValue="1" placeholder="Quantidade" className={inputClass} /><input name="discount" type="number" min="0" step="0.01" defaultValue="0" placeholder="Desconto" className={inputClass} /><input name="item_description" required placeholder="Descrição do item" className={inputClass} /></>}<textarea name="description" placeholder="Descrição ou observações" className={`${inputClass} min-h-24`} /></div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-300">{error}</p>}<button disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 py-3 text-sm font-semibold text-white">{saving && <Loader2 className="size-4 animate-spin" />}Salvar</button>
    </form></div>}
    {record && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecord(null) }}>
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#11161e] p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-violet-300">{tab === 'contracts' ? 'Contrato' : 'Proposta'} · {'contract_number' in record ? record.contract_number : record.proposal_number}</p><h3 className="mt-1 text-lg font-semibold text-white">{editingRecord ? 'Editar registro' : record.title}</h3></div><button type="button" onClick={() => setRecord(null)} aria-label="Fechar detalhes"><X className="size-5 text-slate-400" /></button></div>
        {editingRecord ? <form onSubmit={(event) => void saveRecord(event)} className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400 sm:col-span-2">Título<input name="title" required defaultValue={record.title} className={`${inputClass} mt-1`} /></label>
          <label className="text-xs text-slate-400">Cliente<select name="client_id" defaultValue={record.client_id || ''} className={`${inputClass} mt-1`}><option value="">Sem cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.trade_name || client.legal_name}</option>)}</select></label>
          <label className="text-xs text-slate-400">Status{'contract_number' in record ? <input name="status" required defaultValue={record.status} className={`${inputClass} mt-1`} /> : <select name="status" required defaultValue={record.status} className={`${inputClass} mt-1`}>{!proposalStatusSet.has(record.status) && <option value={record.status}>{record.status}</option>}{proposalStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>}</label>
          <label className="text-xs text-slate-400">Valor (R$)<input name="amount" type="number" min="0" step="0.01" defaultValue={'contracted_value' in record ? record.contracted_value : record.total} className={`${inputClass} mt-1`} /></label>
          {'contract_number' in record ? <>
            <label className="text-xs text-slate-400">Tipo<input name="contract_type" defaultValue={record.contract_type || ''} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-slate-400">Início<input name="starts_at" type="date" defaultValue={record.starts_at || ''} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-slate-400">Término<input name="ends_at" type="date" defaultValue={record.ends_at || ''} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-slate-400 sm:col-span-2">Observações<textarea name="observations" defaultValue={record.observations || record.description || ''} className={`${inputClass} mt-1 min-h-20`} /></label>
          </> : <>
            <label className="text-xs text-slate-400">Validade<input name="valid_until" type="date" defaultValue={record.valid_until || ''} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-slate-400 sm:col-span-2">Descrição<textarea name="description" defaultValue={record.description || ''} className={`${inputClass} mt-1 min-h-20`} /></label>
          </>}
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setEditingRecord(false)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Cancelar</button><button disabled={saving} className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white">{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
        </form> : <>
          <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><p className="text-slate-400">Cliente<span className="mt-1 block text-slate-200">{recordClientName || 'Não associado'}</span></p><p className="text-slate-400">Status<span className="mt-1 block text-slate-200">{record.status}</span></p><p className="text-slate-400">Valor<span className="mt-1 block text-slate-200">{currency('contracted_value' in record ? record.contracted_value : record.total)}</span></p><p className="text-slate-400">{'contract_number' in record ? 'Vigência' : 'Validade'}<span className="mt-1 block text-slate-200">{'contract_number' in record ? `${record.starts_at || '—'} até ${record.ends_at || '—'}` : record.valid_until || 'Não informada'}</span></p><p className="whitespace-pre-wrap text-slate-400 sm:col-span-2">{'contract_number' in record ? record.observations || record.description || 'Sem observações.' : record.description || 'Sem descrição.'}</p></div>
          {'contract_number' in record && <EntityAttachments entityType="contract" entityId={record.id} canUpload={permissions.includes('*') || permissions.includes('attachments:upload')} canDownload={permissions.includes('*') || permissions.includes('attachments:download')} canDelete={permissions.includes('*') || permissions.includes('attachments:delete')} />}
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRecord(null)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Fechar</button>{canUpdate && <button type="button" onClick={() => setEditingRecord(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white"><Pencil className="size-3.5" />Editar</button>}</div>
        </>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-300">{error}</p>}
      </div>
    </div>}
  </section>
}
