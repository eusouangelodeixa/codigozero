// Mini-markdown seguro (autorado pelo admin) → HTML. EXTRAÍDO de
// components/content/BlockView.tsx para ser compartilhado com a área de
// membros (conteúdo das aulas — que antes era renderizado como texto puro).
// Escapa HTML primeiro; suporta **negrito**, *itálico*, [link](https://…) e
// listas com "- ".
export function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function mdInline(s: string) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function mdToHtml(src: string) {
  const lines = (src || "").split(/\r?\n/);
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(`<ul>${list.map((li) => `<li>${mdInline(li)}</li>`).join("")}</ul>`);
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      continue;
    }
    flush();
    if (line) out.push(`<p>${mdInline(line)}</p>`);
  }
  flush();
  return out.join("");
}
