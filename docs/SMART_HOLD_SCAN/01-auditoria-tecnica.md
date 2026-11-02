# 1. Auditoria técnica e plano de integração

## 1.1 Arquitectura encontrada
| Camada | Tecnologia | Notas |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind, SPA com rotas | Páginas em `src/pages`, regras puras em `src/lib/domain`, acesso a dados em `src/services` |
| Backend | Supabase: PostgreSQL + Auth + Storage | Segurança em RLS e funções `SECURITY DEFINER`; escrita crítica só por funções |
| Permissões | Matriz função → permissão (`role_permissions`), igual no SQL e no TypeScript (verificada por teste) | Permissões por organização |
| Ficheiros | Buckets privados (`documents`, `attachments`) com políticas por organização | Padrão `{organization_id}/…` |
| Auditoria | Gatilhos genéricos `audit_row` + registos explícitos | Imutável |
| Modo sem backend | Cliente em memória que replica a API do Supabase | Para pré-visualização |

## 1.2 Como o módulo foi integrado SEM reconstruir nada
O módulo é **aditivo**:
- **Base de dados:** migrações novas `…005` (papel `inspector`), `…006` (mapas de inspecção + permissões `inspection.*` e `scan.*`) e `…007` (`hold_scans`, `scan_validations`, bucket `scans`). Nenhuma tabela, política ou função existente foi apagada.
  Única alteração a código existente: `public.audit_org_of` foi **redefinida com `create or replace`** para reconhecer as tabelas novas; o comportamento para as tabelas anteriores mantém-se (a suite SQL anterior continua a passar).
- **Permissões:** valores novos na mesma matriz; o inspector é um papel novo, os restantes não mudam (excepto `org_admin`, `auditor`, `procurement_qualifier`, `buyer`, que ganharam permissões de leitura/revisão dos módulos novos).
- **Frontend:** páginas novas (`Inspections*`, `SmartHoldScan`), serviços novos (`inspections.ts`, `scans.ts`), módulo isolado `src/modules/holdscan` (geometria, E/S, visualizador, captura). Rotas e entradas de menu novas; o resto não foi tocado.
- **Supabase mantido:** autenticação, RLS, armazenamento e auditoria reutilizados. Os modelos 3D vão para um bucket privado novo com a mesma lógica por organização.

## 1.3 Compatibilidade por plataforma
| Capacidade | Android (Chrome/Edge) | iOS (Safari) | Computador |
|---|---|---|---|
| Interface, mapas de inspecção, relatórios | Sim | Sim | Sim |
| Câmara (pré-visualização) | Sim (HTTPS) | Sim (HTTPS) | Sim |
| Importar PLY/OBJ/GLB, visualizar, medir, exportar | Sim | Sim | Sim |
| WebXR AR (hit-test, profundidade opcional) | Sim, em dispositivos ARCore | **Não** | Não |
| LiDAR / ARKit | n/a | **Só em app nativa** | n/a |
| ARCore Depth em app nativa | Sim (dispositivos suportados) | n/a | n/a |

Requisitos de execução: HTTPS (câmara/AR exigem contexto seguro); a página não deve estar embebida noutra página (o navegador pode bloquear câmara/AR).

## 1.4 Caminho recomendado para captura nativa (sem reconstruir)
1. Manter a SPA actual. 2. Empacotá-la numa casca nativa (por exemplo Capacitor) para Android/iOS. 3. Escrever um *plugin* nativo `HoldScanNative` que usa ARKit (LiDAR, `ARMeshAnchor`/scene reconstruction) no iOS e ARCore (Depth/Raw Depth) no Android, e devolve um ficheiro PLY/GLB em metros ao módulo web — o **mesmo** caminho de importação já implementado. 4. Medir e validar com o protocolo do documento 03 antes de qualquer cálculo de volume.

## 1.5 Riscos técnicos identificados
- Captura web só funciona em Android com ARCore; iPhone exige nativo ou importação.
- Precisão desconhecida em porões grandes (ver documento 02): é um risco de produto, não de código.
- Ficheiros 3D grandes (dezenas de MB) pesam no navegador e no armazenamento; há limite de 150 MB no bucket.
- A captura AR directa **não foi testada em telemóvel real**; o seu comportamento (por exemplo, convenção das coordenadas da profundidade) tem de ser confirmado em dispositivo.
