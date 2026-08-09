-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "netAmount" DOUBLE PRECISION;

-- Backfill do histórico.
--
-- `amount` sempre guardou o BRUTO, mas o painel rotulava essa coluna como
-- "Líquido" — a receita aparecia inflada pela taxa da Lojou (~11%). O cálculo
-- correcto já existia em lib/fees.ts e era deitado fora.
--
-- Só as vendas aprovadas têm líquido: cancelada/pendente/reembolsada não são
-- dinheiro, e deixar `netAmount` nulo nelas é o que faz o painel mostrar "—"
-- em vez de um valor que nunca existiu.
--
-- Nas 2 aprovadas antigas sem taxa registada, o líquido fica igual ao bruto:
-- é a melhor aproximação disponível e não inventa um desconto que não sabemos.
UPDATE "Transaction"
   SET "netAmount" = ROUND((amount - COALESCE("lojouFee", 0) - COALESCE("coproducerFee", 0))::numeric, 2)::double precision
 WHERE status = 'approved';
