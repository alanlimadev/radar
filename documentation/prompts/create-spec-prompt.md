---
description: Detalhar especificações técnicas para mudanças ou novas features em codebase madura.
---

# Prompt: Criar Spec de Evolução Técnica

## Objetivo

Traduzir uma necessidade de evolução em uma especificação técnica detalhada que considere a codebase atual do **Radar API**.

## Entrada

- PRD de evolução ou descrição técnica da mudança.

## Leituras Obrigatórias

- `documentation/architecture.md`
- Código fonte atual dos módulos impactados.

## Como Executar

1. **Entenda o Estado Atual.**
   - Como a funcionalidade é implementada hoje?
2. **Desenhe a Mudança.**
   - O que precisa ser adicionado ou alterado?
   - Quais arquivos novos serão criados?
   - **IMPORTANTE:** Não use emojis.
3. **Valide Retrocompatibilidade.**
   - A mudança quebra algum contrato existente? Se sim, como mitigar?

## Estrutura Obrigatória

```md
---
title: <titulo da spec>
ticket: <LINEAR-ID>
status: open
last_updated_at: <YYYY-MM-DD>
---

# 1. Objetivo Técnico
# 2. Análise da Codebase Atual
[Como funciona hoje e onde será mexido]
# 3. Mudanças Propostas
## 3.1 Alterações no Schema / DB
## 3.2 Novos DTOs e Contratos
## 3.3 Lógica de Negócio (Services)
# 4. Arquivos Impactados
# 5. Plano de Testes e Validação
```

## Regras

- **PROIBIDO EMOJIS NO COMMIT, TÍTULOS DE PR E COMENTÁRIOS DE CÓDIGO.**
- **PERMITIDO EMOJIS EM DOCUMENTOS MD.**
- Use caminhos reais de arquivos.
- Garanta que a spec seja granular o suficiente para implementação direta.
