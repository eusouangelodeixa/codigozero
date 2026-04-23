# Código Zero — Design System Spec
**Versão:** 1.0 — MVP Turma 1  
**Destinatários:** Time de Front-End  
**Referências extraídas:** roadmapdevdeoferta.com + PRD Código Zero (Abril 2026)

---

## 0. Filosofia de Design

O design do Código Zero segue uma estética **"Premium Dark Terminal"** — a mesma linguagem visual do roadmapdevdeoferta.com (limpeza tipográfica extrema, hierarquia por peso e label, ausência de ornamentação), elevada com **Glassmorphism funcional** e linguagem de produto técnico de alto nível (Wise, Linear, Manychat).

**Princípio único:** cada pixel comunica que o usuário está dentro de uma ferramenta profissional, não de um curso online. O visual é o produto.

---

## 1. Tokens de Cor

```css
/* ── BACKGROUNDS ─────────────────────────────────────── */
--bg-base:          #0A0A0A;   /* Fundo raiz da aplicação */
--bg-surface:       #111111;   /* Cards, sidebars, painéis */
--bg-elevated:      #1A1A1A;   /* Modais, dropdowns, tooltips */
--bg-glass:         rgba(255, 255, 255, 0.04); /* Containers glassmorphism */
--bg-glass-hover:   rgba(255, 255, 255, 0.07);

/* ── BORDAS ───────────────────────────────────────────── */
--border-default:   rgba(255, 255, 255, 0.08);  /* 1px — padrão de cards */
--border-subtle:    rgba(255, 255, 255, 0.05);  /* Divisores internos */
--border-strong:    rgba(255, 255, 255, 0.15);  /* Hover, foco ativo */
--border-glass:     rgba(255, 255, 255, 0.06);  /* Borda de elementos glass */

/* ── TIPOGRAFIA ───────────────────────────────────────── */
--text-primary:     #FFFFFF;
--text-secondary:   #A1A1AA;   /* Zn-400 — subtítulos, labels */
--text-tertiary:    #52525B;   /* Zn-600 — placeholders, disabled */
--text-accent:      #FFFFFF;   /* Em contexto de destaque */

/* ── ACCENT / CTA ─────────────────────────────────────── */
--accent-primary:   #FFFFFF;               /* Botão primário: branco */
--accent-primary-fg:#0A0A0A;               /* Texto sobre botão primário */
--accent-glow:      rgba(255,255,255,0.08);/* Halo de hover no CTA */

/* ── SEMÂNTICAS ───────────────────────────────────────── */
--color-success:    #22C55E;   /* ✓ Listas positivas, toast sucesso */
--color-error:      #EF4444;   /* ✕ Listas negativas, bloqueios */
--color-warning:    #F59E0B;   /* Alertas — escassez de vagas */
--color-info:       #3B82F6;   /* Labels informativos */

/* ── OVERLAY (Focus Mode — A Forja) ──────────────────── */
--overlay-theatre:  rgba(0, 0, 0, 0.75);   /* backdrop filter brightness */
```

> **Regra de ouro:** nenhum elemento deve usar cor pura além das definidas aqui. Gradientes decorativos são proibidos no app (reservados apenas para a landing page).

---

## 2. Tipografia

### 2.1 Font Stack

```css
/* No <head> — ordem de prioridade */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  --font-sans:  "SF Pro Display", "SF Pro Text", "Inter", system-ui, sans-serif;
  --font-mono:  "SF Mono", "Fira Code", "JetBrains Mono", monospace;
}
```

> SF Pro é carregada automaticamente em dispositivos Apple. Inter é o fallback universal. **Nunca declare `font-family: Inter` sem o prefixo SF Pro.**

---

### 2.2 Escala Tipográfica

| Token          | Tamanho | Peso        | Line-height | Uso                                      |
|----------------|---------|-------------|-------------|------------------------------------------|
| `--type-hero`  | 3rem    | 700 (Bold)  | 1.1         | H1 de onboarding/dashboard               |
| `--type-h1`    | 2rem    | 700         | 1.2         | Títulos de módulo (O Radar, O Cofre…)    |
| `--type-h2`    | 1.5rem  | 600 (Semibold)| 1.25      | Subtítulos de seção                      |
| `--type-h3`    | 1.125rem| 600         | 1.35        | Labels de card, títulos de modal         |
| `--type-body`  | 0.9375rem (15px) | 400 | 1.6       | Corpo de texto, descrições               |
| `--type-small` | 0.8125rem (13px) | 400 | 1.5       | Metadados, timestamps, tooltips          |
| `--type-label` | 0.6875rem (11px) | 500 | 1.4       | Section labels (CAPS), badges            |
| `--type-mono`  | 0.875rem | 400        | 1.5         | Números de telefone, IDs, código         |

```css
/* Labels de seção — padrão extraído do roadmapdevdeoferta.com */
.section-label {
  font-size: var(--type-label);
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
/* Exemplo de uso: "MÓDULO 02", "O RADAR", "LEADS EXTRAÍDOS" */
```

---

### 2.3 Padrão de Hierarquia de Seção (extraído do roadmap)

O roadmapdevdeoferta.com usa um padrão consistente de 3 camadas por bloco de conteúdo. Replicar em todos os módulos do app:

```
[LABEL em caps + cinza]         ← ex: "O RADAR"
[Headline em branco + bold]     ← ex: "Encontre seus leads em segundos"
[Body em cinza secundário]      ← descrição de suporte
```

```html
<!-- Componente base: SectionHeader -->
<div class="section-header">
  <span class="section-label">O Radar</span>
  <h2 class="section-title">Encontre seus leads em segundos</h2>
  <p class="section-description">Informe o nicho e a localização. O sistema faz o resto.</p>
</div>
```

---

## 3. Espaçamento

Sistema baseado em escala de 4px. Use sempre múltiplos do token base.

```css
:root {
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;
  --space-12:  48px;
  --space-16:  64px;
  --space-20:  80px;
  --space-24:  96px;
}

/* Padding padrão de cards no app */
--card-padding-desktop: var(--space-6);   /* 24px */
--card-padding-mobile:  var(--space-4);   /* 16px */

/* Gap entre cards no grid */
--grid-gap: var(--space-4);               /* 16px */
```

---

## 4. Componentes Base

### 4.1 Card (Container principal)

```css
.card {
  background: var(--bg-glass);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  padding: var(--card-padding-desktop);
  transition: border-color 0.2s ease, background 0.2s ease;
}

.card:hover {
  background: var(--bg-glass-hover);
  border-color: var(--border-strong);
}

/* Variante: card métrica (Dashboard) */
.card--metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.card--metric .metric-value {
  font-size: var(--type-h1);
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.card--metric .metric-label {
  font-size: var(--type-small);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

---

### 4.2 Botões

```css
/* ── PRIMÁRIO ─────────────────────────────────────────── */
.btn-primary {
  background: var(--text-primary);       /* Branco sólido */
  color: var(--accent-primary-fg);       /* Preto */
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  font-weight: 600;
  padding: 12px 24px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
  min-height: 44px;                      /* Touch target mobile */
  min-width: 44px;
}

.btn-primary:hover  { opacity: 0.9; }
.btn-primary:active { transform: scale(0.98); }

/* ── SECUNDÁRIO (Ghost) ───────────────────────────────── */
.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  font-size: 0.9375rem;
  font-weight: 500;
  padding: 11px 24px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  min-height: 44px;
}

.btn-secondary:hover {
  background: var(--bg-glass);
  border-color: var(--border-strong);
}

/* ── CTA PRINCIPAL DO DASHBOARD (Iniciar Prospecção) ─── */
.btn-cta-hero {
  background: var(--text-primary);
  color: var(--accent-primary-fg);
  font-size: 1rem;
  font-weight: 700;
  padding: 16px 32px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  letter-spacing: -0.01em;
  transition: all 0.2s ease;
  box-shadow: 0 0 0 0 var(--accent-glow);
}

.btn-cta-hero:hover {
  box-shadow: 0 0 24px 4px var(--accent-glow);
  transform: translateY(-1px);
}
```

---

### 4.3 Listas ✕ / ✓ (Padrão roadmapdevdeoferta.com)

Utilizar nas seções de benefícios e nas comparações (ex: O QG, onboarding).

```css
.list-check,
.list-cross {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.list-check li,
.list-cross li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  font-size: var(--type-body);
  color: var(--text-secondary);
  line-height: 1.5;
}

.list-check li::before {
  content: "✓";
  color: var(--color-success);
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

.list-cross li::before {
  content: "✕";
  color: var(--color-error);
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}
```

---

### 4.4 Numeração de Seção / Step Indicator (Padrão 01, 02, 03)

```css
/* Extração direta do padrão do roadmap */
.step-number {
  font-size: 3.5rem;
  font-weight: 700;
  color: var(--border-strong);   /* Quase invisível — decorativo */
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  user-select: none;
}

/* Uso: headers de módulo no sidebar ou onboarding steps */
.step-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  position: relative;
}

.step-block::before {
  content: attr(data-step);
  font-size: 5rem;
  font-weight: 700;
  color: rgba(255,255,255,0.04);
  position: absolute;
  top: -16px;
  left: -8px;
  line-height: 1;
  pointer-events: none;
  z-index: 0;
}
```

---

### 4.5 Tabela de Leads (O Radar)

```css
.leads-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}

.leads-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-sans);
}

.leads-table thead th {
  font-size: var(--type-label);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding: var(--space-3) var(--space-4);
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.leads-table tbody tr {
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.15s ease;
}

.leads-table tbody tr:last-child {
  border-bottom: none;
}

.leads-table tbody tr:hover {
  background: var(--bg-glass);
}

.leads-table tbody td {
  padding: var(--space-3) var(--space-4);
  font-size: var(--type-body);
  color: var(--text-primary);
  white-space: nowrap;
}

/* Célula de número de telefone — ação de copiar */
.leads-table .td-phone {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}

.leads-table .td-phone:hover {
  color: var(--text-primary);
}

/* Ícone de cópia */
.copy-icon {
  opacity: 0;
  transition: opacity 0.15s ease;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.td-phone:hover .copy-icon {
  opacity: 1;
}

/* Toast de confirmação de cópia (sem refresh) */
.copy-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(8px);
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 10px 18px;
  font-size: var(--type-small);
  color: var(--color-success);
  font-weight: 500;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 9999;
}

.copy-toast.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
```

---

### 4.6 Modal (O Cofre)

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  opacity: 0;
  animation: fadeIn 0.2s ease forwards;
}

.modal-content {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 16px;
  padding: var(--space-8);
  max-width: 560px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  transform: translateY(8px);
  animation: slideUp 0.2s ease forwards;
}

.modal-title {
  font-size: var(--type-h3);
  font-weight: 600;
  color: var(--text-primary);
}

.modal-body {
  font-size: var(--type-body);
  color: var(--text-secondary);
  line-height: 1.65;
  white-space: pre-wrap;
}

/* Botão de copiar tudo — primário no modal */
.modal-actions {
  display: flex;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

/* Touch target mínimo garantido */
.modal-actions .btn-primary,
.modal-actions .btn-secondary {
  min-height: 44px;
  min-width: 44px;
}

@keyframes fadeIn  { to { opacity: 1; } }
@keyframes slideUp { to { transform: translateY(0); } }
```

---

### 4.7 Focus Mode / Teatro (A Forja)

```css
/* Aplicado via JS no click de Play no player */
.forge-container {
  position: relative;
  transition: all 0.3s ease;
}

.forge-backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
  pointer-events: none;
  z-index: 1;
  transition: background 0.4s ease;
}

.forge-backdrop.theatre-active {
  background: rgba(0, 0, 0, 0.75);
  pointer-events: auto;
}

.video-player-wrapper {
  position: relative;
  z-index: 2;
  border-radius: 12px;
  overflow: hidden;
}

/* Escurecer elementos periféricos via filter — não via z-index */
.forge-sidebar,
.forge-tools-section {
  transition: filter 0.4s ease, opacity 0.4s ease;
}

.theatre-active ~ .forge-sidebar,
.theatre-active ~ .forge-tools-section {
  filter: brightness(0.3);
  pointer-events: none;
}
```

---

### 4.8 Barra de Progresso (Dashboard → A Forja)

```css
.progress-bar-track {
  height: 4px;
  background: var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
  width: 100%;
}

.progress-bar-fill {
  height: 100%;
  background: var(--text-primary);
  border-radius: 2px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Label contextual */
.progress-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.progress-label span {
  font-size: var(--type-small);
  color: var(--text-secondary);
}

.progress-label strong {
  font-size: var(--type-small);
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
```

---

### 4.9 Loader do Scraper (Processamento Assíncrono)

```css
/* Estado de loading da tabela enquanto o backend raspa */
.scraper-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-16) var(--space-8);
  text-align: center;
}

.scraper-spinner {
  width: 32px;
  height: 32px;
  border: 1.5px solid var(--border-default);
  border-top-color: var(--text-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.scraper-status-text {
  font-size: var(--type-small);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

/* Texto piscante de status (polling) */
.scraper-status-text::after {
  content: "...";
  animation: blink 1.2s step-end infinite;
}

@keyframes spin  { to { transform: rotate(360deg); } }
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
```

---

### 4.10 Badge de Escassez (Contador de Vagas)

```css
.scarcity-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
  color: var(--color-warning);
  font-size: var(--type-label);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 6px;
}

.scarcity-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-warning);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.85); }
}
```

---

## 5. Layout e Grid

### 5.1 Layout Principal do App

```
┌──────────────────────────────────────────────────────┐
│  SIDEBAR (240px fixo — desktop)                       │
│  Logo + Nav (O Radar, O Cofre, A Forja, O QG)        │
│  + Status da assinatura no rodapé                    │
├──────────────────────────────────────────────────────┤
│  MAIN CONTENT AREA                                    │
│  max-width: 1200px, padding: 32px 40px (desktop)     │
│  padding: 16px (mobile)                              │
└──────────────────────────────────────────────────────┘
```

```css
.app-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
  background: var(--bg-base);
}

.app-sidebar {
  background: var(--bg-surface);
  border-right: 1px solid var(--border-default);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.app-main {
  padding: var(--space-10) var(--space-10);
  max-width: 1200px;
  width: 100%;
}

/* Mobile: sidebar vira bottom nav */
@media (max-width: 768px) {
  .app-layout {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }

  .app-sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: auto;
    flex-direction: row;
    justify-content: space-around;
    padding: var(--space-3) var(--space-4);
    border-right: none;
    border-top: 1px solid var(--border-default);
    background: var(--bg-surface);
    z-index: 50;
  }

  .app-main {
    padding: var(--space-4);
    padding-bottom: 80px; /* Espaço para a bottom nav */
  }
}
```

---

### 5.2 Grid de Cards do Dashboard

```css
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--grid-gap);
  margin-bottom: var(--space-8);
}

.scripts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--grid-gap);
}
```

---

## 6. Navegação (Sidebar)

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 10px var(--space-3);
  border-radius: 8px;
  font-size: var(--type-body);
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 0.15s ease, background 0.15s ease;
  cursor: pointer;
  min-height: 44px;
}

.nav-item:hover {
  color: var(--text-primary);
  background: var(--bg-glass);
}

.nav-item.active {
  color: var(--text-primary);
  background: var(--bg-glass-hover);
}

/* Label de módulo — padrão extraído do roadmap (seção label em caps) */
.nav-section-label {
  font-size: var(--type-label);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding: var(--space-2) var(--space-3);
  margin-top: var(--space-4);
}
```

---

## 7. Estados de Interação

| Estado     | Regra                                                          |
|------------|----------------------------------------------------------------|
| **Hover**  | `border-color` sobe para `--border-strong`. Background sobe para `--bg-glass-hover` |
| **Active** | `transform: scale(0.98)` em botões. Duração: 100ms            |
| **Focus**  | `outline: 2px solid rgba(255,255,255,0.3)`, `outline-offset: 2px`. Nunca remover outline |
| **Disabled** | `opacity: 0.4`, `pointer-events: none`, `cursor: not-allowed` |
| **Loading** | Substituir label do botão por spinner 16px. Manter dimensões |
| **Success** | Toast verde `--color-success` fixo no bottom. Auto-dismiss 2.5s |
| **Error**  | Toast vermelho `--color-error`. Dismiss manual ou 5s          |

---

## 8. Aula Concluída — Botão Booleano

```css
/* Estado: não concluída */
.lesson-complete-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 8px 16px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--type-small);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 44px;
}

.lesson-complete-btn:hover {
  border-color: var(--color-success);
  color: var(--color-success);
}

/* Estado: concluída — aplicado via JS */
.lesson-complete-btn.done {
  background: rgba(34, 197, 94, 0.08);
  border-color: rgba(34, 197, 94, 0.3);
  color: var(--color-success);
  pointer-events: none;
}
```

---

## 9. Countdown de Mentoria (O QG)

```css
.countdown-widget {
  display: flex;
  gap: var(--space-4);
  align-items: center;
}

.countdown-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.countdown-value {
  font-size: var(--type-h2);
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  line-height: 1;
}

.countdown-unit {
  font-size: var(--type-label);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.countdown-separator {
  font-size: var(--type-h2);
  color: var(--text-tertiary);
  margin-bottom: 12px;
  font-weight: 300;
}
```

---

## 10. Regras de Implementação (Checklist para o Dev)

### ✅ Obrigatório
- [ ] Todo container de card usa `backdrop-filter: blur(12px)` + `border: 1px solid var(--border-default)`. **Zero sombra box-shadow nos cards.**
- [ ] Todos os botões interativos têm `min-height: 44px` (touch target mínimo mobile).
- [ ] A tabela do Radar tem `overflow-x: auto` no wrapper — scroll horizontal suave no mobile.
- [ ] O spinner do Scraper é renderizado **no lugar** da tabela durante polling — sem tela branca ou layout shift.
- [ ] O modal do Cofre fecha com `Escape` + clique fora da área de conteúdo.
- [ ] O botão de "Aula Concluída" dispara atualização otimista na barra de progresso do Dashboard **antes** da confirmação do backend.
- [ ] A trava de 50 vagas bloqueia visualmente o CTA da landing page com badge `--color-warning` + texto "Vagas Esgotadas" sem remoção do elemento do DOM.
- [ ] Usar `font-variant-numeric: tabular-nums` em **todos** os números (contadores, progresso, leads extraídos).

### ✕ Proibido
- [ ] **Gradientes decorativos** no interior do app (landing page pode usar, o produto não).
- [ ] `font-family: Inter` sem o prefixo SF Pro no stack.
- [ ] `box-shadow` pesado em cards — substituir por `border` fino.
- [ ] Remoção de `outline` em estados de focus (acessibilidade).
- [ ] Cores fora dos tokens declarados na Seção 1.
- [ ] Fontes abaixo de 13px em qualquer elemento interativo.

---

## 11. CSS Reset Mínimo

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  scroll-behavior: smooth;
}

body {
  font-family: var(--font-sans);
  background: var(--bg-base);
  color: var(--text-primary);
  line-height: 1.5;
  min-height: 100vh;
}

img, video {
  max-width: 100%;
  display: block;
}

button {
  font-family: inherit;
  cursor: pointer;
}
```

---

*Design System Código Zero v1.0 — Gerado em Abril de 2026*
