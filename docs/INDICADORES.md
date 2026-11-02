# Definições formais dos indicadores

As mesmas definições são usadas nos painéis, nos relatórios e nas exportações
(`src/lib/domain/reports.ts`, constante `DEFINITIONS`) e testadas em `reports.test.ts`.

| Indicador | Definição |
|---|---|
| Organização elegível | Tipo Fornecedor ou Fornecedor e comprador, activa, perfil não suspenso nem rejeitado. |
| Perfil completo | Todos os campos obrigatórios (`platform_settings.profile_required_fields`) preenchidos e ≥ 1 serviço. |
| Taxa de perfis completos | perfis completos ÷ organizações elegíveis × 100. |
| Documento conforme | Aprovado e em vigor (sem validade, ou validade não expirada). |
| Requisito aplicável | Requisito activo; com categoria, só a fornecedores com serviço nessa categoria. |
| Requisito satisfeito | Documento do tipo, aprovado, em vigor e com a validade mínima restante configurada. |
| Taxa de conformidade documental | requisitos satisfeitos ÷ requisitos aplicáveis × 100. |
| Proposta válida | Submetida/em avaliação/seleccionada, recebida até ao prazo efectivo do fornecedor e com validade não anterior à submissão. Retiradas e não seleccionadas não contam. |
| Pedido elegível | Publicado, não cancelado, não duplicado (`duplicate_of` vazio) e com prazo final (incluindo prorrogações) já terminado. Um pedido reaberto conta uma só vez. |
| Taxa de resposta | pedidos elegíveis com ≥ 1 proposta válida ÷ pedidos elegíveis × 100. |
| Pedido encerrado | Não duplicado, estado Encerrado, Adjudicado ou Arquivado; cancelados nunca contam. |
| Taxa de conversão | pedidos adjudicados ÷ pedidos elegíveis encerrados × 100. «Adjudicado» = decisão registada com resultado «Adjudicado»; não equivale a contrato. |
| Tempo de análise documental | decisão − submissão da **versão** analisada. Cada nova versão reinicia a contagem; a espera por correcção do fornecedor não conta. |
| Tempo de primeira resposta | primeira submissão de proposta − publicação do pedido. |

Regras gerais: sem denominador o indicador mostra «Sem dados disponíveis» (nunca 0 %); valores
monetários mostram sempre a moeda e nunca são somados entre moedas nem entre fornecedores;
«valor proposto», «valor aprovado» e «valor contratado» são conceitos distintos (contratos não
são geridos nesta versão).
