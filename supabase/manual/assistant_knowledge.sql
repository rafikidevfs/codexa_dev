-- SQL manual da base de conhecimento do Assistente Codexa.
-- Este arquivo não é aplicado automaticamente. Revise e edite o conteúdo antes de executar.
-- Não inclua senhas, tokens, chaves de API ou dados pessoais/sensíveis nos artigos.

create table if not exists public.assistant_knowledge (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default 'geral',
  content text not null check (length(trim(content)) > 0),
  keywords text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('portuguese'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(category, '')), 'B') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(content, '')), 'C') ||
    setweight(to_tsvector('simple'::regconfig, array_to_string(coalesce(keywords, '{}'::text[]), ' ')), 'A')
  ) stored
);

create index if not exists assistant_knowledge_search_vector_idx
  on public.assistant_knowledge using gin (search_vector);

alter table public.assistant_knowledge enable row level security;

-- O acesso de leitura ocorre somente no servidor, depois de validar o membro ativo.
revoke all on table public.assistant_knowledge from public, anon, authenticated;
grant select on table public.assistant_knowledge to service_role;

create or replace function public.search_assistant_knowledge(
  p_query text,
  p_limit integer default 5
)
returns table (
  id uuid,
  slug text,
  title text,
  category text,
  content text,
  keywords text[],
  relevance real
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with search_terms as (
    select pg_catalog.websearch_to_tsquery(
      'portuguese'::pg_catalog.regconfig,
      coalesce(p_query, '')
    ) as query
  )
  select
    knowledge.id,
    knowledge.slug,
    knowledge.title,
    knowledge.category,
    left(knowledge.content, 3000) as content,
    knowledge.keywords,
    pg_catalog.ts_rank_cd(knowledge.search_vector, search_terms.query)::real as relevance
  from public.assistant_knowledge as knowledge
  cross join search_terms
  where knowledge.is_active
    and knowledge.search_vector @@ search_terms.query
  order by relevance desc, knowledge.updated_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 8);
$function$;

revoke all on function public.search_assistant_knowledge(text, integer) from public, anon, authenticated;
grant execute on function public.search_assistant_knowledge(text, integer) to service_role;

-- Fato inicial derivado apenas dos nomes atualmente exibidos na navegação do app.
-- Edite este artigo e acrescente artigos com regras, fluxos e definições confirmadas.
insert into public.assistant_knowledge (slug, title, category, content, keywords)
values (
  'codexa-navigation-overview',
  'Mapa dos módulos da Codexa',
  'sistema',
  'A navegação atual da Codexa apresenta: Workspace (Dashboard, Visão comercial, Documentos); Relacionamento (Leads, Clientes, Contatos); Comercial (Propostas, Contratos); Operações (Projetos, Tarefas, Solicitações de alteração, Suporte); Produtos (Sistemas dos clientes, Módulos, Planos, Licenças); Financeiro (Contas a receber, Contas a pagar, Fluxo de caixa, Transações, Categorias financeiras); Administração (Relatórios, Equipe, Usuários, Papéis e permissões, Emblemas, Configuração de XP, Auditoria); Conta (Meu perfil, Meu histórico, Configurações, Aparência). Este artigo confirma somente os nomes e grupos da navegação; não descreve regras de negócio, valores atuais nem registros de clientes. Acrescente aqui os fluxos e definições que devem ser considerados fonte oficial.',
  array['Codexa', 'ERP', 'CRM', 'Workspace', 'Relacionamento', 'Comercial', 'Operações', 'Produtos', 'Financeiro', 'Administração', 'Conta', 'Dashboard', 'Leads', 'Clientes', 'Contratos', 'Projetos', 'Tarefas', 'Suporte', 'Licenças']
)
on conflict (slug) do nothing;

-- Modelo para acrescentar documentação própria; copie e edite antes de executar:
-- insert into public.assistant_knowledge (slug, title, category, content, keywords)
-- values (
--   'fluxo-de-propostas',
--   'Como funciona o fluxo de propostas',
--   'comercial',
--   'Descreva aqui somente o fluxo confirmado, as regras e as permissões relevantes.',
--   array['propostas', 'comercial', 'vendas']
-- );
