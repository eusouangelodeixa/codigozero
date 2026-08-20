/**
 * Testes de PERMISSÃO do gate que protege o vídeo (src/services/courseAccess).
 *
 * O endpoint GET /api/members/video/:id só assina a URL depois de passar por
 * hasFullAccess + moduleUnlocked — os mesmos usados aqui. Se este gate afrouxar,
 * bastaria adivinhar um id de aula para receber o vídeo de um módulo pago. Estas
 * funções são PURAS (não consultam o banco), então rodam sem Prisma/DB.
 */
import { describe, it, expect } from 'vitest';
import { hasFullAccess, moduleUnlocked, isVisible } from '../src/services/courseAccess.service';

const NONE = new Set<string>();
const OWNS = (id: string) => new Set<string>([id]);

const subCourse = { id: 'c1', accessType: 'subscription', includedInSubscription: true };
const paidCourse = { id: 'c2', accessType: 'paid', includedInSubscription: false };
const hybrid = { id: 'c3', accessType: 'paid', includedInSubscription: true };

describe('hasFullAccess', () => {
  it('admin/superadmin veem tudo', () => {
    expect(hasFullAccess({ id: 'u', role: 'admin' }, paidCourse, NONE)).toBe(true);
    expect(hasFullAccess({ id: 'u', role: 'superadmin' }, paidCourse, NONE)).toBe(true);
  });

  it('assinante ativo entra no curso incluído na assinatura', () => {
    expect(hasFullAccess({ id: 'u', subscriptionStatus: 'active' }, subCourse, NONE)).toBe(true);
    expect(hasFullAccess({ id: 'u', subscriptionStatus: 'grace_period' }, subCourse, NONE)).toBe(true);
  });

  it('assinante NÃO entra num curso pago-só sem direito próprio', () => {
    expect(hasFullAccess({ id: 'u', subscriptionStatus: 'active' }, paidCourse, NONE)).toBe(false);
  });

  it('CourseAccess (compra/vitalício) sempre abre, mesmo sem assinatura', () => {
    expect(hasFullAccess({ id: 'u', subscriptionStatus: 'canceled' }, paidCourse, OWNS('c2'))).toBe(true);
    expect(hasFullAccess({ id: 'u', subscriptionStatus: null }, subCourse, OWNS('c1'))).toBe(true);
  });

  it('curso híbrido: assinante entra pelo plano E comprador entra pelo direito', () => {
    expect(hasFullAccess({ id: 'u', subscriptionStatus: 'active' }, hybrid, NONE)).toBe(true);
    expect(hasFullAccess({ id: 'u', subscriptionStatus: 'canceled' }, hybrid, OWNS('c3'))).toBe(true);
  });

  it('visitante sem nada não entra', () => {
    expect(hasFullAccess({ id: 'u', subscriptionStatus: 'overdue' }, subCourse, NONE)).toBe(false);
    expect(hasFullAccess({ id: 'u' }, paidCourse, NONE)).toBe(false);
  });
});

describe('moduleUnlocked', () => {
  it('sem acesso completo, só módulo de amostra abre', () => {
    expect(moduleUnlocked(false, { isFree: true })).toBe(true);
    expect(moduleUnlocked(false, { isFree: false })).toBe(false);
    expect(moduleUnlocked(false, {})).toBe(false);
  });
  it('com acesso completo, todo módulo abre', () => {
    expect(moduleUnlocked(true, { isFree: false })).toBe(true);
  });
});

describe('isVisible', () => {
  it('curso pago aparece sempre (vitrine com cadeado)', () => {
    expect(isVisible({ id: 'u' }, paidCourse, NONE)).toBe(true);
  });
  it('curso de assinatura só aparece a quem pode abrir', () => {
    expect(isVisible({ id: 'u', subscriptionStatus: 'canceled' }, subCourse, NONE)).toBe(false);
    expect(isVisible({ id: 'u', subscriptionStatus: 'active' }, subCourse, NONE)).toBe(true);
  });
});
