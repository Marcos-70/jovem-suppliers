# Modelo de segurança

**Princípio:** a segurança está no servidor (PostgreSQL). O frontend esconde opções por conveniência,
mas nunca é a barreira.

1. **RLS em todas as tabelas** (`…002_security.sql`). Sem `grant` explícito não há acesso: `anon` só lê
   categorias, a vista `supplier_directory` e serviços de organizações listadas.
2. **Escrita só por funções** para tudo o que tem estado ou valor: documentos, análises, propostas,
   convites, decisões, membros, anexos. As tabelas não têm `INSERT/UPDATE/DELETE` para o cliente.
   Onde há escrita directa (perfil, serviços, rascunhos de pedidos), os privilégios são **por coluna**
   (ex.: o cliente não pode alterar `profile_status`, `verification_*`, `is_superadmin`, `status` do pedido).
3. **Funções `SECURITY DEFINER`** com `search_path` fixo, que validam permissões via `has_org_permission`
   (matriz `role_permissions`, igual à usada no frontend e verificada por teste).
4. **Propostas seladas** até ao prazo final (incluindo prorrogações) quando o pedido o exige.
5. **Documentos** em *bucket* privado; leitura apenas por membros com `document.view`, superadministrador
   ou comprador com relação (fornecedor submeteu proposta e o documento está aprovado). Acessos de terceiros
   são auditados (`request_document_access`).
6. **Directório** (`supplier_directory`): vista que só devolve linhas visíveis e campos opcionais autorizados.
7. **Auditoria** imutável (gatilhos bloqueiam UPDATE/DELETE) para alterações críticas.
8. **Limites de abuso** por utilizador/acção (`check_rate_limit`) + limites do Supabase Auth.
9. **Segredos**: o frontend só usa a chave `anon`. A `service_role` nunca é exposta.

## Limitações conhecidas
- O acesso do superadministrador a ficheiros é auditado por função, mas a política de *storage* não pode
  forçar a chamada prévia dessa função (quem usar a API directamente contorna o registo).
- O ficheiro não é analisado por antivírus (requer serviço externo).
- Não há MFA configurado (disponível no Supabase Auth; activar no painel).
