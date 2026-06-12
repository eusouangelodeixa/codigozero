# Fotos da seção "Quem está falando com você"

Os 3 arquivos `.jpg` nesta pasta são **placeholders** (cópia do `logo-mark.png`) e
precisam ser substituídos pelas imagens reais. Mantenha **exatamente os mesmos
nomes** — o código em `frontend/app/page.tsx` (`FOUNDER_GALLERY`) referencia estes
caminhos.

Ordem na galeria (retrato grande à esquerda; Instagram e Pix empilhados à direita):

| Arquivo          | O que deve mostrar                                              | Proporção ideal      |
|------------------|----------------------------------------------------------------|----------------------|
| `angelo.jpg`     | Retrato do Ângelo Deixa (a foto pessoal enviada).              | retrato / quadrado   |
| `instagram.jpg`  | Print do perfil @eusouangelodeixa — **2.625 seguidores**.      | paisagem (largo)     |
| `pix-3330.jpg`   | Print do **Pix recebido de R$ 3.330** (primeira parcela Mira). | paisagem largo/baixo |

## Como substituir
Sobrescreva cada arquivo mantendo o nome. Ex.:

```bash
cp ~/Downloads/minha-foto.jpg   frontend/public/founders/angelo.jpg
cp ~/Downloads/print-insta.jpg  frontend/public/founders/instagram.jpg
cp ~/Downloads/print-pix.jpg    frontend/public/founders/pix-3330.jpg
```

As legendas ("2.625 seguidores no Instagram" e "Primeira parcela — R$ 3.330") já são
renderizadas por cima das imagens pelo código — não precisam estar no print. A galeria
usa `next/image`; a proporção real não precisa bater exatamente (o `object-fit: cover`
recorta pro tile), mas proporções parecidas ficam melhores.
