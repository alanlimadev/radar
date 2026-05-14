# Guia de Prompts (Modo Manutenção) - Radar Framework

Este diretório contém os prompts configurados para auxiliar o assistente de IA na **manutenção e evolução** do Radar Framework.

## Mentalidade de Manutenção

Diferente de um projeto novo, aqui o foco é **estabilidade e consistência**. A IA deve sempre:

1. Ler a documentação de referência (`README.md`, `commit-pattern.md`).
2. Analisar o código existente antes de propor mudanças.
3. Evitar a criação de novos padrões se os atuais forem suficientes.
4. Garantir que não haja regressões.

## Índice de Prompts

- `commit-code-prompt.md`: Padronização de mensagens de commit (Inglês, sem emojis).
- `create-plan-prompt.md`: Para planejar correções ou melhorias na API.
- `create-pr-prompt.md`: Para gerar o comando `gh pr create` seguindo os padrões.
- `create-prd-prompt.md`: Para documentar mudanças em produto.
- `create-spec-prompt.md`: Para detalhar a implementação técnica.
- `create-tests-prompt.md`: Para garantir a estabilidade via testes.
- `implement-spec-prompt.md`: Para executar a mudança de forma técnica.
- `list-features-prompt.md`: Mapeamento de funcionalidades para auditoria.
- `refine-prd-prompt.md`: Refinamento de ideias de produto antes da spec.
- `review-code-prompt.md`: Critérios de qualidade para revisão de código.

---

## Regra de Emojis

Para manter o histórico técnico limpo, seguimos estas restrições:
1. **PROIBIDO:** Mensagens de commit, títulos de PR, comentários no código e arquivos de documentação (.md).
2. **PERMITIDO:** Descrições de PR (body) via GitHub CLI (para melhor legibilidade).
