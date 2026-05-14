---
description: Implementar mudanças técnicas respeitando padrões legados e evitando regressões.
---

# Prompt: Implementar Mudança Técnica

## Objetivo

Executar ajustes, correções ou evoluções técnicas de forma pragmática, garantindo que o código novo se integre perfeitamente aos padrões do **Radar API**.

## Entrada

- Spec técnica ou descrição da tarefa.
- Plano de implementação (se houver).

## Regras de Ouro

- **Analise o código existente primeiro.** Não reinvente a roda; use os serviços, repositories e utilitários que o projeto já oferece.
- **Evite Regressões.** Verifique se sua mudança afeta comportamentos esperados em outras partes do sistema.
- **NÃO USE EMOJIS.**

## Como implementar

1. **Entenda o Módulo.**
   - Leia o arquivo `.module.ts` para entender as dependências.
2. **Implementação Incremental.**
   - Comece pela camada de dados (Prisma/DTOs) se necessário.
   - Siga para o Service (lógica) e por fim Controller.
3. **Mantenha a Consistência.**
   - Siga a nomenclatura e estilo de código dos arquivos vizinhos.
4. **Validação.**
   - Rode `npm run lint` e `npm test` constantemente.

## Reporte o Resultado

- Arquivos alterados.
- Resumo técnico da mudança.
- Testes realizados para garantir a não-regressão.

## Regras

- **PROIBIDO EMOJIS NO COMMIT, TÍTULOS DE PR E COMENTÁRIOS DE CÓDIGO.**
- Não introduza novas bibliotecas sem necessidade extrema.
- Mantenha a documentação Swagger atualizada via DTOs e Decorators.
