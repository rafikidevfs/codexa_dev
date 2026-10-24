'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import Image from 'next/image'
import { CrmWorkspace } from '@/components/crm-workspace'
import { CommercialWorkspace } from '@/components/commercial-workspace'
import { OperationsWorkspace } from '@/components/operations-workspace'
import { CatalogWorkspace } from '@/components/catalog-workspace'
import { FinanceWorkspace } from '@/components/finance-workspace'
import { AdminWorkspace } from '@/components/admin-workspace'
import { ReportsWorkspace } from '@/components/reports-workspace'
import { ActivityHistoryWorkspace } from '@/components/activity-history-workspace'
import { AccountWorkspace } from '@/components/account-workspace'
import { AuthScreen } from '@/components/auth-screen'
import { createClient } from '@/lib/supabase/client'
import { hasWorkspaceAccess } from '@/lib/workspace-access'
import { applyWorkspaceTheme, getWorkspaceThemePreference } from '@/lib/workspace-theme'
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  Headphones,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from 'lucide-react'

const navigationGroups = [
  { label: 'Workspace', items: [{ label: 'Dashboard', icon: LayoutDashboard }] },
  { label: 'Relacionamento', items: [
    { label: 'Leads', icon: Inbox },
    { label: 'Clientes', icon: Building2 },
    { label: 'Contatos', icon: Users },
  ] },
  { label: 'Comercial', items: [
    { label: 'Propostas', icon: FileText },
    { label: 'Contratos', icon: BriefcaseBusiness },
  ] },
  { label: 'Operações', items: [
    { label: 'Projetos', icon: FolderKanban },
    { label: 'Tarefas', icon: ClipboardList },
    { label: 'Solicitações de alteração', icon: ClipboardList },
    { label: 'Suporte', icon: Headphones },
  ] },
  { label: 'Produtos', items: [
    { label: 'Sistemas dos clientes', icon: Gauge },
    { label: 'Módulos', icon: PanelsTopLeft },
    { label: 'Planos', icon: WalletCards },
    { label: 'Licenças', icon: ShieldCheck },
  ] },
  { label: 'Financeiro', items: [
    { label: 'Contas a receber', icon: CircleDollarSign },
    { label: 'Contas a pagar', icon: CircleDollarSign },
    { label: 'Fluxo de caixa', icon: CircleDollarSign },
    { label: 'Transações', icon: CircleDollarSign },
    { label: 'Categorias financeiras', icon: CircleDollarSign },
  ] },
  { label: 'Administração', items: [
    { label: 'Relatórios', icon: Activity },
    { label: 'Equipe', icon: Users },
    { label: 'Usuários', icon: Users },
    { label: 'Papéis e permissões', icon: ShieldCheck },
    { label: 'Auditoria', icon: Activity },
  ] },
  { label: 'Conta', items: [
    { label: 'Meu perfil', icon: Users },
    { label: 'Meu histórico', icon: Activity },
    { label: 'Configurações', icon: Settings },
    { label: 'Aparência', icon: PanelsTopLeft },
  ] },
]

const sectionSlugs: Record<string, string> = {
  Dashboard: 'dashboard', Leads: 'leads', Clientes: 'clientes', Contatos: 'contatos', Propostas: 'propostas', Contratos: 'contratos',
  Projetos: 'projetos', Tarefas: 'tarefas', 'Solicitações de alteração': 'solicitacoes', Suporte: 'suporte', 'Sistemas dos clientes': 'sistemas',
  Módulos: 'modulos', Planos: 'planos', Licenças: 'licencas', 'Contas a receber': 'contas-a-receber', 'Contas a pagar': 'contas-a-pagar',
  'Fluxo de caixa': 'fluxo-de-caixa', Transações: 'transacoes', 'Categorias financeiras': 'categorias-financeiras', Relatórios: 'relatorios', Equipe: 'equipe',
  Usuários: 'usuarios', 'Papéis e permissões': 'papeis-e-permissoes', 'Meu perfil': 'meu-perfil', 'Meu histórico': 'meu-historico', Configurações: 'configuracoes', Aparência: 'aparencia', Auditoria: 'auditoria',
}

const metrics = [
  { label: 'Leads ativos', value: '0', hint: 'Nenhum lead cadastrado', icon: Inbox, tone: 'blue' },
  { label: 'Clientes ativos', value: '0', hint: 'Nenhum cliente cadastrado', icon: Building2, tone: 'violet' },
  { label: 'Projetos em andamento', value: '0', hint: 'Nenhum projeto cadastrado', icon: FolderKanban, tone: 'cyan' },
  { label: 'Chamados abertos', value: '0', hint: 'Nenhum chamado aberto', icon: Headphones, tone: 'amber' },
  { label: 'Contratos ativos', value: '0', hint: 'Nenhum contrato cadastrado', icon: BriefcaseBusiness, tone: 'emerald' },
  { label: 'Valores a receber', value: 'R$ 0,00', hint: 'Nenhum lançamento pendente', icon: CircleDollarSign, tone: 'teal' },
  { label: 'Valores vencidos', value: 'R$ 0,00', hint: 'Nenhum lançamento vencido', icon: WalletCards, tone: 'rose' },
  { label: 'Receita no mês', value: 'R$ 0,00', hint: 'Nenhum recebimento registrado', icon: CircleDollarSign, tone: 'indigo' },
]

const toneClasses: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-400',
  violet: 'bg-violet-500/10 text-violet-400',
  cyan: 'bg-cyan-500/10 text-cyan-400',
  amber: 'bg-amber-500/10 text-amber-400',
  emerald: 'bg-emerald-500/10 text-emerald-400',
  teal: 'bg-teal-500/10 text-teal-400',
  rose: 'bg-rose-500/10 text-rose-400',
  indigo: 'bg-indigo-500/10 text-indigo-400',
}

type WorkspaceNotification = { id: string; message: string; notification_type: string; entity_type?: string | null; entity_id?: string | null; link_path?: string | null; read_at: string | null; created_at: string }
type SearchItem = { label: string; slug: string; group: string }

function DashboardContent({ initialSection = 'Dashboard', page, permissions, profileName = '' }: { initialSection?: string; page?: ReactNode; permissions: string[]; profileName?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeSection, setActiveSection] = useState(initialSection)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState('')
  const [actionableNotificationIds, setActionableNotificationIds] = useState<string[]>([])
  const searchInput = useRef<HTMLInputElement>(null)
  const displayName = profileName.trim() || 'Usuário'
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  useEffect(() => {
    setActiveSection(initialSection)
  }, [initialSection, pathname])

  useEffect(() => {
    const applySavedTheme = () => applyWorkspaceTheme(getWorkspaceThemePreference())
    applySavedTheme()
    const colorScheme = window.matchMedia('(prefers-color-scheme: light)')
    const onSystemThemeChange = () => {
      if (getWorkspaceThemePreference() === 'system') applySavedTheme()
    }
    colorScheme.addEventListener('change', onSystemThemeChange)
    return () => colorScheme.removeEventListener('change', onSystemThemeChange)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      } else if (event.key === 'Escape') {
        setSearchOpen(false)
        setNotificationsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus()
    else setSearchQuery('')
  }, [searchOpen])

  async function loadNotifications() {
    setNotificationsLoading(true)
    setNotificationsError('')
    try {
      const { data, error } = await createClient().from('notifications')
        .select('id,message,notification_type,entity_type,entity_id,link_path,read_at,created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) {
        console.error('Workspace notifications load failed:', error.message)
        setNotificationsError('Não foi possível carregar as notificações.')
      } else {
        setNotifications(data ?? [])
        const user = (await createClient().auth.getUser()).data.user
        if (user) {
          const loadedNotifications = (data ?? []) as WorkspaceNotification[]
        const taskIds = loadedNotifications.filter((item: WorkspaceNotification) => item.notification_type === 'task_share' || item.notification_type === 'task_transfer').map((item: WorkspaceNotification) => item.entity_id).filter(Boolean)
          const pending = taskIds.length ? await createClient().from('task_transfer_requests').select('task_id').eq('target_id', user.id).eq('status', 'pending').in('task_id', taskIds) : { data: [] }
          setActionableNotificationIds(((pending.data ?? []) as { task_id: string }[]).map((item) => loadedNotifications.find((notification: WorkspaceNotification) => notification.entity_id === item.task_id)?.id).filter(Boolean) as string[])
        }
      }
    } catch (error) {
      console.error('Workspace notifications request failed:', error)
      setNotificationsError('Não foi possível carregar as notificações.')
    } finally {
      setNotificationsLoading(false)
    }
  }

  async function toggleNotifications() {
    const opening = !notificationsOpen
    setNotificationsOpen(opening)
    if (opening) await loadNotifications()
  }

  async function markNotificationRead(notification: WorkspaceNotification) {
    if (notification.read_at) return
    const readAt = new Date().toISOString()
    try {
      const { data, error } = await createClient().from('notifications')
        .update({ read_at: readAt })
        .eq('id', notification.id)
        .select('id')
        .maybeSingle()
      if (error || !data) {
        console.error('Workspace notification update failed:', error?.message ?? 'No notification row was updated')
        setNotificationsError('Não foi possível marcar a notificação como lida.')
        return
      }
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item))
    } catch (error) {
      console.error('Workspace notification update request failed:', error)
      setNotificationsError('Não foi possível marcar a notificação como lida.')
    }
  }

  async function respondToTaskNotification(notification: WorkspaceNotification, status: 'accepted' | 'rejected') {
    if (!notification.entity_id) return
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) return
    const { data: request } = await supabase.from('task_transfer_requests').select('id,requester_id,request_type').eq('task_id', notification.entity_id).eq('target_id', userId).eq('status', 'pending').order('created_at', { ascending: false }).maybeSingle()
    if (!request) return
    const { error } = await supabase.from('task_transfer_requests').update({ status, responded_at: new Date().toISOString() }).eq('id', request.id).eq('target_id', userId)
    if (error) return
    if (status === 'accepted') {
      if (request.request_type === 'transfer') await supabase.from('project_tasks').update({ responsible_id: userId }).eq('id', notification.entity_id)
      else {
        const { data: task } = await supabase.from('project_tasks').select('participants').eq('id', notification.entity_id).maybeSingle()
        const participants = Array.isArray(task?.participants) ? task.participants : []
        await supabase.from('project_tasks').update({ participants: Array.from(new Set([...participants, userId])) }).eq('id', notification.entity_id)
      }
    }
    await supabase.from('notifications').insert({ recipient_id: request.requester_id, notification_type: `task_${status}`, message: `Sua solicitação de ${request.request_type === 'share' ? 'compartilhamento' : 'transferência'} foi ${status === 'accepted' ? 'aceita' : 'recusada'}.`, entity_type: 'task', entity_id: notification.entity_id, link_path: notification.link_path })
    await markNotificationRead(notification)
    await loadNotifications()
  }

  const searchItems: SearchItem[] = navigationGroups.flatMap((group) => group.items.flatMap((item) => {
    const slug = sectionSlugs[item.label]
    return slug && hasWorkspaceAccess(permissions, slug) ? [{ label: item.label, slug, group: group.label }] : []
  }))
  const matchingSearchItems = searchItems.filter((item) =>
    `${item.label} ${item.group}`.toLocaleLowerCase('pt-BR').includes(searchQuery.trim().toLocaleLowerCase('pt-BR')),
  )

  async function signOut() {
    await createClient().auth.signOut()
    setMobileOpen(false)
    router.replace('/')
  }

  function openSection(label: string) {
    const slug = sectionSlugs[label] ?? 'dashboard'
    setActiveSection(label)
    setMobileOpen(false)
    router.push(slug === 'dashboard' ? '/workspace' : `/workspace/${slug}`)
  }

  function openSearchItem(item: SearchItem) {
    setSearchOpen(false)
    setActiveSection(item.label)
    router.push(item.slug === 'dashboard' ? '/workspace' : `/workspace/${item.slug}`)
  }

  return (
    <div className="workspace-shell min-h-screen bg-[#090b10] text-slate-100">
      <aside className={`workspace-sidebar fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col border-r border-white/[0.08] bg-[#0d1118] transition-transform duration-200 lg:translate-x-0 ${collapsed ? 'lg:w-[78px]' : ''} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-24 items-center border-b border-white/[0.08] px-3">
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <Image src="/codexa-logo.png" alt="Codexa" width={150} height={150} priority className={`shrink-0 object-contain ${collapsed ? 'size-16' : 'size-24'}`} />
          </div>
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto hidden rounded-md p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200 lg:block" aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button>
          <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-md p-1.5 text-slate-500 lg:hidden" aria-label="Fechar menu"><X className="size-4" /></button>
        </div>
        <nav aria-label="Navegação principal" className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {navigationGroups.map((group) => {
            const visibleItems = group.items.filter((item) => {
              const slug = sectionSlugs[item.label]
              return Boolean(slug && hasWorkspaceAccess(permissions, slug))
            })
            if (!visibleItems.length) return null
            return (
            <div key={group.label} role="group" aria-label={group.label}>
              {!collapsed && <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{group.label}</p>}
              <div className="flex flex-col gap-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeSection === item.label
                  return <button key={item.label} onClick={() => openSection(item.label)} className={`group relative flex min-h-10 items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-left text-[13px] transition-colors ${isActive ? 'border-blue-400 bg-blue-400/10 font-medium text-blue-200' : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'} ${collapsed ? 'justify-center px-0' : ''}`} title={collapsed ? item.label : undefined} aria-current={isActive ? 'page' : undefined}><Icon className={`size-[17px] shrink-0 ${isActive ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300'}`} />{!collapsed && <span className="truncate">{item.label}</span>}</button>
                })}
              </div>
            </div>
          )})}
        </nav>
        {!collapsed && <button onClick={() => openSection('Meu perfil')} className="border-t border-white/[0.07] p-3 text-left"><span className="flex items-center gap-3 rounded-lg p-2"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200">{initials}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-slate-200">{displayName}</span><span className="block truncate text-[11px] text-slate-500">Meu perfil</span></span></span></button>}
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}
      <div className={`transition-[margin] duration-200 ${collapsed ? 'lg:ml-[78px]' : 'lg:ml-[258px]'}`}>
        <header className="workspace-header sticky top-0 z-20 flex min-h-[72px] flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[#090b10]/88 px-3 py-2 backdrop-blur-xl sm:gap-4 sm:px-7">
          <button className="rounded-md p-2 text-slate-400 hover:bg-white/5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu className="size-5" /></button>
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span>Workspace</span><ChevronRight className="size-3" /><span className="text-slate-300">{activeSection}</span></div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setSearchOpen(true)} aria-label="Buscar (Ctrl+K)" className="hidden items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs text-slate-500 transition-colors hover:border-white/15 hover:text-slate-300 md:flex"><Search className="size-3.5" />Buscar<span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-600">Ctrl K</span></button>
            <div className="relative">
              <button onClick={() => void toggleNotifications()} className="relative rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Notificações" aria-expanded={notificationsOpen}>
                <Bell className="size-[18px]" />
                {notifications.some((notification) => !notification.read_at) && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-blue-400" />}
              </button>
              {notificationsOpen && <section className="fixed left-2 right-2 top-[4.25rem] z-50 max-h-[calc(100vh-5rem)] overflow-hidden rounded-xl border border-white/[0.1] bg-[#11161e] shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[min(24rem,calc(100vw-2rem))]" aria-label="Notificações recentes">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-100">Notificações</h2><p className="text-[11px] text-slate-500">{notifications.filter((notification) => !notification.read_at).length} não lida(s)</p></div><button onClick={() => void loadNotifications()} aria-label="Atualizar notificações" className="rounded px-2 py-1 text-xs text-blue-300 hover:bg-white/[0.05]">Atualizar</button></div>
                {notificationsError && <p role="alert" className="px-4 py-3 text-xs text-rose-300">{notificationsError}</p>}
                <div className="max-h-96 overflow-y-auto">
                  {notificationsLoading ? <p className="px-4 py-8 text-center text-xs text-slate-500">Carregando notificações...</p>
                    : notifications.length ? notifications.map((notification) => <div key={notification.id} className={`flex gap-3 border-b border-white/[0.05] px-4 py-3 last:border-0 hover:bg-white/[0.04] ${notification.read_at ? 'opacity-70' : ''}`}>
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.read_at ? 'bg-slate-600' : 'bg-blue-400'}`} />
                      <div className="min-w-0 flex-1"><button type="button" onClick={() => { void markNotificationRead(notification); if (notification.link_path) router.push(notification.link_path) }} className="block w-full text-left"><span className="block text-xs leading-5 text-slate-200">{notification.message}</span><span className="mt-1 block text-[10px] text-slate-500">{new Date(notification.created_at).toLocaleString('pt-BR')}</span></button>{actionableNotificationIds.includes(notification.id) && !notification.notification_type.startsWith('task_admin_') ? <div className="mt-2 flex gap-2"><button type="button" onClick={() => void respondToTaskNotification(notification, 'accepted')} className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25">Aceitar</button><button type="button" onClick={() => void respondToTaskNotification(notification, 'rejected')} className="rounded bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/25">Rejeitar</button></div> : null}</div>
                    </div>)
                    : !notificationsError && <p className="px-4 py-8 text-center text-xs text-slate-500">Nenhuma notificação encontrada.</p>}
                </div>
              </section>}
            </div>
            <div className="mx-1 h-5 w-px bg-white/10" />
            <button onClick={() => openSection('Meu perfil')} className="flex items-center gap-2 rounded-lg p-1.5 pr-2 hover:bg-white/5" aria-label={`Perfil de ${displayName}`}>
              <span className="grid size-7 place-items-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-300">{initials}</span>
              <span className="hidden max-w-32 truncate text-xs text-slate-300 sm:block">{displayName}</span>
              <ChevronDown className="size-3.5 text-slate-500" />
            </button>
            <button onClick={() => void signOut()} className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Sair da conta">Sair</button>
          </div>
        </header>
        <main className="workspace-main mx-auto w-full max-w-[1500px] overflow-x-hidden px-3 py-5 sm:px-7 sm:py-7 lg:px-9">{page ?? <>{activeSection === 'Dashboard' &&         <div id="dashboard-overview" className="scroll-mt-24"><div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Visão geral</p><h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">Olá, {displayName}</h1><p className="mt-1.5 text-sm text-slate-500">Acompanhe as áreas permitidas para você.</p></div>{permissions.includes('*') && <button className="flex w-fit items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/15 transition-colors hover:bg-blue-400"><Plus className="size-4" />Adicionar registro</button>}</div>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.filter((metric) => {
            const metricPermission: Record<string, string> = {
              'Leads ativos': 'leads:view', 'Clientes ativos': 'clients:view', 'Projetos em andamento': 'projects:view',
              'Chamados abertos': 'support:view', 'Contratos ativos': 'contracts:view',
              'Valores a receber': 'accounts_receivable:view', 'Valores vencidos': 'accounts_receivable:view',
              'Receita no mês': 'finance:view',
            }
            return permissions.includes('*') || permissions.includes(metricPermission[metric.label])
          }).map((metric) => { const Icon = metric.icon; return <article key={metric.label} className="rounded-xl border border-white/[0.07] bg-[#11161e] p-4 transition-colors hover:border-white/[0.12]"><div className="flex items-start justify-between"><div className={`grid size-9 place-items-center rounded-lg ${toneClasses[metric.tone]}`}><Icon className="size-[17px]" /></div><button aria-label={`Mais opções de ${metric.label}`} className="text-slate-600 hover:text-slate-300"><MoreHorizontal className="size-4" /></button></div><p className="mt-4 text-xs text-slate-500">{metric.label}</p><p className="mt-1 text-xl font-semibold tracking-tight text-slate-100">{metric.value}</p><p className="mt-1 text-[11px] text-slate-600">{metric.hint}</p></article> })}</section>
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]"><div className="rounded-xl border border-white/[0.07] bg-[#11161e]"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-200">Atividade recente</h2><p className="mt-0.5 text-xs text-slate-500">Acompanhe as últimas ações do workspace</p></div><button className="text-xs font-medium text-blue-400 hover:text-blue-300">Ver histórico</button></div><div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center"><div className="mb-3 grid size-11 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03]"><Activity className="size-5 text-slate-600" /></div><p className="text-sm font-medium text-slate-400">Nenhuma atividade registrada</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-600">As ações da sua equipe aparecerão aqui quando os primeiros registros forem criados.</p></div></div><div className="rounded-xl border border-white/[0.07] bg-[#11161e]"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-200">Próximos vencimentos</h2><p className="mt-0.5 text-xs text-slate-500">Compromissos financeiros e contratuais</p></div><button className="text-slate-600 hover:text-slate-300" aria-label="Mais opções"><MoreHorizontal className="size-4" /></button></div><div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center"><div className="mb-3 grid size-11 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03]"><WalletCards className="size-5 text-slate-600" /></div><p className="text-sm font-medium text-slate-400">Tudo em dia</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-600">Nenhum vencimento encontrado para os próximos dias.</p></div></div></section>
          <section className="mt-6 rounded-xl border border-white/[0.07] bg-[#11161e]"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-200">Projetos por status</h2><p className="mt-0.5 text-xs text-slate-500">Distribuição dos projetos ativos</p></div><button className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">Este mês <ChevronDown className="size-3.5" /></button></div><div className="flex min-h-[150px] items-center justify-center px-6 text-center"><p className="text-xs text-slate-600">Cadastre projetos para visualizar a distribuição por status.</p></div></section>
          </div>}
          {['Leads', 'Mensagens', 'Clientes'].includes(activeSection) && <div id="crm-workspace" className="scroll-mt-24"><CrmWorkspace initialModule={activeSection === 'Clientes' ? 'clients' : activeSection === 'Mensagens' ? 'messages' : 'leads'} permissions={permissions} /></div>}
          {['Propostas', 'Contratos'].includes(activeSection) && <div id="commercial-workspace" className="scroll-mt-24"><CommercialWorkspace initialTab={activeSection === 'Contratos' ? 'contracts' : 'proposals'} permissions={permissions} /></div>}
          {['Projetos', 'Solicitações de alteração', 'Suporte'].includes(activeSection) && <div id="operations-workspace" className="scroll-mt-24"><OperationsWorkspace permissions={permissions} initialModule={activeSection === 'Suporte' ? 'support_tickets' : activeSection === 'Solicitações de alteração' ? 'change_requests' : 'projects'} /></div>}
          {['Sistemas dos clientes', 'Módulos'].includes(activeSection) && <div id="catalog-workspace" className="scroll-mt-24"><CatalogWorkspace initialTab={activeSection === 'Módulos' ? 'modules' : 'systems'} /></div>}
          {['Contas a receber', 'Contas a pagar', 'Fluxo de caixa', 'Transações', 'Categorias financeiras'].includes(activeSection) && <div id="finance-workspace" className="scroll-mt-24"><FinanceWorkspace initialTab={activeSection === 'Contas a receber' ? 'receivable' : activeSection === 'Contas a pagar' ? 'payable' : 'overview'} permissions={permissions} /></div>}
          {activeSection === 'Relatórios' && <div id="reports-workspace" className="scroll-mt-24"><ReportsWorkspace permissions={permissions} /></div>}
          {['Equipe', 'Configurações'].includes(activeSection) && <div id="admin-workspace" className="scroll-mt-24"><AdminWorkspace section={activeSection} permissions={permissions} /></div>}
          {activeSection === 'Auditoria' && <ActivityHistoryWorkspace permissions={permissions} mode="audit" />}
          {activeSection === 'Meu histórico' && <ActivityHistoryWorkspace permissions={permissions} mode="personal" />}
          {['Meu perfil', 'Aparência'].includes(activeSection) && <AccountWorkspace section={activeSection} initialName={profileName} />}
          {!['Dashboard', 'Leads', 'Mensagens', 'Clientes', 'Propostas', 'Contratos', 'Projetos', 'Solicitações de alteração', 'Suporte', 'Sistemas', 'Módulos', 'Planos', 'Licenças', 'Financeiro', 'Equipe', 'Relatórios', 'Configurações', 'Auditoria', 'Meu histórico'].includes(activeSection) && <section className="rounded-xl border border-white/[0.07] bg-[#11161e] p-8"><p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Módulo</p><h1 className="mt-2 text-2xl font-semibold text-white">{activeSection}</h1><p className="mt-2 text-sm text-slate-500">Esta página está preparada para receber os registros deste módulo.</p></section>}
          </>}
          <div className="mt-7 flex items-center gap-2 text-[11px] text-slate-600"><div className="size-1.5 rounded-full bg-amber-400" />Supabase conectado · CRM pronto para seus primeiros registros.</div>
        </main>
      </div>
      {searchOpen && <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/65 px-4 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false) }}>
        <section role="dialog" aria-modal="true" aria-label="Buscar módulos" className="w-full max-w-xl overflow-hidden rounded-xl border border-white/[0.1] bg-[#11161e] shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-4"><Search className="size-4 text-slate-500" /><input ref={searchInput} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar módulo..." className="h-14 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" /><kbd className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-500">ESC</kbd></div>
          <div className="max-h-[55vh] overflow-y-auto p-2">
            {matchingSearchItems.length ? matchingSearchItems.map((item) => <button key={item.slug} onClick={() => openSearchItem(item)} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm text-slate-200 hover:bg-blue-500/10 hover:text-blue-200"><span>{item.label}</span><span className="text-[11px] text-slate-500">{item.group}</span></button>)
              : <p className="px-3 py-8 text-center text-sm text-slate-500">Nenhum módulo encontrado.</p>}
          </div>
          <div className="border-t border-white/[0.07] px-4 py-2 text-[10px] text-slate-600">Navegue somente pelos módulos que seu cargo pode acessar.</div>
        </section>
      </div>}
    </div>
  )
}

export function DashboardShell({ initialSection = 'Dashboard', page, permissions = [], profileName = '' }: { initialSection?: string; page?: ReactNode; permissions?: string[]; profileName?: string }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setAuthenticated(Boolean(data.session))
      setChecking(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => setAuthenticated(Boolean(session)))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (checking) return <main className="grid min-h-screen place-items-center bg-[#080b10] text-sm text-slate-500">Carregando sessão...</main>
  if (!authenticated) return <AuthScreen onAuthenticated={() => setAuthenticated(true)} />
  return <DashboardContent initialSection={initialSection} page={page} permissions={permissions} profileName={profileName} />
}
