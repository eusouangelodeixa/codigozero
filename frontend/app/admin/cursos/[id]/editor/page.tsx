"use client";
// Editor WYSIWYG da área de membros — chrome CLARO fiel ao editor da Kiwify:
// header branco (abas com ícone, toggles de dispositivo, Salvar azul), canvas
// cinza com preview AO VIVO dos componentes REAIS do aluno (desktop em cartão
// / mobile em moldura de celular com notch) e painel direito branco com dicas
// amarelas de tamanho. Salvar = um PATCH {name, coverUrl, config}.
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  House,
  KeyRound,
  Menu as MenuIcon,
  Monitor,
  Plus,
  Settings,
  Smartphone,
  GripVertical,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { ThemeVars } from "@/components/members/ThemeVars";
import { MembersShell } from "@/components/members/MembersShell";
import { LoginCard } from "@/components/members/LoginCard";
import { BannerCarousel, ContinueRow, ModuleCarousel, type MemberModule } from "@/components/members/widgets";
import { MEMBER_ICONS, memberIcon } from "@/lib/members/icons";
import { mergeMemberConfig, type MemberConfig } from "@/lib/members/defaults";
import e from "./editor.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  "Content-Type": "application/json",
});
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

type TabId = "inicio" | "menu" | "login" | "config";
const TABS: { id: TabId; label: string; icon: typeof House }[] = [
  { id: "inicio", label: "Início", icon: House },
  { id: "menu", label: "Menu", icon: MenuIcon },
  { id: "login", label: "Login", icon: KeyRound },
  { id: "config", label: "Configurações", icon: Settings },
];

function Upload({ label, onDone, small }: { label: string; onDone: (url: string) => void; small?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className={e.smallBtn} style={{ cursor: "pointer", display: "inline-block" }}>
      {busy ? "Enviando…" : label}
      <input
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={async (ev) => {
          const file = ev.target.files?.[0];
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
            ev.target.value = "";
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
    <div className={e.group}>
      <label className={e.label}>{label}</label>
      {value && (
        <div className={e.imgPreview}>
          <img src={value} alt="" />
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Upload label={value ? "Trocar" : "Selecione do computador"} onDone={(url) => onChange(url)} />
        {value && (
          <button type="button" className={e.smallBtn} onClick={() => onChange(undefined)}>
            Remover
          </button>
        )}
      </div>
      {hint && <div className={e.hint}>💡 {hint}</div>}
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
        // Preview usa o conteúdo real com progresso simulado (~1/3).
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
    } catch (err: any) {
      toast.error(err?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const previewContinue = useMemo(() => {
    const l = modules.flatMap((m) => m.lessons).find((x) => !x.completed) || modules[0]?.lessons[0];
    return l ? { lessonId: l.id, title: l.title, thumbnailUrl: l.thumbnailUrl } : null;
  }, [modules]);

  if (!cfg) {
    return <div className={e.page} style={{ display: "grid", placeItems: "center", color: "#6b7280" }}>Carregando editor…</div>;
  }

  // ── Preview central (componentes reais do aluno) ──────────────────────────
  const previewInner =
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
    <div className={e.page}>
      {/* Header */}
      <header className={e.header}>
        <button type="button" className={e.backBtn} onClick={() => router.push(`/admin/cursos/${id}`)} aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <span className={e.title}>{name.toUpperCase()}</span>

        <div className={e.tabs}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" className={`${e.tab} ${tab === t.id ? e.tabActive : ""}`} onClick={() => setTab(t.id)}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        <div className={e.deviceGroup}>
          <button
            type="button"
            className={`${e.deviceBtn} ${device === "desktop" ? e.deviceBtnActive : ""}`}
            onClick={() => setDevice("desktop")}
            aria-label="Desktop"
          >
            <Monitor size={16} />
          </button>
          <button
            type="button"
            className={`${e.deviceBtn} ${device === "mobile" ? e.deviceBtnActive : ""}`}
            onClick={() => setDevice("mobile")}
            aria-label="Mobile"
          >
            <Smartphone size={16} />
          </button>
        </div>

        <button type="button" className={e.saveBtn} onClick={save} disabled={saving || !dirty}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </header>

      <div className={e.body}>
        {/* Canvas */}
        <div className={e.canvas}>
          {device === "mobile" && tab !== "login" ? (
            <div className={e.phone}>
              <div className={e.phoneNotch} />
              <div className={e.phoneScreen}>{previewInner}</div>
            </div>
          ) : (
            <div className={e.desktopFrame} style={device === "mobile" ? { maxWidth: 420 } : undefined}>
              {previewInner}
            </div>
          )}
        </div>

        {/* Painel direito */}
        <aside className={e.panel}>
          {tab === "inicio" && (
            <>
              <h3 className={e.h3}>Início</h3>
              <div className={e.group}>
                <label className={e.label}>Banner</label>
                {slides.map((s, i) => (
                  <div key={s.id} className={e.itemCard}>
                    <div className={e.imgPreview} style={{ marginBottom: 8 }}>
                      <img src={s.imageUrl} alt="" />
                    </div>
                    <input
                      className={e.input}
                      placeholder="Link do slide (opcional)"
                      value={s.linkUrl || ""}
                      onChange={(ev) =>
                        patch((c) => ({
                          ...c,
                          home: { ...c.home, banner: { slides: slides.map((x, xi) => (xi === i ? { ...x, linkUrl: ev.target.value || undefined } : x)) } },
                        }))
                      }
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                      <Upload label="Trocar imagem" onDone={(url) => patch((c) => ({ ...c, home: { ...c.home, banner: { slides: slides.map((x, xi) => (xi === i ? { ...x, imageUrl: url } : x)) } } }))} />
                      <button
                        type="button"
                        className={e.removeBtn}
                        style={{ marginLeft: "auto" }}
                        aria-label="Remover slide"
                        onClick={() => patch((c) => ({ ...c, home: { ...c.home, banner: { slides: slides.filter((_, xi) => xi !== i) } } }))}
                      >
                        <X size={12} />
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
                <div className={e.hint}>💡 Tamanho recomendado: 1920×550 pixels</div>
              </div>

              <div className={e.group}>
                <label className={e.label}>Seções</label>
                {sections.map((sec, i) => (
                  <div
                    key={sec.id}
                    className={e.itemCard}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={() => {
                      if (dragIdx !== null && dragIdx !== i) patch((c) => ({ ...c, home: { ...c.home, sections: moveItem(sections, dragIdx, i) } }));
                      setDragIdx(null);
                    }}
                  >
                    <div className={e.itemRow}>
                      <GripVertical size={14} className={e.dragHandle} />
                      <div style={{ flex: 1 }}>
                        <span className={e.subtle}>{sec.type === "continue" ? "Continuar assistindo" : "Módulos"}</span>
                        <input
                          className={e.input}
                          style={{ marginTop: 5 }}
                          placeholder={sec.type === "continue" ? "Continuar assistindo" : "Título da seção (ex.: Bem-vindo)"}
                          value={sec.title || ""}
                          onChange={(ev) => patch((c) => ({ ...c, home: { ...c.home, sections: sections.map((x, xi) => (xi === i ? { ...x, title: ev.target.value || undefined } : x)) } }))}
                        />
                      </div>
                      <button
                        type="button"
                        className={e.removeBtn}
                        aria-label="Remover seção"
                        onClick={() => patch((c) => ({ ...c, home: { ...c.home, sections: sections.filter((_, xi) => xi !== i) } }))}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className={e.linkBtn} onClick={() => patch((c) => ({ ...c, home: { ...c.home, sections: [...sections, { id: uid(), type: "modules" }] } }))}>
                  <Plus size={14} /> Adicionar seção de módulos
                </button>
                <br />
                <button type="button" className={e.linkBtn} onClick={() => patch((c) => ({ ...c, home: { ...c.home, sections: [...sections, { id: uid(), type: "continue" }] } }))}>
                  <Plus size={14} /> Adicionar "Continuar assistindo"
                </button>
              </div>
            </>
          )}

          {tab === "menu" && (
            <>
              <h3 className={e.h3}>Menu</h3>
              {menu.map((item, i) => {
                const Icon = memberIcon(item.icon);
                return (
                  <div
                    key={item.id}
                    className={e.itemCard}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={() => {
                      if (dragIdx !== null && dragIdx !== i) patch((c) => ({ ...c, menu: moveItem(menu, dragIdx, i) }));
                      setDragIdx(null);
                    }}
                  >
                    <div className={e.itemRow}>
                      <GripVertical size={14} className={e.dragHandle} />
                      <button
                        type="button"
                        className={e.iconBtn}
                        onClick={() => setIconPickerFor(iconPickerFor === item.id ? null : item.id)}
                        aria-label="Escolher ícone"
                      >
                        <Icon size={16} />
                      </button>
                      <input
                        className={e.input}
                        value={item.label}
                        onChange={(ev) => patch((c) => ({ ...c, menu: menu.map((x, xi) => (xi === i ? { ...x, label: ev.target.value } : x)) }))}
                      />
                      {item.type === "link" && (
                        <button type="button" className={e.removeBtn} aria-label="Remover" onClick={() => patch((c) => ({ ...c, menu: menu.filter((_, xi) => xi !== i) }))}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    {item.type === "link" && (
                      <input
                        className={e.input}
                        style={{ marginTop: 8 }}
                        placeholder="https://…"
                        value={item.url || ""}
                        onChange={(ev) => patch((c) => ({ ...c, menu: menu.map((x, xi) => (xi === i ? { ...x, url: ev.target.value } : x)) }))}
                      />
                    )}
                    {iconPickerFor === item.id && (
                      <div className={e.iconGrid}>
                        {Object.entries(MEMBER_ICONS).map(([key, Ic]) => (
                          <button
                            key={key}
                            type="button"
                            className={`${e.iconBtn} ${item.icon === key ? e.iconBtnActive : ""}`}
                            style={{ width: "100%", height: 32 }}
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
                className={e.addBtn}
                onClick={() => patch((c) => ({ ...c, menu: [...menu, { id: uid(), type: "link", icon: "link", label: "Novo link", url: "" }] }))}
              >
                Adicionar
              </button>
            </>
          )}

          {tab === "login" && (
            <>
              <h3 className={e.h3}>Login</h3>
              <div className={e.group}>
                <label className={e.label}>Layout</label>
                <div className={e.optionRow}>
                  <button
                    type="button"
                    className={`${e.optionBox} ${cfg.branding.loginLayout === "sidebar" ? e.optionBoxActive : ""}`}
                    onClick={() => patch((c) => ({ ...c, branding: { ...c.branding, loginLayout: "sidebar" } }))}
                  >
                    ▯ Barra lateral
                  </button>
                  <button
                    type="button"
                    className={`${e.optionBox} ${cfg.branding.loginLayout === "fullscreen" ? e.optionBoxActive : ""}`}
                    onClick={() => patch((c) => ({ ...c, branding: { ...c.branding, loginLayout: "fullscreen" } }))}
                  >
                    ▭ Toda a tela
                  </button>
                </div>
              </div>
              <ImgField
                label="Imagem de fundo"
                hint="Tamanho recomendado: 1920×1080 pixels"
                value={cfg.branding.loginBgUrl}
                onChange={(url) => patch((c) => ({ ...c, branding: { ...c.branding, loginBgUrl: url } }))}
              />
              <ImgField
                label="Logo"
                hint="Tamanho recomendado: 720×128 pixels"
                value={cfg.branding.logoUrl}
                onChange={(url) => patch((c) => ({ ...c, branding: { ...c.branding, logoUrl: url } }))}
              />
            </>
          )}

          {tab === "config" && (
            <>
              <h3 className={e.h3}>Configurações gerais</h3>
              <div className={e.group}>
                <label className={e.label}>Nome da área de membros</label>
                <input
                  className={e.input}
                  value={name}
                  onChange={(ev) => {
                    setName(ev.target.value);
                    setDirty(true);
                  }}
                />
                <span className={e.subtle}>members.czero.sbs/{slug}</span>
              </div>
              <div className={e.group}>
                <label className={e.label}>Tema</label>
                <div className={e.optionRow}>
                  <button
                    type="button"
                    className={`${e.optionBox} ${cfg.theme.mode === "light" ? e.optionBoxActive : ""}`}
                    onClick={() => patch((c) => ({ ...c, theme: { ...c.theme, mode: "light" } }))}
                  >
                    ☀️ Claro
                  </button>
                  <button
                    type="button"
                    className={`${e.optionBox} ${cfg.theme.mode === "dark" ? e.optionBoxActive : ""}`}
                    onClick={() => patch((c) => ({ ...c, theme: { ...c.theme, mode: "dark" } }))}
                  >
                    🌙 Escuro
                  </button>
                </div>
              </div>
              <div className={e.group}>
                <label className={e.label}>Cor primária</label>
                <div className={e.colorRow}>
                  <input
                    type="color"
                    className={e.colorSwatch}
                    value={cfg.theme.primaryColor}
                    onChange={(ev) => patch((c) => ({ ...c, theme: { ...c.theme, primaryColor: ev.target.value } }))}
                  />
                  <code className={e.code}>{cfg.theme.primaryColor}</code>
                </div>
              </div>
              <ImgField
                label="Logotipo"
                hint="Tamanho recomendado: 720×128 pixels"
                value={cfg.branding.logoUrl}
                onChange={(url) => patch((c) => ({ ...c, branding: { ...c.branding, logoUrl: url } }))}
              />
              <ImgField
                label="Favicon"
                hint="Tamanho recomendado: 64×64 pixels"
                value={cfg.branding.faviconUrl}
                onChange={(url) => patch((c) => ({ ...c, branding: { ...c.branding, faviconUrl: url } }))}
              />
              <ImgField
                label="Imagem para compartilhamento"
                hint="Tamanho recomendado: 1200×630 pixels"
                value={cfg.branding.ogImageUrl}
                onChange={(url) => patch((c) => ({ ...c, branding: { ...c.branding, ogImageUrl: url } }))}
              />
              <ImgField
                label="Imagem de capa"
                hint="Tamanho recomendado: 640×360 pixels"
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
