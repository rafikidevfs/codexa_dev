'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CircleDollarSign, Download, Eye, Pencil, Plus, RefreshCw, Search, TrendingDown, TrendingUp, WalletCards, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ListingControls } from '@/components/listing-controls'

type Receivable = { id: string; description: string; category: string; final_amount: number; paid_amount: number; due_date: string; status: string }
type Payable = { id: string; beneficiary: string; description: string; amount: number; paid_amount: number; due_date: string; status: string }
type FinanceRecord = Receivable | Payable
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
const inputClass = 'w-full rounded-lg border border-white/10 bg-[#151b24] px-3 py-2 text-sm text-white'

export function FinanceWorkspace({ initialTab = 'overview', permissions = [] }: { initialTab?: 'overview' | 'receivable' | 'payable' | 'recurring'; permissions?: string[] }) {
  const [tab, setTab] = useState<'overview' | 'receivable' | 'payable' | 'recurring'>(initialTab)
  const [receivables, setReceivables] = useState<Receivable[]>([])
  const [payables, setPayables] = useState<Payable[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ description: '', amount: '', due_date: '' })
  const [message, setMessage] = useState('')
  const [record, setRecord] = useState<FinanceRecord | null>(null)
  const [editingRecord, setEditingRecord] = useState(false)
  const [saving, setSaving] = useState(false)
  const permissionModule = tab === 'payable' ? 'accounts_payable' : 'accounts_receivable'
  const canCreate = permissions.includes('*') || permissions.includes(`${permissionModule}:create`)
  const canUpdate = permissions.includes('*') || permissions.includes(`${permissionModule}:update`)

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [receivableResult, payableResult] = await Promise.all([
      supabase.from('accounts_receivable').select('id,description,category,final_amount,paid_amount,due_date,status').order('due_date'),
      supabase.from('accounts_payable').select('id,beneficiary,description,amount,paid_amount,due_date,status').order('due_date'),
    ])
    if (receivableResult.error || payableResult.error) {
      const loadError = receivableResult.error || payableResult.error
      setMessage(`Não foi possível carregar lançamentos: ${loadError.message}`)
    }
    setReceivables((receivableResult.data ?? []) as Receivable[])
    setPayables((payableResult.data ?? []) as Payable[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selectedPermission = tab === 'payable' ? 'accounts_payable:create' : 'accounts_receivable:create'
    if (!permissions.includes('*') && !permissions.includes(selectedPermission)) return
    setSaving(true)
    const supabase = createClient()
    const amount = Number(form.amount)
    const table = tab === 'payable' ? 'accounts_payable' : 'accounts_receivable'
    const payload = tab === 'payable' ? { beneficiary: 'A definir', description: form.description, amount, paid_amount: 0, due_date: form.due_date, status: 'Pendente' } : { description: form.description, original_amount: amount, final_amount: amount, paid_amount: 0, due_date: form.due_date, status: 'Pendente' }
    const { error: insertError } = await supabase.from(table).insert(payload)
    if (insertError) setMessage(`Não foi possível salvar o lançamento: ${insertError.message}`)
    else { setMessage('Lançamento criado.'); setShowForm(false); setForm({ description: '', amount: '', due_date: '' }); await load() }
    setSaving(false)
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!record || !canUpdate) return
    setSaving(true)
    setMessage('')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const table = tab === 'payable' ? 'accounts_payable' : 'accounts_receivable'
    const payload = tab === 'payable'
      ? { beneficiary: data.beneficiary, description: data.description, due_date: data.due_date, ...(record.paid_amount === 0 ? { amount: Number(data.amount) } : {}) }
      : { description: data.description, due_date: data.due_date, ...(record.paid_amount === 0 ? { final_amount: Number(data.amount), original_amount: Number(data.amount) } : {}) }
    const { error: updateError } = await createClient().from(table).update(payload).eq('id', record.id)
    if (updateError) setMessage(`Não foi possível salvar as alterações: ${updateError.message}`)
    else { setRecord(null); setEditingRecord(false); await load() }
    setSaving(false)
  }

  const filteredReceivables = useMemo(() => receivables.filter((item) => `${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase())), [receivables, query])
  const filteredPayables = useMemo(() => payables.filter((item) => `${item.description} ${item.beneficiary}`.toLowerCase().includes(query.toLowerCase())), [payables, query])
  const visibleFinanceRows = tab === 'payable' ? filteredPayables.slice(page * 10, page * 10 + 10) : filteredReceivables.slice(page * 10, page * 10 + 10)
  const received = receivables.reduce((sum, item) => sum + Number(item.final_amount || 0), 0)
  const expenses = payables.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const overdue = receivables.filter((item) => item.status !== 'Pago' && item.due_date < new Date().toISOString().slice(0, 10)).reduce((sum, item) => sum + Number(item.final_amount || 0), 0)
  const tabs = [['overview', 'Visão geral'], ['receivable', 'A receber'], ['payable', 'A pagar'], ['recurring', 'Recorrências']] as const
  const financeCards: Array<{ label: string; value: string; icon: typeof TrendingUp; tone: string }> = [
    { label: 'A receber', value: money(received), icon: TrendingUp, tone: 'text-emerald-400' },
    { label: 'A pagar', value: money(expenses), icon: TrendingDown, tone: 'text-rose-400' },
    { label: 'Saldo projetado', value: money(received - expenses), icon: WalletCards, tone: 'text-blue-400' },
    { label: 'Em atraso', value: money(overdue), icon: CircleDollarSign, tone: 'text-amber-400' },
  ]

  return <section className="space-y-6" id="finance-workspace">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Financeiro</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Controle financeiro</h1><p className="mt-1 text-sm text-slate-500">Recebimentos, despesas e recorrências em um só lugar.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="rounded-lg border border-white/[0.08] p-2.5 text-slate-400 hover:text-white" aria-label="Atualizar"><RefreshCw className="size-4" /></button><button disabled={!canCreate} onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="size-4" />Novo lançamento</button></div></div>
    <div className="flex gap-1 overflow-x-auto border-b border-white/[0.07]">{tabs.map(([value, label]) => <button key={value} onClick={() => { setTab(value); setRecord(null); setEditingRecord(false) }} className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs ${tab === value ? 'border-blue-400 text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>{label}</button>)}</div>
    {message && <p role="status" className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-xs text-blue-300">{message}</p>}
    {showForm && <form onSubmit={(event) => void createEntry(event)} className="grid gap-3 rounded-xl border border-white/[0.08] bg-[#11161e] p-5 sm:grid-cols-[1fr_160px_170px_auto]"><input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descrição" className={inputClass} /><input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="Valor" className={inputClass} /><input required type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} className={inputClass} /><button disabled={saving} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar'}</button></form>}
    {tab === 'overview' && <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{financeCards.map(({ label, value, icon: MetricIcon, tone }) => <article key={label} className="rounded-xl border border-white/[0.07] bg-[#11161e] p-4"><MetricIcon className={`size-5 ${tone}`} /><p className="mt-4 text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p></article>)}</div><div className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5"><h2 className="text-sm font-semibold text-slate-200">Resumo financeiro</h2><p className="mt-2 text-xs leading-5 text-slate-500">Use as abas para consultar lançamentos, registrar pagamentos e acompanhar recorrências.</p></div></>}
    {tab !== 'overview' && <div className="rounded-xl border border-white/[0.07] bg-[#11161e]"><div className="flex items-center justify-between border-b border-white/[0.07] p-4"><div className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2"><Search className="size-4 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lançamento" className="bg-transparent text-xs text-white outline-none" /></div><button className="hidden items-center gap-2 text-xs text-slate-500 hover:text-white sm:flex"><Download className="size-3.5" />Exportar</button></div>
      {loading ? <p className="p-8 text-center text-xs text-slate-500">Carregando lançamentos...</p> : tab === 'recurring' ? <p className="p-8 text-center text-xs text-slate-500">Nenhuma cobrança recorrente cadastrada.</p> : <><ListingControls total={tab === 'payable' ? filteredPayables.length : filteredReceivables.length} page={page} onPageChange={setPage} hasActiveFilters={Boolean(query)} onClear={() => { setQuery(''); setPage(0) }} /><div className="divide-y divide-white/[0.06]">{visibleFinanceRows.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="text-sm text-slate-200">{item.description}</p><p className="mt-1 text-[11px] text-slate-500">{'beneficiary' in item ? item.beneficiary : item.category} · vencimento {item.due_date ? new Date(`${item.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informado'}</p></div><div className="flex items-center gap-3"><div className="text-right"><p className="text-sm font-semibold text-white">{money('amount' in item ? item.amount : item.final_amount)}</p><p className="text-[11px] text-slate-500">{item.status}</p></div><button onClick={() => { setRecord(item); setEditingRecord(false); setMessage('') }} aria-label="Ver detalhes" className="rounded p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Eye className="size-4" /></button>{canUpdate && <button onClick={() => { setRecord(item); setEditingRecord(true); setMessage('') }} aria-label="Editar lançamento" className="rounded p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil className="size-4" /></button>}</div></div>)}      </div></>}
    </div>}
    {record && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecord(null) }}><div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-blue-300">{'beneficiary' in record ? 'Conta a pagar' : 'Conta a receber'}</p><h3 className="mt-1 text-lg font-semibold text-white">{editingRecord ? 'Editar lançamento' : record.description}</h3></div><button type="button" onClick={() => setRecord(null)} aria-label="Fechar detalhes"><X className="size-5 text-slate-400" /></button></div>
      {editingRecord ? <form onSubmit={(event) => void saveRecord(event)} className="grid gap-3">
        {'beneficiary' in record && <label className="text-xs text-slate-400">Beneficiário<input name="beneficiary" required defaultValue={record.beneficiary} className={`${inputClass} mt-1`} /></label>}
        <label className="text-xs text-slate-400">Descrição<input name="description" required defaultValue={record.description} className={`${inputClass} mt-1`} /></label>
        <label className="text-xs text-slate-400">Vencimento<input name="due_date" type="date" required defaultValue={record.due_date?.slice(0, 10) || ''} className={`${inputClass} mt-1`} /></label>
        <label className="text-xs text-slate-400">Valor<input name="amount" type="number" min="0.01" step="0.01" required disabled={record.paid_amount > 0} defaultValue={'amount' in record ? record.amount : record.final_amount} className={`${inputClass} mt-1 disabled:opacity-50`} /></label>
        {record.paid_amount > 0 && <p className="text-xs text-amber-300">O valor não pode ser alterado após a existência de pagamentos registrados.</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingRecord(false)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white">{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
      </form> : <><div className="grid gap-4 text-sm sm:grid-cols-2"><p className="text-slate-400">Valor<span className="mt-1 block text-slate-200">{money('amount' in record ? record.amount : record.final_amount)}</span></p><p className="text-slate-400">Pago<span className="mt-1 block text-slate-200">{money(record.paid_amount)}</span></p><p className="text-slate-400">Vencimento<span className="mt-1 block text-slate-200">{record.due_date ? new Date(`${record.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informado'}</span></p><p className="text-slate-400">Status<span className="mt-1 block text-slate-200">{record.status}</span></p><p className="text-slate-400 sm:col-span-2">{'beneficiary' in record ? 'Beneficiário' : 'Categoria'}<span className="mt-1 block text-slate-200">{'beneficiary' in record ? record.beneficiary : record.category}</span></p></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setRecord(null)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Fechar</button>{canUpdate && <button onClick={() => setEditingRecord(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white"><Pencil className="size-3.5" />Editar</button>}</div></>}
    </div></div>}
  </section>
}
