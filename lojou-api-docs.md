# Lojou API — Documentação Completa

> **Base URL:** `https://api.lojou.app`  
> **Versão:** v1  
> Todos os endpoints já incluem o prefixo `/v1`.

---

## Visão Geral

A referência interativa da API é gerada a partir do arquivo `api/openapi.yaml`.

### O que você encontra em cada endpoint

- Objetivo da rota (descrição funcional).
- Escopo necessário (`x-required-scopes`) quando a rota é protegida por permissões.
- Parâmetros de path/query.
- Payload de request com validações.
- Estrutura de response com os campos retornados.
- Exemplo prático de retorno para acelerar integração.

### Padrão de respostas

As respostas da API seguem os padrões abaixo (varia por recurso):

| Campo | Descrição |
|---|---|
| `status` | Indica sucesso/erro |
| `message` | Texto de apoio quando aplicável |
| `data` ou `<resource>` | Conteúdo principal retornado |
| `summary` | Agregados (em endpoints de listagem que calculam totais) |
| `page` | Página atual (paginação) |
| `per_page` | Itens por página |
| `last_page` | Última página disponível |
| `total` | Total de registros |

### Filtros e Paginação

Endpoints de listagem aceitam os seguintes query params de paginação:

- `page`
- `per_page`

Algumas rotas também aceitam filtro por `status`:

- **Orders:** `approved`, `pending`, `cancelled`, `refunded`
- **Customer orders:** `approved`, `pending`, `cancelled`

### Fluxo Recomendado

1. Validar autenticação e consultar scopes disponíveis em `GET /v1/scopes`.
2. Criar recursos necessários (`products`, `plans`, `discounts`, etc).
3. Criar pedido em `POST /v1/orders`.
4. Usar `checkout_url` da resposta para redirecionamento de pagamento.
5. Consultar status com `GET /v1/orders/{id}` ou listagens paginadas.

---

## Mapa de Endpoints

### Health

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/v1/ping` | Health check — verifica disponibilidade da API (endpoint público) |

---

### Scopes

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/v1/scopes` | Retorna os scopes configurados nas rotas da API e seus respectivos endpoints |

---

### User

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/v1/user` | Obter usuário autenticado |
| `PATCH` | `/v1/user` | Atualizar usuário autenticado |
| `GET` | `/v1/user/stats` | Obter estatísticas do usuário/loja |

---

### Products

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/v1/categories` | Listar categorias de produto |
| `GET` | `/v1/products` | Listar produtos |
| `POST` | `/v1/products` | Criar produto |
| `GET` | `/v1/products/{id}` | Obter produto (aceita `product_pid` e `id` numérico) |
| `PATCH` | `/v1/products/{id}` | Atualizar produto |
| `DELETE` | `/v1/products/{id}` | Excluir produto |
| `POST` | `/v1/products/{id}/publish` | Enviar produto para revisão/publicação |
| `POST` | `/v1/products/{id}/unpublish` | Despublicar produto |
| `GET` | `/v1/products/{id}/files` | Listar arquivos de um produto |
| `POST` | `/v1/products/{id}/files` | Associar arquivo ao produto |
| `DELETE` | `/v1/products/{id}/files/{file_id}` | Remover arquivo de um produto |

---

### Plans

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/v1/plan` | Criar plano |
| `GET` | `/v1/plans` | Listar planos |
| `GET` | `/v1/plans/{id}` | Obter plano |
| `PATCH` | `/v1/plans/{id}` | Atualizar plano |
| `DELETE` | `/v1/plans/{id}` | Excluir plano |
| `GET` | `/v1/plans/{id}/subscribers` | Listar assinantes de um plano |

---

### Orders

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/v1/orders` | Listar pedidos |
| `POST` | `/v1/orders` | Criar pedido (checkout) |
| `GET` | `/v1/orders/{id}` | Obter pedido |

**Filtros disponíveis para listagem:**  
`?status=approved` | `?status=pending` | `?status=cancelled` | `?status=refunded`

---

### Customers

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/v1/customers` | Listar clientes |
| `GET` | `/v1/customers/{identifier}` | Obter cliente por email ou número |
| `GET` | `/v1/customers/{id}/orders` | Listar pedidos de um cliente |

**Filtros disponíveis para pedidos do cliente:**  
`?status=approved` | `?status=pending` | `?status=cancelled`

---

### Files

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/v1/files` | Listar arquivos |
| `POST` | `/v1/files` | Criar arquivo (link) |
| `DELETE` | `/v1/files/{id}` | Excluir arquivo |

---

### Webhooks

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/v1/webhooks` | Listar webhooks |
| `POST` | `/v1/webhooks` | Criar webhook |
| `GET` | `/v1/webhooks/{id}` | Obter webhook |
| `DELETE` | `/v1/webhooks/{id}` | Excluir webhook |

---

### Discounts

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/v1/discounts` | Listar descontos |
| `POST` | `/v1/discounts` | Criar desconto |
| `GET` | `/v1/discounts/{id}` | Obter desconto |
| `PATCH` | `/v1/discounts/{id}` | Atualizar desconto |
| `DELETE` | `/v1/discounts/{id}` | Excluir desconto |

---

### Affiliates

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/v1/affiliates` | Listar afiliados |
| `DELETE` | `/v1/affiliates/{id}` | Excluir afiliado |

---

## Resumo Total de Endpoints

| Grupo | Qtd. Endpoints |
|-------|---------------|
| Health | 1 |
| Scopes | 1 |
| User | 3 |
| Products | 11 |
| Plans | 6 |
| Orders | 3 |
| Customers | 3 |
| Files | 3 |
| Webhooks | 4 |
| Discounts | 5 |
| Affiliates | 2 |
| **Total** | **42** |

---

## Notas

- A documentação interativa completa (com payloads detalhados, schemas de request/response e exemplos) está disponível em: [https://docs.lojou.app/api/overview](https://docs.lojou.app/api/overview)
- A spec OpenAPI completa está em: `/api/openapi.yaml`
- Autenticação e informações sobre scopes estão documentadas em: `/getting-started/authentication`
