"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import {
  PageHeader,
  Modal,
  Button,
  EmptyState,
  useToast,
} from "@/components/ui";
import { CofreIcon } from "@/components/Icons";
import styles from "./cofre.module.css";

interface Script {
  id: string;
  title: string;
  content: string;
  icon?: string;
}
interface Folder {
  id: string;
  name: string;
  icon?: string;
  scripts?: Script[];
}

const ChevronRight = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ChevronLeft = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const CopyIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

export default function CofrePage() {
  const toast = useToast();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .getScripts()
      .then((data) => setFolders(data.folders || []))
      .catch((e) => console.error("Failed:", e))
      .finally(() => setLoading(false));
  }, []);

  const copyContent = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Script copiado", "Cole no WhatsApp para enviar.");
    } catch {
      const el = document.createElement("textarea");
      el.value = content;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      toast.success("Script copiado");
    }
  };

  const isInFolder = !!selectedFolder;
  const headerLabel = isInFolder ? "Arsenal · Cofre" : "Arsenal · Cofre";
  const headerTitle = isInFolder ? selectedFolder!.name : "Scripts prontos para vender";
  const headerDesc = isInFolder
    ? "Selecione um script abaixo para abrir, personalizar e copiar."
    : "Sua biblioteca de mensagens testadas. Copie, adapte ao lead e feche o contrato.";

  return (
    <div className={styles.page}>
      {isInFolder && (
        <button className={styles.crumb} onClick={() => setSelectedFolder(null)} type="button">
          <ChevronLeft /> Voltar às pastas
        </button>
      )}

      <PageHeader label={headerLabel} title={headerTitle} description={headerDesc} />

      {loading ? (
        <div className={styles.loadingGrid}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      ) : !isInFolder ? (
        folders.length === 0 ? (
          <EmptyState
            icon={<CofreIcon size={26} />}
            title="Cofre vazio"
            description="Nenhuma pasta de scripts cadastrada. Avise o admin para liberar a biblioteca."
          />
        ) : (
          <div className={styles.grid}>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={styles.folderCard}
                onClick={() => setSelectedFolder(folder)}
              >
                <div className={styles.folderHead}>
                  <span className={styles.folderEmoji}>{folder.icon || "📁"}</span>
                  <span className={styles.folderName}>{folder.name}</span>
                </div>
                <span className={styles.folderCount}>
                  {folder.scripts?.length || 0} {folder.scripts?.length === 1 ? "script" : "scripts"}
                </span>
                <span className={styles.folderArrow}>
                  <ChevronRight />
                </span>
              </button>
            ))}
          </div>
        )
      ) : !selectedFolder?.scripts || selectedFolder.scripts.length === 0 ? (
        <EmptyState
          icon={<CofreIcon size={26} />}
          title="Pasta vazia"
          description="Esta pasta ainda não tem scripts. Volte e escolha outra, ou aguarde novos serem adicionados."
          actions={
            <Button variant="secondary" onClick={() => setSelectedFolder(null)}>
              Voltar
            </Button>
          }
        />
      ) : (
        <div className={styles.grid}>
          {selectedFolder.scripts.map((script) => (
            <button
              key={script.id}
              type="button"
              className={styles.scriptCard}
              onClick={() => setSelectedScript(script)}
            >
              {script.icon && <span className={styles.scriptIcon}>{script.icon}</span>}
              <span className={styles.scriptTitle}>{script.title}</span>
              <span className={styles.scriptPreview}>{script.content.slice(0, 140)}…</span>
              <span className={styles.scriptCta}>
                Abrir <ChevronRight size={12} />
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={!!selectedScript}
        onClose={() => setSelectedScript(null)}
        title={selectedScript?.title || ""}
        description={selectedFolder ? `Pasta: ${selectedFolder.name}` : undefined}
        size="md"
        footer={
          selectedScript ? (
            <Button
              variant="primary"
              onClick={() => copyContent(selectedScript.content)}
              iconStart={<CopyIcon />}
            >
              Copiar tudo
            </Button>
          ) : null
        }
      >
        {selectedScript && <pre className={styles.scriptContent}>{selectedScript.content}</pre>}
      </Modal>
    </div>
  );
}
