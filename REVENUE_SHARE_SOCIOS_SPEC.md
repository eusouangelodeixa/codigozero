# Especificação — Sistema de Rateio de Receita entre Sócios (Revenue Share)

> Status: **aprovado o conceito + decisões; aguardando "ok" para implementar**.
> Autor do brief: Ângelo. Data: 2026-05-31.

## 1. Problema

A Lojou não permite mais de um colaborador por produto. Hoje a equipe divide a
receita do produto principal (ticket **497 MT**) em percentuais fixos:

| Sócio   | Papel             | %   |
|---------|-------------------|-----|
| Emen    | Proprietário      | 35% |
| Ângelo  | Especialista      | 35% |
| Rival   | Edição de vídeo   | 15% |
| Leonel  | Design gráfico    | 15% |

Solução: todos os pagamentos caem numa **única conta Lojou**; o **Código Zero**
faz a divisão internamente, mostra o saldo de cada sócio em tempo real, e cada um
solicita saque pela plataforma.

## 2. Por que um módulo NOVO (não reaproveitar `CoproducerAccount`)

O `CoproducerAccount` atual pressupõe que cada coprodutor tem **o próprio produto/pid
na Lojou** e a **Lojou faz o split nativo** (`sharePct` é só documentação). Aqui é o
oposto: **um produto, uma conta, split interno**. Conceito muito mais próximo do
módulo de **Afiliados** (`AffiliateCommission` + `AffiliateWithdrawal` com aprovação
de admin), que será o molde.

## 3. Decisões (confirmadas pelo Ângelo)

1. **Base do rateio:** produto + bumps, sobre o **valor realmente recebido**
   (líquido da taxa Lojou e de cupom).
2. **Vendas por afiliado:** **NÃO** entram no rateio dos sócios.
3. **Saque:** sócio solicita → **admin aprova** (espelha afiliados).
4. **Retroatividade:** **só vendas novas** (a partir do deploy).
5. **Stripe (internacional):** **fora** do rateio no v1.
6. **Disponibilidade da comissão:** **D+3** (libera 3 dias após a venda).
7. **Saque mínimo:** **1000 MT**.
8. **Taxa de saque:** **3% + 35 MT** (taxa de saque da Lojou), descontada do valor sacado.

## 4. Matemática

Taxa Lojou = `10% × valor + 10 MT por item` (já em `src/lib/fees.ts`).

**Base líquida por pedido** (recalculada do valor efetivamente cobrado, então cupom
entra naturalmente):

```
numItems = isCloseFriends ? 2 : 1
lojouFee = valorCobrado * 0.10 + numItems * 10
base     = valorCobrado - lojouFee        (coproducerFee = 0 no produto principal)
```

Exemplos:
- Venda simples 497 → 497 − (49,7 + 10) = **437,30** a dividir.
  - Emen 35% = 153,06 · Ângelo 35% = 153,06 · Rival 15% = 65,60 · Leonel 15% = 65,60
- Com Close Friends (497 + 1297 = 1794, 2 itens) → 1794 − (179,4 + 20) = **1594,60**.

**Saque:** `taxa = 3% × valor + 35`; `líquido = valor − taxa`.

## 5. Quais transações entram no pool

No `order.approved` (handler **Lojou** apenas), credita os sócios quando:
- `status = approved`
- `coproducerId = null` (não é venda de coprodutor externo)
- a venda **não** gerou comissão de afiliado (`creditCommissionForOrder` retornou `credited=false`)
- primeira vez que o `orderId` é processado (`!txExistedBefore`) → idempotência
- backstop: `@@unique([partnerId, orderId])` na tabela de comissões

Stripe (`webhook /stripe`) **não** chama o crédito de sócios.
No `order.refunded`: reverte as comissões do pedido (`pending`/`available` → `refunded`).

## 6. Schema (Prisma) — nova migration `partner_revenue_share`

```prisma
model PartnerAccount {
  id            String   @id @default(uuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  displayName   String?              // ex.: "Rival"
  roleLabel     String?              // ex.: "Edição de vídeo"
  sharePct      Float                // 35 / 35 / 15 / 15
  enabled       Boolean  @default(true)
  payoutMethod  String?              // mpesa | emola
  payoutTarget  String?
  notifySale    Boolean  @default(true)
  commissions   PartnerCommission[]
  withdrawals   PartnerWithdrawal[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model PartnerCommission {
  id            String   @id @default(uuid())
  partnerId     String
  partner       PartnerAccount @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  orderId       String         // = Transaction.orderId
  baseAmount    Float          // pool líquido do pedido (auditoria)
  sharePct      Float          // snapshot da % no momento da venda
  amount        Float          // baseAmount * sharePct/100
  availableAt   DateTime       // venda + 3 dias
  status        String   @default("pending") // pending | available | withdrawn | refunded
  withdrawalId  String?
  createdAt     DateTime @default(now())
  @@unique([partnerId, orderId])
  @@index([partnerId, status])
  @@index([availableAt, status])
}

model PartnerWithdrawal {
  id              String   @id @default(uuid())
  partnerId       String
  partner         PartnerAccount @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  amountRequested Float
  feeAmount       Float    // 3% + 35
  amountNet       Float
  payoutMethod    String
  payoutTarget    String
  status          String   @default("pending") // pending | paid | rejected
  notes           String?
  processedAt     DateTime?
  processedBy     String?
  createdAt       DateTime @default(now())
  @@index([partnerId, status])
  @@index([status, createdAt])
}
```
(+ relação inversa `partnerAccount PartnerAccount?` no model `User`.)

## 7. Backend — arquivos

- **`src/services/partner.service.ts`** (molde: `affiliate.service.ts`)
  - `PARTNER_RULES = { withdrawalPercent: 0.03, withdrawalFixed: 35, minWithdrawal: 1000, availableAfterDays: 3 }`
  - `computePartnerBase({ amount, isCloseFriends })` → base líquida
  - `creditPartnersForOrder({ orderId, amount, isCloseFriends })` → cria 1 comissão por sócio enabled (D+3), idempotente
  - `reversePartnersForOrder(orderId)` → `pending`/`available` → `refunded`
  - `getPartnerBalance(partnerId)` → available / pending / withdrawn / lifetime
  - `transitionDuePartnerPending()` → `pending`→`available` quando `availableAt <= now`
  - `quoteWithdrawal(amount)` · `requestWithdrawal(...)` · `markWithdrawalPaid(...)` · `rejectWithdrawal(...)`
  - `getActivePartnerShares()` (+ soma das % para alerta no admin)
- **`src/middlewares/partner.middleware.ts`** — exige `PartnerAccount` habilitada (sem checar role; Ângelo/Emen podem ser admin/superadmin). **Sem** `subscriptionMiddleware`.
- **`src/routes/partner.routes.ts`** → `app.use('/api/partner', ...)` (auth + partner):
  - `GET /me` · `GET /commissions?period=` (tempo real) · `GET /withdrawals` ·
    `POST /withdrawals` · `GET /withdrawals/quote?amount=` · `PATCH /payout-method`
- **`src/routes/partner.admin.routes.ts`** → `app.use('/api/admin', ...)` (auth + admin; escrita = superadmin):
  - `GET /partners` (+ rollups + soma %) · `POST /partners` · `PATCH /partners/:id` · `DELETE /partners/:id`
  - `GET /partner-withdrawals?status=` · `POST /partner-withdrawals/:id/approve` · `.../reject`
- **`src/routes/webhook.routes.ts`** — hook de crédito no fim do `order.approved` (Lojou) + reversão no `order.refunded`.
- **`src/jobs/cron.ts`** — tick horário chamando `transitionDuePartnerPending()` (junto do de afiliados).
- **`src/server.ts`** — montar as 2 rotas novas.
- **`prisma/seed-partners.ts`** — cria/atribui os 4 sócios (valida soma = 100). Cria User p/ Rival/Leonel se não existirem.

## 8. Frontend (Next — ler `node_modules/next/dist/docs/` antes, conforme AGENTS.md)

- **`app/(auth)/socios/page.tsx`** (+ css) — molde: `app/(auth)/afiliacao/page.tsx`:
  saldo disponível / pendente (D+3) / já sacado / total ganho; extrato de comissões
  em tempo real; botão Solicitar Saque (mostra 3%+35 e líquido); histórico de saques.
- **`app/admin/socios/page.tsx`** — gerir sócios (%, enabled, papel), ver rollups e a
  **soma das %** (alerta se ≠ 100).
- **`app/admin/saques/page.tsx`** — adicionar alternância "Afiliados / Sócios" (reusa a UI).
- **`components/layout/AppShell.tsx`** — link "Sócios" (só quem tem conta) e "Sócios" no admin.

## 9. Auditoria

Cada `PartnerCommission.orderId` aponta para a `Transaction`. Tela de admin cruza
`Transaction × PartnerCommission` mostrando, por pedido: bruto, taxa Lojou, base, e
quanto cada sócio recebeu — fechando o ciclo de auditoria ponta a ponta.

## 10. Ordem de implementação

1. Schema + migration  →  2. `partner.service.ts`  →  3. middleware + rotas (member/admin)
→  4. hook no webhook + reversão  →  5. cron D+3  →  6. mount no server  →  7. seed dos 4
→  8. frontend sócio  →  9. frontend admin + saques  →  10. nav  →  11. `tsc` + teste de fluxo.
