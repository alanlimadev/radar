# Changelog

## 08-07-2025

### Estrutura Inicial do Projeto

#### Adicionado

- **Projeto NestJS** configurado com TypeScript
- **Banco de dados PostgreSQL** com Prisma ORM
- **Schema do banco** completo com todas as entidades:
  - `User` - Usuários/professores
  - `Quiz` - Quizzes criados pelos professores
  - `Question` - Perguntas dos quizzes
  - `Alternative` - Alternativas das perguntas
  - `GameSession` - Sessões de jogo
  - `Player` - Jogadores participantes
  - `Answer` - Respostas dos jogadores

#### Funcionalidades de Quiz

- **CRUD completo de quizzes**:

  - `POST /quizzes` - Criar quiz
  - `GET /quizzes` - Listar todos os quizzes
  - `GET /quizzes/:id` - Buscar quiz específico
  - `PUT /quizzes/:id` - Atualizar quiz
  - `DELETE /quizzes/:id` - Deletar quiz

- **Gerenciamento de perguntas**:

  - `POST /quizzes/:quizId/questions` - Adicionar pergunta
  - `PUT /questions/:questionId` - Atualizar pergunta
  - `DELETE /questions/:questionId` - Deletar pergunta

- **Gerenciamento de alternativas**:
  - `POST /questions/:questionId/alternatives` - Adicionar alternativa
  - `PUT /alternatives/:alternativeId` - Atualizar alternativa
  - `DELETE /alternatives/:alternativeId` - Deletar alternativa

#### Validações e Regras de Negócio

- **Validação de alternativas**: Cada pergunta deve ter exatamente 4 alternativas
- **Alternativa correta**: Exatamente uma alternativa deve ser marcada como correta
- **Validação de entrada** com class-validator
- **Tratamento de erros** com exceções personalizadas

#### Documentação e Configuração

- **Swagger/OpenAPI** configurado em `/swagger`
- **Validação global** com ValidationPipe
- **Estrutura modular** com controllers, services e repositories
- **DTOs** para validação de entrada e saída
- **Migrations** do Prisma para controle de versão do banco

#### Tecnologias Utilizadas

- NestJS (framework)
- Prisma (ORM)
- PostgreSQL (banco de dados)
- TypeScript
- class-validator (validação)
- Swagger (documentação)
- Docker (containerização)

---

## 03-08-2025

### Autenticação e Segurança

#### Adicionado

- **Sistema de autenticação JWT** completo
- **Rotas de autenticação**:
  - `POST /auth/register` - Registro de professores
  - `POST /auth/login` - Login de professores
- **Proteção de rotas** com `@UseGuards(JwtAuthGuard)`
- **Validação de propriedade** - apenas criador pode editar/deletar quiz
- **Hash de senhas** com bcrypt
- **Tokens JWT** com expiração de 24h

#### Modificado

- **UserController**: Removida rota de criação de usuário
- **QuizController**: Adicionada proteção JWT em todas as rotas
- **QuizService**: Adicionadas validações de permissão
- **CreateQuizDto**: Removido campo `createdBy` (agora automático)

#### Estrutura

- **PrismaService**: Criado para gerenciar conexão com banco
- **PrismaModule**: Criado como módulo global
- **AppModule**: Adicionado AuthModule aos imports

### Como Usar

1. **Registrar professor**:

   ```bash
   POST /auth/register
   {
     "name": "Professor",
     "email": "prof@email.com",
     "password": "senha123"
   }
   ```

2. **Fazer login**:

   ```bash
   POST /auth/login
   {
     "email": "prof@email.com",
     "password": "senha123"
   }
   ```

3. **Criar quiz** (com token):
   ```bash
   POST /quizzes
   Authorization: Bearer <token>
   {
     "title": "Meu Quiz",
     "description": "Descrição",
     "questions": [...]
   }
   ```

### Segurança

- Senhas hasheadas
- Tokens JWT seguros
- Controle de acesso por propriedade
- Validação de entrada
- Documentação Swagger atualizada
