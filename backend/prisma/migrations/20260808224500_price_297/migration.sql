-- AlterTable
ALTER TABLE "LandingConfig" ALTER COLUMN "priceAmount" SET DEFAULT 297;

-- Data migration: a assinatura passou de 497 para 297 MT/mês.
--
-- Mudar só o DEFAULT não altera nada do que está no ar: a linha singleton de
-- produção já existe com 497, e a cópia da landing editada no /admin/landing
-- fica guardada no JSON `sections`, que também traz "497" escrito no texto
-- (headline do preço, CTAs e a resposta do FAQ).
--
-- As substituições são deliberadamente específicas ("497 MT" e o campo
-- priceAmount) para não acertar por acidente outros números da copy — o add-on
-- Close Friends, por exemplo, custa 1.297 MT.
UPDATE "LandingConfig" SET "priceAmount" = 297 WHERE "priceAmount" = 497;

UPDATE "LandingConfig"
   SET sections = REPLACE(sections::text, '497 MT', '297 MT')::jsonb
 WHERE sections::text LIKE '%497 MT%';

UPDATE "LandingConfig"
   SET sections = REPLACE(sections::text, '"priceAmount": "497"', '"priceAmount": "297"')::jsonb
 WHERE sections::text LIKE '%"priceAmount": "497"%';
