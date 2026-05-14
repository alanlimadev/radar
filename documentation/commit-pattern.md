# Padrão de Commits - Tour Jeri

Este projeto utiliza o padrão de **Conventional Commits** para manter um histórico limpo e facilitar a geração de changelogs.

## Regra de Ouro: SEM EMOJIS NO COMMIT
As mensagens de commit devem ser puramente textuais para garantir compatibilidade com terminais e ferramentas de log. Emojis são permitidos apenas na **descrição** do Pull Request, mas nunca no commit ou no título do PR.

## Estrutura do Commit

```
<tipo>(<escopo>): <descrição curta>

[corpo opcional]

[rodapé opcional]
```

### Regras Principais:
1. **Idioma:** Todas as mensagens devem ser em Inglês.
2. **Clareza:** A descrição deve ser imperativa e objetiva (ex: "add route", em vez de "adding route").
3. **Escopo:** Quando aplicável, use o módulo afetado (ex: `feat(auth):`, `fix(prisma):`, `docs(api):`).

### Tipos Permitidos:

- `feat`: Nova funcionalidade.
- `fix`: Correção de bug.
- `docs`: Alterações em documentação.
- `style`: Formatação, pontos e vírgulas ausentes, etc. (sem mudança no código).
- `refactor`: Refatoração que não corrige bug nem adiciona funcionalidade.
- `test`: Adição ou correção de testes.
- `chore`: Atualizações de build, pacotes, etc.
- `perf`: Mudança de código focada em performance.
- `ci`: Alterações em arquivos de configuração de CI/CD.

### Exemplos Válidos:

- `feat(quiz): add support for multiple-choice questions`
- `fix(game-session): resolve race condition in player joining`
- `docs(docker): clarify volume mount configuration`
- `refactor(auth): simplify jwt strategy validation`
- `chore(deps): bump prisma client to latest major version`

### Exemplos INVÁLIDOS:

- `feat: add login 🚀` (CONTÉM EMOJI)
- `fixing auth bug` (FORA DO PADRÃO E NÃO IMPERATIVO)
- `FIX: database error` (TIPO DEVE SER MINÚSCULO)
