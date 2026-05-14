---
description: Analisar impacto e criar plano de manutenção ou evolução em codebase existente.
---

# Prompt: Criar Plano de Manutenção

## Objetivo

Transformar uma necessidade de ajuste ou nova feature em um plano de execução seguro, rastreável e que respeite a arquitetura atual do **Radar API**.

## Entrada

- Ticket de ajuste ou descrição da nova funcionalidade.

## Leituras Obrigatórias (Contexto Real)

- `documentation/prd.md`
- `documentation/architecture.md`
- Código fonte relacionado à alteração (ex: módulos que serão tocados).

## Como montar o plano

1. **Análise de Impacto (Crucial).**
   - Identifique quais arquivos já existem e serão alterados.
   - Verifique se a mudança afeta contratos de API (Swagger/DTOs) ou o banco de dados (Prisma).

2. **Mapeie dependências.**
   - O que precisa ser feito primeiro para não quebrar o sistema? (Ex: Migration -> DTO -> Service -> Controller).

3. **Defina Fases de Entrega.**
   - Fases curtas com validações intermediárias.
   - **IMPORTANTE:** Não use emojis.

4. **Planeje a Verificação.**
   - Como garantir que nada quebrou? (Testes unitários, E2E, Lint).

## Formato Esperado

```md
# Plano de Manutenção / Evolução

## Objetivo
<Resumo do que será alterado/corrigido>

## Impacto Identificado
- Módulos afetados: [lista]
- Alteração no Banco: [Sim/Não]
- Quebra de contrato (Breaking Change): [Sim/Não]

## Fases

### Fase 1 - Preparação e Dados
- [ ] Ajustes no Prisma Schema (se houver)
- [ ] Atualização de DTOs

### Fase 2 - Implementação da Lógica
- [ ] Alterações no Service
- [ ] Ajustes no Controller e Swagger

## Validação e Testes
- [ ] Teste unitário para cobrir a mudança
- [ ] Verificação de integridade (npm run lint)
```

## Regras

- **PROIBIDO EMOJIS NO COMMIT E TÍTULOS DE PR.**
- **PERMITIDO EMOJIS EM DOCUMENTAÇÃO E DESCRIÇÕES DE PR.**
- Respeite rigorosamente os padrões de código já presentes no projeto.
- Priorize a estabilidade do sistema sobre a velocidade de entrega.
