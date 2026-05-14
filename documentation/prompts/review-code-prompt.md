---
description: Revisar código focando em qualidade, padrões NestJS e prevenção de regressão.
---

# Prompt: Revisar Mudança de Código

## Objetivo

Garantir que as manutenções e novas funcionalidades no **Radar API** sigam os padrões de qualidade, segurança e performance estabelecidos.

## Critérios de Revisão

1. **Aderência aos Padrões:** O código respeita a estrutura do módulo (Module/Controller/Service/DTO)?
2. **Segurança:** Existem falhas de autenticação, vazamento de dados ou falta de validação em DTOs?
3. **Performance:** O uso do Prisma é eficiente (evita N+1)? Existem loops desnecessários?
4. **Legibilidade:** O código é fácil de manter por outros desenvolvedores? (Verifique se não há emojis em comentários ou strings de log técnico).
5. **Regras de Negócio:** A implementação condiz com o PRD de evolução?

---
## Regras

- **PROIBIDO EMOJIS NO COMMIT, TÍTULOS DE PR E COMENTÁRIOS DE CÓDIGO.**
- Se houver algo errado, sugira a correção técnica exata baseada nos padrões do projeto.
