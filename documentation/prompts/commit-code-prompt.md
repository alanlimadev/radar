---
description: Padronizar mensagens de commit imperativas e em Inglês (Sem emojis).
---

# Prompt: Commitar Mudanças de Manutenção

## Objetivo

Gerar mensagens de commit que sigam o padrão **Conventional Commits**, sejam escritas em **Inglês** e não contenham **nenhum emoji**.

## Regras de Mensagem

- **Tipo:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`.
- **Escopo (Opcional):** O módulo impactado (ex: `auth`, `quiz`, `game-session`, `prisma`).
- **Linguagem:** Inglês, tom imperativo (ex: `add`, `fix`, `remove`, `update`).
- **Emojis:** **ESTRITAMENTE PROIBIDOS.**

## Exemplo de Saída

```
fix(auth): correct jwt expiration validation
```

---
## Regras Adicionais

- **PROIBIDO O USO DE EMOJIS NO COMMIT.**
- Mantenha a mensagem curta e descritiva.
- Siga as definições do arquivo `documentation/commit-pattern.md`.
