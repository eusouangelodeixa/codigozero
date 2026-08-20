# Hospedagem de vídeos das aulas — Cloudflare R2

Vídeos das aulas da área de membros ficam num **bucket R2 PRIVADO**. Nada é
servido direto do R2: o backend assina URLs temporárias (5 min) para o player e
URLs de multipart para o upload direto do navegador. Segredos nunca vão ao
browser; no banco guardamos apenas a **KEY** do objeto — nunca URL pública.

> **Estado atual:** o código está pronto e é **não-quebrável**. Enquanto as
> variáveis `R2_*` não estiverem definidas, as features de vídeo R2 ficam
> inativas e o vídeo legado por embed (iframe) continua funcionando. Assim que
> as variáveis existirem, o botão **"Vídeo da Aula"** no admin passa a subir
> para o R2.

---

## 1. Criar o bucket (privado)

1. Cloudflare Dashboard → **R2** → **Create bucket**.
   - Nome sugerido: `czero-videos`.
   - Região: **Automatic**.
2. **NÃO** habilite acesso público. Sem domínio público, sem `r2.dev` público.
   O bucket permanece privado — é isso que queremos.

## 2. Criar o API Token (S3)

1. R2 → **Manage R2 API Tokens** → **Create API token**.
2. Permissão: **Object Read & Write**.
3. Escopo: **Apply to specific buckets only** → selecione `czero-videos`.
4. Crie e copie:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
   - **Endpoint S3** (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`) → `R2_ENDPOINT`
     - Use o endpoint **sem** o nome do bucket no fim (o bucket vai por env à parte).

## 3. Configurar o CORS do bucket

O upload é **direto do navegador → R2** (multipart presigned). O bucket precisa
aceitar `PUT` das origens do app e **expor o header `ETag`** (o front lê o ETag
de cada parte para finalizar o upload). Sem isso o upload falha na 1ª parte.

R2 → bucket `czero-videos` → **Settings** → **CORS Policy** → cole:

```json
[
  {
    "AllowedOrigins": [
      "https://members.czero.sbs",
      "https://app.czero.sbs",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

> O `GET` de reprodução usa **URL assinada** (query string), que dispensa CORS
> na maioria dos players; mas deixamos `GET` liberado para o preview do admin e
> para o HLS.

## 4. Variáveis de ambiente

Defina no `.env` de produção (ou no ambiente do container). Já estão no
allowlist do `infrastructure/docker-compose.prod.yml` (bloco `backend →
environment`), então basta preencher e **reiniciar o backend**.

```bash
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_BUCKET=czero-videos
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_REGION=auto
```

Depois:

```bash
# na VPS, após colocar as variáveis no .env de produção
docker compose -f infrastructure/docker-compose.prod.yml up -d --build backend
# valide o boot:
docker logs czero_backend_prod --tail 30   # deve subir sem erro na porta 4000
```

## 5. Como o admin usa

Admin → **Cursos** → abrir um curso → aba de aulas → editar aula → aba **Básico**
→ **Vídeo da Aula**:

- Arraste o arquivo ou clique em **Selecionar vídeo**.
- Formatos: **MP4, MOV, MKV, WEBM, M3U8 (HLS)**. Limite: **20 GB** por arquivo.
- Mostra progresso, velocidade, tempo restante; dá para **cancelar**, **trocar**
  e **remover**. Duração e miniatura são capturadas automaticamente no navegador.
- O vídeo é gravado na aula na hora (não depende do botão *Salvar aula*).

O embed externo (Kilax/YouTube/Vimeo) continua disponível em **"Usar embed
externo — avançado"**. Quando a aula tem vídeo no R2, **o R2 tem prioridade**.

## 6. Como o aluno recebe (segurança)

`GET /api/members/video/:lessonId` verifica, nesta ordem: aula existe → curso
publicado → o aluno tem acesso (assinatura ativa **ou** direito ao curso) e o
módulo está liberado. **Só então** assina uma URL de **5 minutos**. O player
renova a URL sozinho antes de expirar, sem recarregar a página nem perder o
ponto. Nunca é entregue URL permanente nem a KEY do arquivo.

## 7. Organização dos arquivos no bucket

```
cursos/{courseId}/aulas/{lessonId}/video.mp4      # MP4 (fluxo principal)
cursos/{courseId}/aulas/{lessonId}/hls/master.m3u8 # HLS (arquitetado)
```

## 8. HLS (opcional / arquitetural)

O MP4 é o fluxo **principal e testado**. Para HLS privado, os segmentos `.ts`
são servidos por um **proxy autenticado** (`GET /api/members/video/:id/hls/*`)
que re-verifica o acesso a cada segmento — nada de `.ts` público. O player usa
`hls.js` (Chrome/Firefox/Android) mandando o Bearer em cada requisição. Para
publicar HLS, suba `master.m3u8` + variantes + segmentos sob o prefixo `hls/` da
aula e marque `videoType = 'hls'` (o upload de `.m3u8` já faz isso). Não há
pipeline de transcodificação embutido — gere o HLS externamente (ffmpeg) antes
de subir.

## 9. Custos

R2 cobra **armazenamento** e **operações**, mas **não cobra egress** (saída de
dados) — o que é ideal para vídeo. Uploads usam multipart; lembre de manter o
CORS com `ExposeHeaders: ETag`, senão o upload não finaliza.

## 10. Troubleshooting

| Sintoma | Causa provável | Correção |
|---|---|---|
| Upload trava na 1ª parte com erro de ETag | CORS sem `ExposeHeaders: ETag` | Ajuste o CORS (passo 3) |
| Admin mostra 503 "R2 não configurado" | Falta alguma `R2_*` | Preencha as 4 obrigatórias e reinicie |
| Player: "Vídeo indisponível" | Sem acesso (403) ou aula sem vídeo | Verifique assinatura/direito do aluno |
| Vídeo para depois de ~5 min | Renovação bloqueada (token expirado) | O front renova sozinho; se persistir, veja o token do aluno |
