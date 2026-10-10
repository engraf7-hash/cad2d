# CAD 2D Offline

CAD 2D civil estilo AutoCAD em HTML/JS puro (Canvas), sem dependências e 100% offline (PWA).

## Executar localmente
    python -m http.server 8080
Abra http://localhost:8080 (service worker e instalação exigem `localhost` ou HTTPS).

## Estrutura
- `index.html`, `styles.css`: interface (os `<script>` ficam entre `P15:SCRIPTS:BEGIN/END`, gerados pelo build)
- `js/pN-*.js`: partes do app (P1 a P15; P4 = layers/propriedades)
- `service-worker.js`, `manifest.json`, `icons/`: PWA offline
- `tools/build-release.js`: ordena scripts, atualiza versão e lista de cache, valida
- `api/pN.txt`: API exportada de cada parte (referência para novas sessões)

## Nova versão
    node tools/build-release.js 1.0.1
    git add -A && git commit -m "v1.0.1" && git push
O GitHub Pages publica sozinho (`.github/workflows/pages.yml`).

## Verificar no navegador
Digite `VERIFICAR` (integração) ou, com desenho vazio, `TESTEFUMACA`.

## Formatos
`.cad` (JSON), DXF R2000, SVG, PDF. DWG: converta o DXF com o ODA File Converter.
