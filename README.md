# Product Catalog API

API de catálogo de produtos: o core que alimenta vendas, marketplace e logística. Backend-only, sem frontend, sem auth.

## Stack

NestJS 11, TypeORM, PostgreSQL 17, CQRS, BullMQ + Redis (cache + filas), Winston, Scalar (swaggerdocs), Vitest, Docker Compose.

---

## Rodando o projeto

Precisa de Node >= 24, pnpm >= 10 e Docker.

```bash
cp .env.example .env
docker compose up --build
```

API em `http://localhost:3000`, docs em `http://localhost:3000/docs`.

Se preferir rodar a API fora do container:

```bash
docker compose up postgres redis -d
cp .env.example .env
pnpm install
pnpm start:dev
```

Testes:

```bash
pnpm test              # unitários
pnpm test:integration  # integração
pnpm test:all          # todos
```

---

## Variáveis de ambiente

Tudo tem default sensato pra desenvolvimento. Olha o `.env.example`:

| Variável | Default |
|---|---|
| `APP_PORT` | `3000` |
| `PG_HOST` / `PG_PORT` | `localhost` / `5432` |
| `PG_USERNAME` / `PG_PASSWORD` | `postgres` / `postgres` |
| `PG_DATABASE` | `product_catalog` |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` |

---

## Endpoints

A documentação completa com exemplos de request/response está no Scalar (`/docs`). Resumo:

**Products** — `/products`

- `POST /` — cria produto (nasce como DRAFT)
- `GET /` — lista com filtros (nome, status) e paginação
- `GET /:id` — detalhe com categorias e atributos
- `PATCH /:id` — atualiza nome/descrição
- `PATCH /:id/activate` — ativa (DRAFT >> ACTIVE)
- `PATCH /:id/archive` — arquiva
- `POST /:id/categories/:categoryId` — associa categoria
- `DELETE /:id/categories/:categoryId` — remove categoria
- `POST /:id/attributes` — adiciona atributo (key/value)
- `PATCH /:id/attributes/:attributeId` — atualiza atributo
- `DELETE /:id/attributes/:attributeId` — remove atributo

**Categories** — `/categories`

- `POST /` — cria (com `parentId` opcional pra hierarquia)
- `GET /` — lista com filtros e paginação
- `GET /:id` — detalhe com parent e children
- `PATCH /:id` — atualiza

**Audit** — `GET /audit` — consulta logs de auditoria com filtros

**Health** — `GET /health` — status da API e do banco

---

## Decisões e trade-offs

### Arquitetura: domínio, ports e handlers

As regras de negócio vivem na entidade `Product` — métodos como `activate()`, `archive()`, `applyUpdate()`, `addCategory()`, `assertModifiable()` encapsulam pré-condições e transições de estado. Os command handlers orquestram (buscar, chamar método de domínio, persistir, publicar evento) mas não decidem regras.

Os handlers dependem de **interfaces de repositório** (`ProductRepositoryPort`, `CategoryRepositoryPort`, `ProductAttributeRepositoryPort`) e não do `Repository<T>` do TypeORM diretamente. As implementações concretas (`TypeOrmProductRepository`, etc.) ficam em `infrastructure/` e são injetadas via DI nos módulos. Trocar o ORM ou testar com in-memory não exige mexer nos handlers.

**Trade-off consciente:** as entidades ainda carregam decorators do TypeORM (`@Entity`, `@Column`, etc.), ou seja, não há um modelo de domínio 100% puro separado de um modelo de persistência. Criar essa separação exigiria uma camada de mapeamento (domain <> persistence) que, pra esse escopo, adicionaria complexidade sem ganho proporcional. Se o domínio crescer a ponto de divergir da modelagem relacional, aí justifica.

### CQRS

O domínio tem regras de negócio bem definidas: transições de status, pré-condições pra ativação, restrições em produto arquivado. Com CQRS, cada regra vive num handler isolado — fácil de testar, fácil de encontrar, fácil de evoluir.

Na prática: pra adicionar uma nova regra de negócio, crio um Command + Handler novo sem mexer em nada que já funciona. Cada handler publica um evento de domínio via `EventBus`, que o módulo de auditoria consome de forma desacoplada.

O trade-off é mais arquivos. Mas com a separação `impl/` e `handlers/`, a navegação fica clara. Um service monolítico com 500 linhas e 15 métodos seria pior de manter.

### Redis: cache + filas com uma infra só

Redis serve dois propósitos aqui: **cache de leitura** e **fila de mensagens** (BullMQ). Uma instância, dois problemas resolvidos.

**Cache:** rotas de leitura frequente (`GET /products/:id`, `GET /categories/:id`, `GET /categories`) são cacheadas no Redis com TTL curto (30s pra produtos, 60s pra categorias). Qualquer mutação (create, update, activate, archive) invalida o cache da entidade afetada. Pra lista de categorias, usa um versionamento simples: cada mutação incrementa a versão, e as entradas antigas expiram sozinhas pelo TTL. Resultado: menos queries no banco sem risco de servir dado obsoleto por muito tempo.

**Filas (BullMQ):** eventos de auditoria são enfileirados no Redis via BullMQ e processados de forma assíncrona. Retry com backoff exponencial (1s >> 2s >> 4s), dead-letter queue, e o `@nestjs/bullmq` é módulo oficial do NestJS.

**Por que não Kafka/RabbitMQ/SQS?** Kafka é projetado pra milhões de eventos/segundo com partitioning e replay. Aqui são dezenas de eventos de auditoria por minuto. RabbitMQ é robusto mas adicionaria mais um serviço pra gerenciar. SQS é AWS-only e difícil de rodar local. Redis já estava no docker-compose pro cache, então BullMQ roda em cima dele sem infraestrutura nova. Pragmatismo > purismo.

### Por que não Outbox Pattern?

Hoje o `save` no banco e o `eventBus.publish` acontecem em sequência, sem transação compartilhada. Se o publish falhar depois do save, o evento de auditoria se perde. O Outbox Pattern resolveria isso: salvar o evento numa tabela `outbox` na mesma transação do comando, e um worker separado publicaria.

Não implementei porque: (1) a auditoria aqui é interna, não regulatória: perder um evento ocasional não gera consequência crítica; (2) o retry do BullMQ cobre a maioria dos cenários de falha transitória; (3) o Outbox adicionaria um cron/poller, uma tabela auxiliar e lógica de idempotência nos consumers, complexidade desproporcional pro escopo.

Se a auditoria virar requisito regulatório, o caminho seria: transação TypeORM com `save` + `outbox insert`, e um scheduler (`@nestjs/schedule`) consumindo a tabela outbox e publicando no BullMQ.

### TypeORM

Requisito do desafio. Configurado com `synchronize: true` em dev (cria as tabelas automaticamente). Em produção usaria migrations com `synchronize: false`.

Modelagem:
- Product <> Category: ManyToMany via join table `product_categories`
- Product >> ProductAttribute: OneToMany com cascade e `ON DELETE CASCADE`
- Category >> Category: auto-referência pra hierarquia simples (parentId)
- AuditLog: tabela independente, sem FKs: log é registro histórico, não referência viva

### Qualidade: erros padronizados e observabilidade

**RequestId:** toda request recebe um UUID via middleware (`x-request-id`). Se o client já envia o header, ele é preservado. Todas as respostas de erro incluem o `requestId`, facilitando correlação de logs em produção.

**Logs estruturados:** handlers logam objetos JSON com contexto (`{ action, productId, changes }`) em vez de strings interpoladas. Em produção, isso vai direto pro Datadog/ELK/CloudWatch sem precisar de parser ou regex.

**Validação:** todos os params de rota usam `ParseUUIDPipe`, todos os bodies passam por DTOs com `class-validator`. Filtros de exceção globais (`GlobalExceptionFilter`, `HttpExceptionFilter`, `TypeormExceptionFilter`) garantem resposta padronizada com `statusCode`, `message`, `requestId`, `timestamp` e `path`.

---

## Testes

73 testes, separados em dois comandos:

- `pnpm test` — 66 testes unitários: cada command/query handler testado isoladamente com mocks dos ports de repositório. Cobrem cenários de sucesso, rejeição por regra de negócio (ativação sem categoria, alteração em produto arquivado, nome duplicado, etc.) e edge cases (nenhuma alteração, entidade não encontrada).

- `pnpm test:integration` — 7 testes de integração: fluxo completo de ciclo de vida do produto (criar >> adicionar categoria >> adicionar atributo >> ativar >> arquivar) e todas as rejeições esperadas após arquivamento.

Os mocks nos testes unitários implementam as interfaces de port (`ProductRepositoryPort`, `CategoryRepositoryPort`), não o `Repository<T>` do TypeORM — ou seja, os testes validam lógica de negócio sem nenhum acoplamento com ORM.

---

## Regras de negócio

**Produto:**
- Nasce como DRAFT. Transições: DRAFT >> ACTIVE, DRAFT >> ARCHIVED, ACTIVE >> ARCHIVED
- Pra ativar precisa de: pelo menos 1 categoria, pelo menos 1 atributo, e nome único no sistema
- Produto ARCHIVED: não volta pra ACTIVE, não aceita mudança em categorias/atributos. Só a descrição pode ser editada
- Atributos têm key única por produto (não dá pra ter duas vezes "cor")

**Categoria:**
- Nome único no sistema
- Hierarquia simples via parentId (se informado, o pai precisa existir)
- Não pode ser pai de si mesma
