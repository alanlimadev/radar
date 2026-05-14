---
description: Listar funcionalidades existentes para mapear impacto ou documentar estado atual.
---

# Prompt: Listar Funcionalidades (Auditoria)

## Objetivo

Mapear as funcionalidades e fluxos que já existem no **Radar API** para auxiliar em decisões de manutenção ou expansão.

## Como Executar

1. **Analise o código fonte.** Verifique os controllers e serviços para entender o que está exposto.
2. **Consulte o Swagger.** Use as definições de rotas como fonte de verdade.
3. **Consulte o `documentation/prd.md`.** Verifique se o código condiz com a descrição do produto.

## Saída Esperada

Uma lista técnica das funcionalidades por módulo, indicando o estado atual e possíveis débitos técnicos identificados.

---
## Regras

- **PROIBIDO EMOJIS NO COMMIT E TÍTULOS DE PR.**
- **PERMITIDO EMOJIS EM RELATÓRIOS MD.**
- Seja pragmático e direto.
