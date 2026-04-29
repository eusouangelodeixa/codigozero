# Komunika API Reference

Bem-vindo à documentação oficial da API do Komunika. A nossa API foi desenhada com princípios RESTful, permitindo que os seus sistemas enviem e recebam mensagens de WhatsApp, capturem leads e automatizem fluxos com os nossos Funis Inteligentes.

Com uma arquitetura orientada a eventos, a API do Komunika é escalável, garantindo que pode lidar com volumes elevados com latências mínimas, ao estilo de plataformas como Meta e Stripe.

**Documentação interativa:** [https://docs.komunika.site](https://docs.komunika.site)

---

## 1. Introdução

- **URL Base:** `https://api.komunika.site/api/v1`
- **Dashboard:** `https://app.komunika.site`
- **Formato de Dados:** Todas as requisições e respostas são no formato `application/json`
- **Codificação:** `UTF-8`

> [!TIP]
> Desenvolva as suas integrações assumindo que o Komunika enviará webhooks de forma assíncrona para confirmar a entrega de mensagens ou eventos do sistema.

---

## 2. Autenticação

Para se autenticar na API do Komunika, necessita de gerar uma **API Key** através do painel de administração em [app.komunika.site/dashboard/api-keys](https://app.komunika.site/dashboard/api-keys). A chave gerada tem o formato `kmnk_xxxxxxxxxxxxxxxxxxxx`.

As requisições devem incluir o cabeçalho `X-API-Key` ou `Authorization` com o esquema Bearer.

```http
# Opção 1: X-API-Key (Recomendado)
X-API-Key: kmnk_abc123def456ghi789

# Opção 2: Bearer Token
Authorization: Bearer kmnk_abc123def456ghi789
```

**Permissões:** Uma API Key confere acesso total aos recursos do *Company* em que foi criada. Não a partilhe publicamente.

---

## 3. Padrões de Resposta e Erros

A API utiliza códigos de status HTTP convencionais para indicar o sucesso ou falha de uma requisição.

### Códigos de Status Comuns

- `200 OK` - Requisição bem-sucedida.
- `201 Created` - Recurso criado com sucesso (ex: mensagem enfileirada).
- `400 Bad Request` - A requisição tem parâmetros inválidos ou mal formatados.
- `401 Unauthorized` - A API Key fornecida é inválida, não foi enviada, ou foi revogada.
- `403 Forbidden` - Tentativa de aceder a um recurso que não pertence à sua organização.
- `404 Not Found` - O recurso (ex: ID da Instância) não foi encontrado.
- `429 Too Many Requests` - Limite de requisições excedido (*Rate Limit*).
- `500 Internal Server Error` - Erro do lado do servidor do Komunika.

### Estrutura de Erro (Payload)

Quando ocorre um erro, a API retorna um objeto JSON com detalhes para facilitar o *debugging*:

```json
{
  "error": "Bad Request",
  "message": "Content is required for text messages",
  "statusCode": 400
}
```

---

## 4. Endpoints da API

### 4.1. Enviar Mensagem (`POST /messages/send`)

Envia uma mensagem (texto, imagem, vídeo, áudio, ou documento) a um número de WhatsApp através de uma Instância conectada. 

> [!NOTE]
> Este endpoint é assíncrono. O retorno `201` indica que a mensagem foi colocada na fila de disparo com sucesso. Para confirmar a entrega, use os Webhooks.

**Requisição:**
```http
POST https://api.komunika.site/api/v1/messages/send
Content-Type: application/json
X-API-Key: kmnk_...
```

**Corpo (JSON):**
| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `instanceId` | `string` | **Sim** | ID da conexão de WhatsApp (ex: `con_123xyz`). |
| `to` | `string` | **Sim** | Número de destino com código do país (ex: `258840000000`). |
| `type` | `string` | Não (Padrão: `text`) | O tipo de mensagem: `text`, `image`, `video`, `audio`, `document`. |
| `content` | `string` | **Depende** | O texto da mensagem. Obrigatório se `type` for `text`. Funciona como legenda (*caption*) se `type` for multimídia. |
| `mediaUrl` | `string` | **Depende** | URL pública do ficheiro. Obrigatório se `type` for `image`, `video`, `audio`, ou `document`. |

**Exemplo - Enviar Texto:**
```json
{
  "instanceId": "id-da-instancia",
  "to": "258840000000",
  "type": "text",
  "content": "Olá! A sua encomenda #1234 já saiu para entrega."
}
```

**Exemplo - Enviar Fatura (Documento):**
```json
{
  "instanceId": "id-da-instancia",
  "to": "258840000000",
  "type": "document",
  "content": "Aqui está a sua fatura mensal.",
  "mediaUrl": "https://seu-sistema.com/faturas/1234.pdf"
}
```

**Resposta de Sucesso (`201 Created`):**
```json
{
  "success": true,
  "messageId": "BAE5ABCDEF12345"
}
```

---

### 4.2. Status da Instância (`GET /instances/:id/status`)

Obtém o status de conectividade em tempo real de uma instância de WhatsApp.

**Requisição:**
```http
GET https://api.komunika.site/api/v1/instances/id-da-instancia/status
X-API-Key: kmnk_...
```

**Resposta de Sucesso (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "instanceId": "id-da-instancia",
    "name": "Suporte Principal",
    "status": "connected",
    "phone": "258840000000"
  }
}
```

---

### 4.3. Captura de Contactos (`POST /contacts/capture`)

Este endpoint é altamente otimizado para integrar Landing Pages, Formulários de Checkout e ferramentas como o Elementor ou WordPress. Ele regista a Lead e pode desencadear eventos.

> [!TIP]
> A API utiliza lógica **Idempotente** (`upsert`). Se enviar o mesmo número de telefone duas vezes, o Komunika atualiza o contacto existente em vez de criar duplicados.

**Requisição:**
```http
POST https://api.komunika.site/api/v1/contacts/capture
Content-Type: application/json
X-API-Key: kmnk_...
```

**Corpo (JSON):**
```json
{
  "phone": "258840000000",
  "name": "Maria Costa",
  "email": "maria@exemplo.com",
  "tags": ["Checkout", "Vip"],
  "customFields": {
    "utm_source": "FacebookAds",
    "produto_id": "99"
  }
}
```

**Resposta de Sucesso (`201 Created`):**
```json
{
  "success": true,
  "message": "Contact captured successfully",
  "data": {
    "id": "cuid_987",
    "phone": "258840000000",
    "name": "Maria Costa",
    "tags": ["Visitante da Landing Page", "Checkout", "Vip"],
    "customFields": { "utm_source": "FacebookAds", "produto_id": "99" }
  }
}
```

---

### 4.4. Listar Funis Ativos (`GET /funnels`)

Obtém uma lista de todos os funis de automação que estão ativos na sua conta. Útil para obter os IDs (`id`) necessários para injetar leads.

**Requisição:**
```http
GET https://api.komunika.site/api/v1/funnels
X-API-Key: kmnk_...
```

**Resposta de Sucesso (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "cuid_funil_001",
      "name": "Funil de Boas-Vindas",
      "isActive": true,
      "createdAt": "2026-04-24T10:00:00.000Z",
      "updatedAt": "2026-04-24T12:00:00.000Z"
    },
    {
      "id": "cuid_funil_002",
      "name": "Recuperação de Carrinho",
      "isActive": true,
      "createdAt": "2026-04-20T08:30:00.000Z",
      "updatedAt": "2026-04-21T09:15:00.000Z"
    }
  ]
}
```

---

### 4.5. Iniciar Funil Manualmente (`POST /funnels/:id/add-lead`)

Inicia a execução de um fluxo de automação (Funil Komunika) para um contacto específico, independentemente do "Gatilho" nativo do funil. 

**Requisição:**
```http
POST https://api.komunika.site/api/v1/funnels/id-do-funil/add-lead
Content-Type: application/json
X-API-Key: kmnk_...
```

**Corpo (JSON):**
```json
{
  "phone": "258840000000",
  "name": "Carlos",
  "customFields": {
    "ordem_codigo": "ORD-555"
  }
}
```

**Resposta de Sucesso (`201 Created`):**
```json
{
  "success": true,
  "message": "Lead added to funnel successfully",
  "data": {
    "contact": {
      "id": "cuid_123",
      "phone": "258840000000"
    }
  }
}
```

---

## 5. Webhooks (Eventos Outbound)

Os Webhooks permitem ao Komunika empurrar (*push*) notificações de eventos do sistema diretamente para as suas aplicações em tempo real, evitando que tenha de fazer *polling* constante na API. Pode configurar os Webhooks no painel em [app.komunika.site/dashboard/webhooks](https://app.komunika.site/dashboard/webhooks).

### 5.1. Retentativas (Retry Policy)
Se o seu servidor não retornar um status HTTP `20x` (ex: `200 OK`) no espaço de 10 segundos, o sistema assumirá que ocorreu uma falha na entrega, mas o Komunika **não faz retentativas automáticas** na versão V1. O seu sistema deve estar altamente disponível para consumir o payload e processá-lo de forma assíncrona.

### 5.2. Segurança e Assinatura de Webhooks (Signature)

Se configurar uma "Chave Secreta" (Webhook Secret) no painel, o Komunika assinará todos os payloads JSON usando o algoritmo de hashing **HMAC-SHA256**. Esta assinatura será enviada no cabeçalho `X-Komunika-Signature`.

Ao receber o Webhook, o seu servidor deve calcular a assinatura usando o payload cru (raw body) e compará-la com o cabeçalho. Isto previne ataques de repetição (*replay attacks*) e garante que os dados vieram legitimamente do Komunika.

**Exemplo em Node.js (Express):**

```javascript
const crypto = require('crypto');

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = 'SEU_WEBHOOK_SECRET';
  const signatureHeader = req.headers['x-komunika-signature'];
  
  // Computar o hash HMAC-SHA256 do body bruto
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex');

  if (signatureHeader !== expectedSignature) {
    return res.status(401).send('Assinatura Inválida');
  }

  // Parsear os dados
  const payload = JSON.parse(req.body.toString());
  console.log('Evento recebido com sucesso:', payload.event);
  
  res.status(200).send('OK');
});
```

---

### 5.3. Catálogo de Eventos (Payloads)

Todos os Webhooks partilham a mesma estrutura raiz:

```json
{
  "event": "nome.do.evento",
  "timestamp": "2026-04-24T02:00:31.309Z",
  "companyId": "cuid_da_sua_empresa",
  "data": { ... }
}
```

#### 📌 Evento: `message.received`
Disparado imediatamente quando o Komunika recebe uma nova mensagem do WhatsApp vinda de um cliente.

**Payload de Exemplo:**
```json
{
  "event": "message.received",
  "timestamp": "2026-04-24T12:00:00.000Z",
  "data": {
    "whatsappMessageId": "BAE5C123...",
    "conversationId": "cuid_conversacao_123",
    "senderType": "contact",
    "senderName": "João Silva",
    "type": "text",
    "content": "Olá, queria saber mais sobre as vossas integrações.",
    "mediaUrl": null,
    "status": "delivered",
    "createdAt": "2026-04-24T12:00:00.000Z"
  }
}
```

#### 📌 Evento: `contact.created`
Disparado sempre que um **novo** contacto é inserido na sua base de dados no Komunika (quer o primeiro contacto tenha sido via WhatsApp, quer tenha sido inserido pela sua Landing Page através da API).

**Payload de Exemplo:**
```json
{
  "event": "contact.created",
  "timestamp": "2026-04-24T12:05:00.000Z",
  "data": {
    "id": "cuid_456",
    "phone": "258840000000",
    "name": "Maria",
    "avatarUrl": "https://pps.whatsapp.net/v/t61.24694-24/...",
    "email": null,
    "tags": ["Visitante da Landing Page"],
    "customFields": {},
    "createdAt": "2026-04-24T12:05:00.000Z"
  }
}
```

#### 📌 Evento: `conversation.status_changed`
Crucial para ferramentas de análise e relatórios. Disparado sempre que um atendente fecha (resolve) ou abre (atribui) um ticket de atendimento.

**Payload de Exemplo:**
```json
{
  "event": "conversation.status_changed",
  "timestamp": "2026-04-24T12:30:00.000Z",
  "data": {
    "conversationId": "cuid_conversacao_123",
    "contactId": "cuid_456",
    "oldStatus": "pending",
    "newStatus": "resolved",
    "agentId": "cuid_agente_789"
  }
}
```

---

## 6. Limites de Utilização (Rate Limits)

Para garantir a estabilidade global do sistema, o Komunika implementa restrições de chamadas:
- **Requisições de API:** Máximo de `600 requisições por minuto` (RPM) por Company.
- **Webhooks Dispatch:** Não tem limite estrito, mas o volume é proporcional à atividade da sua instância de WhatsApp.

Se exceder os limites, a API começará a retornar o código HTTP `429 Too Many Requests`. Recomendamos a implementação de lógicas de *backoff exponencial* na sua aplicação caso se depare com respostas `429`.

---

## 7. Infraestrutura e Endpoints

| Serviço | URL |
| :--- | :--- |
| **Landing Page** | [https://komunika.site](https://komunika.site) |
| **Dashboard** | [https://app.komunika.site](https://app.komunika.site) |
| **API** | [https://api.komunika.site](https://api.komunika.site) |
| **Documentação** | [https://docs.komunika.site](https://docs.komunika.site) |
| **WhatsApp Engine** | [https://wa.komunika.site](https://wa.komunika.site) |
| **Health Check** | [https://api.komunika.site/health](https://api.komunika.site/health) |

### Verificação Rápida

```bash
# Verificar se a API está online
curl https://api.komunika.site/health

# Resposta esperada:
# {"status":"ok","service":"komunika-api","timestamp":"...","uptime":...}
```
