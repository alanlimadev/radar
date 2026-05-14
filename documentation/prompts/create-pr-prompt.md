---
description: Gerar comando gh pr create com título e descrição para manutenções e melhorias.
---

# Prompt: Criar Pull Request via GitHub CLI (gh)

## Objetivo

Gerar o comando completo para criação de Pull Request usando a ferramenta **GitHub CLI (gh)**, garantindo que o título siga o padrão de commits (em inglês) e a descrição seja técnica e detalhada.

## Estrutura do Comando

Gere o comando seguindo este formato:
```bash
gh pr create --title "<type>(<scope>): <short description in english>" --body "<descrição detalhada em pt-br>"
```

## Regras de Conteúdo

1. **Título (--title):**
   - Deve seguir o padrão `tipo(escopo): descrição`.
   - **Idioma:** Inglês.
   - **Emojis:** Estritamente proibidos.
   - Ex: `feat(game-session): add event broadcasting`

2. **Corpo (--body):**
   - **Idioma:** Português (PT-BR).
   - **Emojis:** Permitidos para melhorar a legibilidade.
   - Estrutura sugerida:
     - **Descrição:** O que foi feito e o porquê.
     - **Mudanças:** Lista de alterações técnicas.
     - **Validação:** Como testar (ex: passos no Swagger ou comandos).

## Checklist de Qualidade

- [ ] Título em inglês e sem emojis.
- [ ] Código segue padrões NestJS/Radar.
- [ ] Descrição clara sobre o impacto da mudança.
