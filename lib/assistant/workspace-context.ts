import 'server-only'

import { workspaceLabel } from '@/lib/workspace-modules'

const moduleGuides: Record<string, string> = {
  dashboard: 'Visão geral com indicadores de leads, clientes ativos, projetos, chamados, contratos e valores financeiros conforme as permissões do usuário. Também contém atividade recente, próximos vencimentos, ranking de XP da equipe e distribuição de projetos por status.',
  comercial: 'Visão geral comercial renderizada pelo CommercialWorkspace. As rotas de propostas e contratos abrem esse mesmo módulo nas abas correspondentes.',
  documentos: 'Página de documentos renderizada pelo DocumentsWorkspace.',
  leads: 'Área de CRM renderizada pelo CrmWorkspace na aba de leads.',
  clientes: 'Área de CRM renderizada pelo CrmWorkspace na aba de clientes.',
  contatos: 'A rota de contatos é direcionada à aba messages do CrmWorkspace nesta implementação; descreva somente os controles que estiverem documentados ou visíveis.',
  propostas: 'Área comercial renderizada pelo CommercialWorkspace na aba de propostas.',
  contratos: 'Área comercial renderizada pelo CommercialWorkspace na aba de contratos.',
  projetos: 'Área operacional renderizada pelo OperationsWorkspace na seção de projetos.',
  tarefas: 'A rota de tarefas também usa o OperationsWorkspace e, no roteador atual, inicia na seção de projetos. Não afirme que existe uma lista de tarefas separada sem confirmação na documentação da página.',
  solicitacoes: 'Área operacional renderizada pelo OperationsWorkspace na seção de solicitações de alteração.',
  suporte: 'Área operacional renderizada pelo OperationsWorkspace na seção de chamados de suporte.',
  sistemas: 'Catálogo renderizado pelo CatalogWorkspace na aba de sistemas dos clientes.',
  modulos: 'Catálogo renderizado pelo CatalogWorkspace na aba de módulos.',
  planos: 'Página de planos renderizada pelo PlansWorkspace.',
  licencas: 'Página de licenças renderizada pelo LicenseWorkspace.',
  'contas-a-receber': 'Área financeira renderizada pelo FinanceWorkspace na aba de contas a receber.',
  'contas-a-pagar': 'Área financeira renderizada pelo FinanceWorkspace na aba de contas a pagar.',
  'fluxo-de-caixa': 'Área financeira renderizada pelo FinanceWorkspace na aba de fluxo de caixa.',
  transacoes: 'A rota de transações usa o FinanceWorkspace na visão geral nesta implementação; não assuma uma tela separada sem confirmação.',
  'categorias-financeiras': 'A rota de categorias financeiras usa o FinanceWorkspace na visão geral nesta implementação; não assuma uma tela separada sem confirmação.',
  relatorios: 'Página de relatórios renderizada pelo ReportsWorkspace.',
  equipe: 'Administração de equipe renderizada pelo AdminWorkspace.',
  usuarios: 'Gerenciamento de usuários renderizado pelo RoleManagementWorkspace na visão de usuários.',
  'papeis-e-permissoes': 'Gerenciamento de papéis e permissões renderizado pelo RoleManagementWorkspace.',
  emblemas: 'Gerenciamento de emblemas renderizado pelo BadgeManagementWorkspace.',
  'configuracao-xp': 'Configuração de XP renderizada pelo XpSettingsWorkspace.',
  'meu-perfil': 'Perfil individual renderizado pelo GamifiedProfileWorkspace.',
  'meu-historico': 'Histórico pessoal renderizado pelo ActivityHistoryWorkspace em modo personal.',
  configuracoes: 'Configurações administrativas renderizadas pelo AdminWorkspace.',
  aparencia: 'Preferências de aparência renderizadas pelo AccountWorkspace.',
  auditoria: 'Auditoria renderizada pelo ActivityHistoryWorkspace em modo audit.',
}

const workspaceOverview = 'A navegação é agrupada em Workspace (Dashboard, Visão comercial e Documentos), Relacionamento (Leads, Clientes e Contatos), Comercial (Propostas e Contratos), Operações (Projetos, Tarefas, Solicitações de alteração e Suporte), Produtos (Sistemas dos clientes, Módulos, Planos e Licenças), Financeiro (Contas a receber, Contas a pagar, Fluxo de caixa, Transações e Categorias financeiras), Administração (Relatórios, Equipe, Usuários, Papéis e permissões, Emblemas, Configuração de XP e Auditoria) e Conta (Meu perfil, Meu histórico, Configurações e Aparência). As rotas usam os workspaces compartilhados listados no guia da página; a interface e as permissões efetivas determinam o que cada usuário pode acessar.'

export function getWorkspacePageContext(moduleSlug?: string): string {
  const pageLabel = moduleSlug ? workspaceLabel(moduleSlug) : undefined
  const pageGuide = moduleSlug ? moduleGuides[moduleSlug] : undefined

  return [
    workspaceOverview,
    pageLabel ? `Página atual: ${pageLabel}.` : 'Página atual: não identificada.',
    pageGuide ?? 'Não há uma descrição específica disponível para esta rota; não infira campos nem ações.',
    'Este guia descreve a estrutura da interface, não contém registros de clientes, usuários, valores, IDs ou outros dados operacionais. Não afirme que consultou, alterou ou executou operações nesses registros; use apenas documentação recuperada para regras de negócio específicas.',
  ].join('\n\n')
}
