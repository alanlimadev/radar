---
description: Documentar novas funcionalidades ou mudanças em produto para o ecossistema Radar.
---

# Prompt: Criar Documento de Evolução (PRD)

## Objetivo

Produzir uma descrição clara de uma **nova funcionalidade** ou **mudança significativa** em um produto já existente, garantindo alinhamento com a visão geral do **Radar**.

## Entrada

- Descrição da nova necessidade ou mudança.

## Como executar

1. **Contextualize com o sistema atual.**
   - Como essa mudança se encaixa no que já existe em `documentation/prd.md`?
   - Quais perfis de usuário (Cliente/Admin) são impactados?

2. **Defina o Valor.**
   - Por que essa mudança é necessária agora para a manutenção ou evolução do produto?

3. **Escreva em Linguagem de Produto.**
   - Foque em objetivos, regras de negócio e fluxos.
   - **IMPORTANTE:** Não use emojis.

## Estrutura Recomendada

```md
# Evolução: <Nome da Funcionalidade>

## 1. Contexto e Motivação
[Por que estamos mudando isso?]

## 2. Descrição da Mudança
[O que muda no comportamento atual do sistema?]

## 3. Impacto no Usuário
[Como a experiência do Cliente ou Admin é alterada?]

## 4. Regras de Negócio Afetadas
[Lista de regras que precisam ser criadas ou modificadas]

## 5. Perguntas em Aberto / Riscos
```

## Regras

- **PROIBIDO EMOJIS NO COMMIT E TÍTULOS DE PR.**
- **PERMITIDO EMOJIS NESTE DOCUMENTO** para melhorar a visualização.
- Mantenha o texto em PT-BR.
- Garanta que a proposta seja tecnicamente viável dentro da arquitetura atual.
