---
description: Gerar testes unitários e de integração para garantir estabilidade em manutenções.
---

# Prompt: Criar Testes de Estabilidade

## Objetivo

Garantir que correções e evoluções no **Radar API** não introduzam regressões e cubram os novos fluxos de forma robusta.

## Como Executar

1. **Identifique a área de risco.**
   - Onde o bug ocorreu? Qual fluxo foi alterado?
2. **Escreva Testes que Simulem o Erro.**
   - Antes de corrigir, tente reproduzir o comportamento indesejado via teste.
3. **Mantenha o Padrão do Projeto.**
   - Use as bibliotecas de teste já configuradas (Jest).
   - **IMPORTANTE:** Não use emojis.

## O que testar

- **Happy Path:** O novo comportamento funciona?
- **Edge Cases:** Parâmetros nulos, erros de banco, tokens expirados.
- **Regressão:** Fluxos vizinhos continuam funcionando?

## Formato de Saída

- Código de teste `.spec.ts` integrado ao módulo.
- Instrução de como rodar o teste específico.

## Regras

- **PROIBIDO EMOJIS NO CÓDIGO DE TESTE E COMMITS.**
- Prefira mocks para dependências externas (S3, Google Translate).
- Garanta alta cobertura na lógica alterada.
