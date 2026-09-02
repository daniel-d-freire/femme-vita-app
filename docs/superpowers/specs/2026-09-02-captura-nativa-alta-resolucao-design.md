# Captura nativa em alta resolução — Femme Vita Arquivo

Data: 2026-09-02
Status: aprovado pelo usuário (Daniel) em conversa

## Problema

As guias de internação salvas na pasta Apolo estão ilegíveis nos campos pequenos.
Medição em 2026-09-02 nas 12 guias mais recentes: imagem embutida no PDF entre
800×1004 e 829×1172 px, ou seja ~86–100 DPI numa A4. Guias de maio/2026 (antes do
"Scanner v2") tinham 1665–2014 px de largura.

Causa raiz, em ordem de impacto:

1. `captureFrame` (`src/lib/camera.ts`) captura um **frame do stream de vídeo**
   (`getUserMedia`, ideal 1920×1080). Frames de vídeo têm compressão forte e
   resolução muito abaixo do sensor; em muitos aparelhos o stream cai para 720p.
2. `MAX_DIMENSION = 1600` reduz o quadro inteiro antes do recorte. Como a folha
   ocupa só parte do enquadramento, sobra <800 px de largura para a página.
3. `rectifyAndFilter` (`src/lib/scanner.ts`) tem piso de 800 px de largura/altura;
   a maioria das guias sai com exatamente 800, ou seja, foi **esticada**.
4. Recompressão JPEG em cadeia (0.85 → 0.92 → 0.92 na rotação).

Os filtros (Cinza/CLAHE, P&B/Otsu) não são o problema.

## Decisão

Trocar a captura por **foto da câmera nativa do iPhone** via
`<input type="file" accept="image/*" capture="environment">`, processar em até
**2600 px** no lado maior (≈220 DPI em A4) e enviar ao Claude uma cópia de
1600 px (o que a API usa de qualquer forma). Servidor não muda.

Aparelho alvo: iPhone (Safari iOS). Deve continuar funcionando em Android/Chrome.

## Desenho

### 1. Tela de captura (`CameraScreen.tsx`)

- Sai o `<video>` e todo o uso de `getUserMedia`/`startCamera`/`stopCamera`.
- Mantém: cabeçalho (Logo, menu da conta, contador de pacientes), miniatura da
  última página com contador (abre revisão), botão "Finalizar →".
- Centro: moldura A4 ilustrada (mesmos cantos do visor atual) com título em
  serifa itálica e 3 dicas em mono: luz uniforme, folha inteira no quadro,
  sem sombra da mão.
- Botão âmbar de disparo aciona um `<input type="file" accept="image/*"
  capture="environment">` oculto. No iPhone isso abre a câmera direto.
- Botão secundário "Da galeria" aciona um segundo `<input type="file"
  accept="image/*">` sem `capture` (guias recebidas por WhatsApp).
- Após escolher o arquivo, o input é resetado (`value = ''`) para permitir
  fotografar o mesmo arquivo de novo.
- Estados: `idle` | `loading` (decodificando a foto, spinner sobre a moldura)
  | `error` (mensagem + voltar). Não há mais estado `denied`.
- Estética: mesma linguagem do app (navy-deep, bone, amber; Instrument Serif +
  Geist Mono). Nenhum novo token de cor.

### 2. Decodificação da foto (`src/lib/camera.ts`)

Substituir `startCamera`/`stopCamera`/`captureFrame` por:

```ts
export const MAX_PAGE_DIMENSION = 2600; // lado maior, ≈220 DPI em A4
export async function loadPhotoFile(file: File): Promise<CapturedPage>
```

- Carrega o arquivo via `URL.createObjectURL` + `<img>` (Safari aplica a
  orientação EXIF ao desenhar `<img>` no canvas desde iOS 13.4; Chrome desde 81).
  Não usar `createImageBitmap` (suporte a `imageOrientation` inconsistente no
  Safari).
- Desenha no canvas já no tamanho final: escala = `min(1, 2600 / max(w, h))`,
  `imageSmoothingQuality = 'high'`.
- Codifica JPEG 0.92 (uma única passagem antes do scanner). `CapturedPage`
  mantém o mesmo shape (`id, dataUrl, width, height, bytes, capturedAt`).
- Rejeita arquivos que não sejam imagem com mensagem clara. HEIC não chega:
  Safari converte para JPEG em inputs `image/*`.
- `revokeObjectURL` no `finally`.

### 3. Scanner (`src/lib/scanner.ts`)

- `detectPaperCorners(dataUrl)`: roda a detecção numa cópia reduzida para
  **1000 px** no lado maior (canvas 2D antes do `cv.imread`) e multiplica os
  cantos pelo fator inverso. Resultado continua em coordenadas da imagem
  original.
- `rectifyAndFilter`:
  - Remove o piso de 800 px. `outW`/`outH` = média das larguras/alturas medidas
    pelos cantos.
  - Aplica teto: se `max(outW, outH) > 2600`, escala ambos proporcionalmente.
  - Interpolação `cv.INTER_CUBIC` no warp (fonte agora tem resolução para isso).
  - Filtros inalterados (CLAHE 2.5/16×16; Otsu com blur 3×3 para P&B).
  - Saída: PNG para P&B; JPEG **0.88** para cinza e cor.
- `rotateImageCW`: JPEG 0.90 (era 0.92; ajuste cosmético, uma passagem só).

### 4. Dois níveis de envio (`src/lib/api.ts`, `App.tsx`)

- Nova função `downscaleDataUrl(dataUrl, maxDim = 1600): Promise<string>` em
  `camera.ts` (canvas 2D, JPEG 0.85). PNG de P&B também vira JPEG 0.85 na cópia
  de análise (o Claude não precisa de PNG).
- `analyzePages(pages)` passa a enviar `await Promise.all(pages.map(p =>
  downscaleDataUrl(p.dataUrl)))`.
- `uploadDocument` continua enviando `p.dataUrl` (versão grande), após a
  rotação.

### 5. Guarda de tamanho antes do upload (`App.tsx`, `performSave`)

- Limite alvo: **4,2 MB** de base64 somado (Vercel rejeita corpo > 4,5 MB).
- Se `sum(dataUrl.length)` > 4,2 MB: reencoda todas as páginas com
  `downscaleDataUrl(p.dataUrl, 2200)`; se ainda passar, `1900`; se ainda
  passar, envia mesmo assim e deixa o erro do servidor aparecer na tela de
  erro existente.
- Log em console com o total antes/depois (mesmo padrão do log de rotação).

### 6. Remoções

- `startCamera`, `stopCamera`, `captureFrame`, `CameraStreamHandle` e o
  `MAX_DIMENSION = 1600` saem de `camera.ts`.
- Estado `denied` e textos de permissão de câmera saem de `CameraScreen`.

## Fora de escopo

- App Femme Vita Documentos (mesmo código de captura; segunda rodada).
- Upload direto do celular para o Drive (documentos > 3 páginas).
- Mudanças no servidor (`/api/analyze`, `/api/upload`, `pdf.ts`).

## Verificação

1. `npm run build` e `npm run lint` limpos.
2. No navegador desktop (input sem `capture` abre seletor de arquivos): usar
   como "foto" uma guia antiga de alta resolução extraída de PDF
   (ex. 2014×2875). Confirmar no console que a página processada sai com lado
   maior ≈ 2600 px (ou o tamanho medido pelos cantos, se menor).
3. Fluxo completo até o PDF; extrair a imagem embutida com PyMuPDF e confirmar
   largura > 1800 px e DPI equivalente ≥ 180.
4. Guarda de tamanho: simular 4 páginas grandes e confirmar no console que o
   reencode para 2200/1900 acontece e o total fica < 4,2 MB.
5. Teste real no iPhone (Daniel/Dra. Priscila) antes do deploy em produção:
   câmera abre direto, retrato sai retrato, guia legível no Drive.

## Riscos

- Memória do OpenCV.js no Safari com Mats de 2600×1950 RGBA (~20 MB cada,
  3–4 simultâneos): dentro do heap padrão; detecção em cópia de 1000 px reduz
  o pico. Se houver crash em iPhone antigo, baixar `MAX_PAGE_DIMENSION` para 2200.
- Guias com 4+ páginas em cor podem estourar 4,2 MB mesmo a 1900 px; o erro
  já é tratado na tela de erro existente.
