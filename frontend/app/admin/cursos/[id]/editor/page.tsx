"use client";
// Editor WYSIWYG da área de membros (nível Kiwify): preview central AO VIVO
// usando os componentes REAIS do aluno (ThemeVars/MembersShell/widgets/
// LoginCard em previewMode) + painéis por aba (Início/Menu/Login/
// Configurações) e alternância desktop/mobile. Salvar = um PATCH com
// {name, coverUrl, config}.
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Smartphone, GripVertical, X, Plus } from "lucide-react";
import { useToast } from "@/components/ui";
import { ThemeVars } from "@/components/members/ThemeVars";
import { MembersShell } from "@/components/members/MembersShell";
import { LoginCard } from "@/components/members/LoginCard";
import { BannerCarousel, ContinueRow, ModuleCarousel, type MemberModule } from "@/components/members/widgets";
import k from "@/components/members/kit.module.css";
import { MEMBER_ICONS, memberIcon } from "@/lib/members/icons";
import {
  MEMBER_DEFAULTS,
  mergeMemberConfig,
  type MemberConfig,
  type MemberMenuItem,
  type MemberHomeSection,
} from "@/lib/members/defaults";
import styles from "../../../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  "Content-Type": "application/json",
});
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

type TabId = "inicio" | "menu" | "login" | "config";
const TABS: { id: TabId; label: string }[] = [
  { id: "inicio", label: "Início" },
  { id: "menu", label: "Menu" },
  { id: "login", label: "Login" },
  { id: "config", label: "Configurações" },
];

function Upload({ label, onDone }: { label: string; onDone: (url: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className={styles.btnSecondary} style={{ cursor: "pointer", display: "inline-block", fontSize: 12.5 }}>
      {busy ? "Enviando…" : label}
      <input
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            const fd = new FormData();
            fd.append("file", file);
            const r = await fetch(`${API}/api/admin/members/upload`, {
              method: "POST",
              headers: { Authorization: `Bearer ${localStorage.getItem("cz_token")}` },
              body: fd,
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            onDone(d.url);
          } catch (err: any) {
            toast.error(err?.message || "Falha no upload");
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
    </label>
  );
}

function ImgField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value?: string;
  onChange: (url?: string) => void;
}) {
  return (
    <div className={styles.formGroup}>
      <label className={styles.formLabel}>{label}</label>
      {value && (
        <img src={value} alt="" style={{ maxWidth: "100%", maxHeight: 90, objectFit: "contain", borderRadius: 8, background: "#000", padding: 4, marginBottom: 8, display: "block" }} />
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Upload label={value ? "Trocar" : "Enviar imagem"} onDone={(url) => onChange(url)} />
        {value && (
          <button type="button" className={styles.btnSecondary} style={{ fontSize: 12.5 }} onClick={() => onChange(undefined)}>
            Remover
          </button>
        )}
      </div>
      {hint && <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", display: "block", marginTop: 6 }}>💡 {hint}</span>}
    </div>
  );
}

export default function CursoEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  const [cfg, setCfg] = useState<MemberConfig | null>(null);
  const [modules, setModules] = useState<MemberModule[]>([]);
  const [tab, setTab] = useState<TabId>("inicio");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/admin/members/courses/${id}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (!d.course) throw new Error();
        setName(d.course.name);
        setSlug(d.course.slug);
        setCoverUrl(d.course.coverUrl || undefined);
        setCfg(mergeMemberConfig(d.course.config));
        // Preview usa o conteúdo real com progresso simulado (~40%).
        setModules(
          (d.course.modules || []).map((m: any) => {
            const lessons = (m.lessons || []).map((l: any, i: number) => ({
              id: l.id,
              title: l.title,
              thumbnailUrl: l.thumbnailUrl,
              duration: l.duration,
              completed: i % 3 === 0,
            }));
            return {
              id: m.id,
              title: m.title,
              coverUrl: m.coverUrl,
              totalLessons: lessons.length,
              completedLessons: lessons.filter((l: any) => l.completed).length,
              lessons,
            };
          }),
        );
      })
      .catch(() => toast.error("Falha ao carregar curso"));
  }, [id, toast]);

  const patch = useCallback((fn: (c: MemberConfig) => MemberConfig) => {
    setCfg((c) => (c ? fn(c) : c));
    setDirty(true);
  }, []);

  const save = async () => {
    if (!cfg || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/members/courses/${id}`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({ name, coverUrl: coverUrl ?? null, config: cfg }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      toast.success("Área de membros salva");
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const previewContinue = useMemo(() => {
    const l = modules.flatMap((m) => m.lessons).find((x) => !x.completed) || modules[0]?.lessons[0];
    return l ? { lessonId: l.id, title: l.title, thumbnailUrl: l.thumbnailUrl } : null;
  }, [modules]);

  if (!cfg) {
    return <div style={{ padding: 40, color: "var(--text-tertiary)" }}>Carregando editor…</div>;
  }

  // ── Preview central (componentes reais do aluno) ──────────────────────────
  const preview =
    tab === "login" ? (
      <ThemeVars config={cfg}>
        <LoginCard config={cfg} courseName={name} previewMode />
      </ThemeVars>
    ) : (
      <ThemeVars config={cfg}>
        <MembersShell
          config={cfg}
          courseName={name}
          user={{ name: "Aluno de Preview" }}
          previewMode
          mobilePreview={device === "mobile"}
        >
          <BannerCarousel slides={cfg.home.banner.slides} previewMode />
          {cfg.home.sections.map((sec) =>
            sec.type === "continue" ? (
              <ContinueRow key={sec.id} title={sec.title || "Continuar assistindo"} item={previewContinue} previewMode />
            ) : (
              <ModuleCarousel key={sec.id} title={sec.title || name} modules={modules} previewMode />
            ),
          )}
          <div style={{ height: 24 }} />
        </MembersShell>
      </ThemeVars>
    );

  // ── Painéis ────────────────────────────────────────────────────────────────
  const slides = cfg.home.banner.slides;
  const sections = cfg.home.sections;
  const menu = cfg.menu;

  const moveItem = <T,>(arr: T[], from: number, to: number): T[] => {
    const next = [...arr];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    return next;
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-base)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", flexWrap: "wrap" }}>
        <button type="button" className={styles.btnSecondary} onClick={() => router.push(`/admin/cursos/${id}`)}>
          ← Voltar
        </button>
        <strong style={{ fontSize: 14 }}>{name}</strong>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? styles.filterBtnActive : styles.filterBtn} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--bg-elevated)", borderRadius: 9, padding: 3 }}>
          <button type="button" className={styles.actionBtn} style={device === "desktop" ? { background: "var(--accent-dim)" } : undefined} onClick={() => setDevice("desktop")} aria-label="Desktop">
            <Monitor size={16} />
          </button>
          <button type="button" className={styles.actionBtn} style={device === "mobile" ? { background: "var(--accent-dim)" } : undefined} onClick={() => setDevice("mobile")} aria-label="Mobile">
            <Smartphone size={16} />
          </button>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={save} disabled={saving || !dirty}>
          {saving ? "Salvando…" : dirty ? "Salvar" : "Salvo ✓"}
        </button>
      </header>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 360px", minHeight: 0 }}>
        {/* Preview */}
        <div style={{ overflow: "auto", background: "#0c1512", padding: 18, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
          <div
            className={k.previewViewport}
            style={{
              width: device === "mobile" ? 375 : "100%",
              maxWidth: device === "mobile" ? 375 : 1280,
              minHeight: 620,
              borderRadius: 14,
              border: "1px solid var(--border-subtle)",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,.45)",
              background: "#0a0a0a",
            }}
          >
            {preview}
          </div>
        </div>

        {/* Painel direito */}
        <aside style={{ borderLeft: "1px solid var(--border-subtle)", overflow: "auto", padding: 16 }}>
          {tab === "inicio" && (
            <>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Banner</h3>
              {slides.map((s, i) => (
                <div key={s.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <img src={s.imageUrl} alt="" style={{ width: "100%", borderRadius: 6, aspectRatio: "32/11", objectFit: "cover" }} />
                  <input
                    className={styles.formInput}
                    style={{ marginTop: 8 }}
                    placeholder="Link do slide (opcional)"
                    value={s.linkUrl || ""}
                    onChange={(e) =>
                      patch((c) => ({
                        ...c,
                        home: { ...c.home, banner: { slides: slides.map((x, xi) => (xi === i ? { ...x, linkUrl: e.target.value || undefined } : x)) } },
                      }))
                    }
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Upload label="Trocar imagem" onDone={(url) => patch((c) => ({ ...c, home: { ...c.home, banner: { slides: slides.map((x, xi) => (xi === i ? { ...x, imageUrl: url } : x)) } } }))} />
                    <button type="button" className={styles.actionBtnDanger} onClick={() => patch((c) => ({ ...c, home: { ...c.home, banner: { slides: slides.filter((_, xi) => xi !== i) } } }))}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {slides.length < 3 && (
                <Upload
                  label={`+ Adicionar slide (${slides.length}/3)`}
                  onDone={(url) => patch((c) => ({ ...c, home: { ...c.home, banner: { slides: [...slides, { id: uid(), imageUrl: url }] } } }))}
                />
              )}
              <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>💡 Tamanho recomendado: 1920×660 px</p>

              <h3 style={{ margin: "20px 0 12px", fontSize: 15 }}>Seções</h3>
              {sections.map((sec, i) => (
                <div
                  key={sec.id}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx !== null && dragIdx !== i) patch((c) => ({ ...c, home: { ...c.home, sections: moveItem(sections, dragIdx, i) } }));
                    setDragIdx(null);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}
                >
                  <GripVertical size={14} style={{ cursor: "grab", color: "var(--text-tertiary)" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                      {sec.type === "continue" ? "Continuar assistindo" : "Módulos"}
                    </div>
                    <input
                      className={styles.formInput}
                      style={{ marginTop: 4, padding: "6px 10px", fontSize: 13 }}
                      placeholder={sec.type === "continue" ? "Continuar assistindo" : "Título da seção (ex.: Bem-vindo)"}
                      value={sec.title || ""}
                      onChange={(e) => patch((c) => ({ ...c, home: { ...c.home, sections: sections.map((x, xi) => (xi === i ? { ...x, title: e.target.value || undefined } : x)) } }))}
                    />
                  </div>
                  <button type="button" className={styles.actionBtnDanger} onClick={() => patch((c) => ({ ...c, home: { ...c.home, sections: sections.filter((_, xi) => xi !== i) } }))}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className={styles.btnSecondary} style={{ fontSize: 12.5 }} onClick={() => patch((c) => ({ ...c, home: { ...c.home, sections: [...sections, { id: uid(), type: "modules" }] } }))}>
                  <Plus size={13} /> Módulos
                </button>
                <button type="button" className={styles.btnSecondary} style={{ fontSize: 12.5 }} onClick={() => patch((c) => ({ ...c, home: { ...c.home, sections: [...sections, { id: uid(), type: "continue" }] } }))}>
                  <Plus size={13} /> Continuar
                </button>
              </div>
            </>
          )}

          {tab === "menu" && (
            <>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Menu</h3>
              {menu.map((item, i) => {
                const Icon = memberIcon(item.icon);
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIdx !== null && dragIdx !== i) patch((c) => ({ ...c, menu: moveItem(menu, dragIdx, i) }));
                      setDragIdx(null);
                    }}
                    style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 10, marginBottom: 8, position: "relative" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <GripVertical size={14} style={{ cursor: "grab", color: "var(--text-tertiary)" }} />
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => setIconPickerFor(iconPickerFor === item.id ? null : item.id)}
                        aria-label="Escolher ícone"
                      >
                        <Icon size={16} />
                      </button>
                      <input
                        className={styles.formInput}
                        style={{ flex: 1, padding: "7px 10px", fontSize: 13 }}
                        value={item.label}
                        onChange={(e) => patch((c) => ({ ...c, menu: menu.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)) }))}
                      />
                      {item.type === "link" && (
                        <button type="button" className={styles.actionBtnDanger} onClick={() => patch((c) => ({ ...c, menu: menu.filter((_, xi) => xi !== i) }))}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {item.type === "link" && (
                      <input
                        className={styles.formInput}
                        style={{ marginTop: 8, padding: "7px 10px", fontSize: 12.5 }}
                        placeholder="https://…"
                        value={item.url || ""}
                        onChange={(e) => patch((c) => ({ ...c, menu: menu.map((x, xi) => (xi === i ? { ...x, url: e.target.value } : x)) }))}
                      />
                    )}
                    {iconPickerFor === item.id && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4, marginTop: 10, background: "var(--bg-elevated)", borderRadius: 10, padding: 8 }}>
                        {Object.entries(MEMBER_ICONS).map(([key, Ic]) => (
                          <button
                            key={key}
                            type="button"
                            className={styles.actionBtn}
                            style={item.icon === key ? { background: "var(--accent-dim)" } : undefined}
                            onClick={() => {
                              patch((c) => ({ ...c, menu: menu.map((x, xi) => (xi === i ? { ...x, icon: key } : x)) }));
                              setIconPickerFor(null);
                            }}
                          >
                            <Ic size={15} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className={styles.btnPrimary}
                style={{ width: "100%" }}
                onClick={() => patch((c) => ({ ...c, menu: [...menu, { id: uid(), type: "link", icon: "link", label: "Novo link", url: "" }] }))}
              >
                Adicionar
              </button>
            </>
          )}

          {tab === "login" && (
            <>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Login</h3>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Layout</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(
                    [
                      ["sidebar", "Barra lateral"],
                      ["fullscreen", "Toda a tela"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      className={cfg.branding.loginLayout === v ? styles.filterBtnActive : styles.filterBtn}
                      onClick={() => patch((c) => ({ ...c, branding: { ...c.branding, loginLayout: v } }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <ImgField
                label="Imagem de fundo"
                hint="Tamanho recomendado: 1920×1080 px"
                value={cfg.branding.loginBgUrl}
                onChange={(url) => patch((c) => ({ ...c, branding: { ...c.branding, loginBgUrl: url } }))}
              />
              <ImgField
                label="Logo"
                hint="Tamanho recomendado: 720×128 px"
                value={cfg.branding.logoUrl}
                onChange={(url) => patch((c) => ({ ...c, branding: { ...c.branding, logoUrl: url } }))}
              />
            </>
          )}

          {tab === "config" && (
            <>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Configurações gerais</h3>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Nome da área de membros</label>
                <input className={styles.formInput} value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>members.czero.sbs/{slug}</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tema</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(
                    [
                      ["light", "☀️ Claro"],
                      ["dark", "🌙 Escuro"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      className={cfg.theme.mode === v ? styles.filterBtnActive : styles.filterBtn}
                      onClick={() => patch((c) => ({ ...c, theme: { ...c.theme, mode: v } }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Cor primária</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="color"
                    value={cfg.theme.primaryColor}
                    onChange={(e) => patch((c) => ({ ...c, theme: { ...c.theme, primaryColor: e.target.value } }))}
                    style={{ width: 44, height: 34, border: "none", borderRadius: 8, background: "none", cursor: "pointer" }}
                  />
                  <code style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{cfg.theme.primaryColor}</code>
                </div>
              </div>
              <ImgField
                label="Logotipo"
                hint="Tamanho recomendado: 720×128 px"
                value={cfg.branding.logoUrl}
                onChange={(url) => patch((c) => ({ ...c, branding: { ...c.branding, logoUrl: url } }))}
              />
              <ImgField
                label="Favicon"
                hint="Tamanho recomendado: 64×64 px"
                value={cfg.branding.faviconUrl}
                onChange={(url) => patch((c) => ({ ...c, branding: { ...c.branding, faviconUrl: url } }))}
              />
              <ImgField
                label="Imagem para compartilhamento (OG)"
                hint="Tamanho recomendado: 1200×630 px"
                value={cfg.branding.ogImageUrl}
                onChange={(url) => patch((c) => ({ ...c, branding: { ...c.branding, ogImageUrl: url } }))}
              />
              <ImgField
                label="Imagem de capa (grade Meus Cursos)"
                hint="Tamanho recomendado: 640×360 px"
                value={coverUrl}
                onChange={(url) => {
                  setCoverUrl(url);
                  setDirty(true);
                  patch((c) => ({ ...c, branding: { ...c.branding, coverUrl: url } }));
                }}
              />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
