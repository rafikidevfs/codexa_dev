set search_path = public, auth, pg_temp;

-- Separa a leitura do código das permissões administrativas de geração e revogação.
insert into public.access_permissions (id, module_name, action_name, is_active)
values
  (gen_random_uuid(), 'clients', 'view_contact_codes', true),
  (gen_random_uuid(), 'clients', 'generate_contact_codes', true),
  (gen_random_uuid(), 'clients', 'revoke_contact_codes', true)
on conflict (module_name, action_name) do update
set is_active = true;
