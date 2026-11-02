-- =============================================================================
-- JOVEM+ SUPPLIERS — Migração 004: dados de referência (configuráveis depois)
-- Não contém dados de demonstração nem credenciais.
-- =============================================================================

insert into public.roles (code, name, description, scope) values
  ('superadmin', 'Superadministrador JOVEM+', 'Gere configurações globais, categorias, regras, utilizadores e organizações. Acesso a dados privados limitado ao necessário e auditado.', 'platform'),
  ('org_admin', 'Administrador da empresa', 'Gere dados, membros, funções, serviços, documentos e processos da própria organização.', 'organization'),
  ('supplier', 'Fornecedor', 'Gere perfil, especialidades, serviços, documentos e propostas; responde a pedidos para os quais tenha convite.', 'organization'),
  ('buyer', 'Comprador', 'Pesquisa fornecedores, cria pedidos de cotação, convida empresas e consulta propostas.', 'organization'),
  ('procurement_qualifier', 'Responsável de compras e qualificação', 'Analisa requisitos, documentos, critérios técnicos e propostas; regista decisões.', 'organization'),
  ('doc_operator', 'Responsável documental e operacional', 'Gere documentos, prazos e pendências dentro do âmbito autorizado.', 'organization'),
  ('auditor', 'Auditor / consulta', 'Consulta relatórios e históricos autorizados, sem permissões de edição.', 'organization');

insert into public.permissions (code, description) values
  ('org.view', 'Ver dados da organização'),
  ('org.edit', 'Editar perfil empresarial e submeter para análise'),
  ('org.members.manage', 'Gerir membros e funções da organização'),
  ('supplier.search', 'Pesquisar fornecedores'),
  ('services.manage', 'Gerir serviços e especialidades'),
  ('document.view', 'Consultar documentos'),
  ('document.upload', 'Carregar e substituir documentos'),
  ('document.review', 'Analisar documentos (verificação da plataforma)'),
  ('opportunity.view', 'Consultar pedidos de cotação'),
  ('opportunity.create', 'Criar pedidos de cotação'),
  ('opportunity.manage', 'Gerir pedidos, convites, prazos e esclarecimentos'),
  ('opportunity.decide', 'Registar decisões comerciais'),
  ('proposal.view', 'Consultar propostas'),
  ('proposal.submit', 'Criar, submeter e rever propostas'),
  ('proposal.evaluate', 'Avaliar e comparar propostas'),
  ('report.view', 'Consultar relatórios'),
  ('report.export', 'Exportar relatórios'),
  ('audit.view', 'Consultar registos de auditoria'),
  ('admin.access', 'Aceder à área administrativa'),
  ('admin.organizations', 'Gerir organizações e verificações'),
  ('admin.users', 'Gerir utilizadores da plataforma'),
  ('admin.config', 'Gerir categorias, tipos documentais, requisitos e definições');

insert into public.role_permissions (role, permission) values
  ('superadmin','supplier.search'), ('superadmin','document.view'), ('superadmin','document.review'),
  ('superadmin','report.view'), ('superadmin','report.export'), ('superadmin','audit.view'),
  ('superadmin','admin.access'), ('superadmin','admin.organizations'), ('superadmin','admin.users'),
  ('superadmin','admin.config'),
  ('org_admin','org.view'), ('org_admin','org.edit'), ('org_admin','org.members.manage'),
  ('org_admin','supplier.search'), ('org_admin','services.manage'), ('org_admin','document.view'),
  ('org_admin','document.upload'), ('org_admin','opportunity.view'), ('org_admin','opportunity.create'),
  ('org_admin','opportunity.manage'), ('org_admin','opportunity.decide'), ('org_admin','proposal.view'),
  ('org_admin','proposal.submit'), ('org_admin','proposal.evaluate'), ('org_admin','report.view'),
  ('org_admin','report.export'), ('org_admin','audit.view'),
  ('supplier','org.view'), ('supplier','services.manage'), ('supplier','document.view'),
  ('supplier','document.upload'), ('supplier','opportunity.view'), ('supplier','proposal.view'),
  ('supplier','proposal.submit'), ('supplier','report.view'),
  ('buyer','org.view'), ('buyer','supplier.search'), ('buyer','opportunity.view'),
  ('buyer','opportunity.create'), ('buyer','opportunity.manage'), ('buyer','proposal.view'),
  ('buyer','proposal.evaluate'), ('buyer','report.view'),
  ('procurement_qualifier','org.view'), ('procurement_qualifier','supplier.search'),
  ('procurement_qualifier','document.view'), ('procurement_qualifier','opportunity.view'),
  ('procurement_qualifier','opportunity.decide'), ('procurement_qualifier','proposal.view'),
  ('procurement_qualifier','proposal.evaluate'), ('procurement_qualifier','report.view'),
  ('procurement_qualifier','report.export'),
  ('doc_operator','org.view'), ('doc_operator','document.view'), ('doc_operator','document.upload'),
  ('doc_operator','opportunity.view'), ('doc_operator','report.view'),
  ('auditor','org.view'), ('auditor','document.view'), ('auditor','opportunity.view'),
  ('auditor','proposal.view'), ('auditor','report.view'), ('auditor','report.export'),
  ('auditor','audit.view');

insert into public.categories (name, slug, sort_order) values
  ('Petróleo e gás', 'petroleo-e-gas', 1),
  ('Construção civil', 'construcao-civil', 2),
  ('Engenharia', 'engenharia', 3),
  ('Manutenção industrial', 'manutencao-industrial', 4),
  ('Electricidade', 'electricidade', 5),
  ('Instrumentação e automação', 'instrumentacao-e-automacao', 6),
  ('Metalomecânica', 'metalomecanica', 7),
  ('Transporte e logística', 'transporte-e-logistica', 8),
  ('Equipamentos e peças', 'equipamentos-e-pecas', 9),
  ('Segurança e saúde no trabalho', 'seguranca-e-saude-no-trabalho', 10),
  ('Inspecção industrial', 'inspeccao-industrial', 11),
  ('Consultoria técnica', 'consultoria-tecnica', 12),
  ('Formação profissional', 'formacao-profissional', 13),
  ('Tecnologias de informação', 'tecnologias-de-informacao', 14),
  ('Limpeza industrial', 'limpeza-industrial', 15),
  ('Serviços ambientais', 'servicos-ambientais', 16),
  ('Outros serviços empresariais', 'outros-servicos-empresariais', 17);

-- Tipos documentais. Só exigem validade os tipos em que a validade é inerente.
insert into public.document_types (code, name, description, requires_expiry, sort_order) values
  ('commercial_registry', 'Registo comercial', 'Certidão ou registo comercial da empresa.', false, 1),
  ('tax_proof', 'NIF / comprovativo fiscal', 'Comprovativo de identificação fiscal aplicável.', false, 2),
  ('license', 'Licença', 'Licenças de actividade ou operação.', true, 3),
  ('technical_certificate', 'Certificado técnico', 'Certificados técnicos da empresa ou da equipa.', false, 4),
  ('training_certificate', 'Certificado de formação', 'Certificados de formação profissional.', false, 5),
  ('quality_safety_cert', 'Certificação de qualidade e segurança', 'ISO e equivalentes, quando aplicável.', true, 6),
  ('insurance', 'Seguro', 'Apólices de seguro em vigor.', true, 7),
  ('worker_docs', 'Documentação de trabalhadores', 'Apenas quando necessária para o processo.', false, 8),
  ('equipment_docs', 'Documentação de equipamentos', 'Fichas técnicas, manuais e certificados de equipamentos.', false, 9),
  ('inspection_report', 'Relatório de inspecção', 'Relatórios de inspecção industrial.', false, 10),
  ('contract_other', 'Contratos e outros documentos empresariais', 'Documentos empresariais de suporte.', false, 11);

-- Requisitos iniciais de qualificação (configuráveis pelo superadministrador)
insert into public.qualification_requirements (name, description, document_type_id, is_mandatory)
select t.name || ' válido', 'Documento aprovado e, quando tem validade, em vigor.', t.id, true
from public.document_types t where t.code in ('commercial_registry', 'tax_proof');

insert into public.platform_settings (key, value, description) values
  ('default_currency', '"AOA"', 'Moeda predefinida'),
  ('supported_currencies', '["AOA","USD","EUR"]', 'Moedas disponíveis. Não existe conversão automática entre moedas.'),
  ('timezone', '"Africa/Luanda"', 'Fuso horário predefinido'),
  ('document_alert_days', '[30,15,7]', 'Dias antes da validade para gerar alertas'),
  ('deadline_alert_hours', '[72,24]', 'Horas antes do prazo de um pedido para alertar fornecedores'),
  ('profile_required_fields', '["legal_name","nif","sector","province","municipality","address","phone","email","contact_person","description","services"]', 'Campos obrigatórios para considerar um perfil completo'),
  ('plans', '[]', 'Planos comerciais — preços por definir (não aprovados)');
