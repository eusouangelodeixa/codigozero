-- Banners rotativos da tela inicial do app do aluno (config via /admin/config).
ALTER TABLE "SystemConfig" ADD COLUMN "dashboardBanners" JSONB;
