#!/bin/sh
# Preview only: copy the built extension and wrap its side panel in a page with stubbed extension APIs.
set -e
cd "$(dirname "$0")/.."
rm -rf .preview/site && cp -R .output/chrome-mv3 .preview/site && cp .preview/stub.js .preview/site/preview-stub.js
css=$(cd .preview/site && ls assets/sidepanel-*.css); js=$(cd .preview/site && ls chunks/sidepanel-*.js)
python3 - "$css" "$js" <<'PY'
import sys
css, js = sys.argv[1], sys.argv[2]
fx = open('.preview/fixtures.json').read()
open('.preview/site/preview.html', 'w').write(f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mix to Cart preview</title>
<link rel="stylesheet" href="/{css}">
<style>
html.preview-light{{color-scheme:light;--paper:#f2f0ea;--ink:#111111;--toner-1:#3a3a37;--toner-2:#66655f;--toner-3:#c9c6bd;--miss:#c41f17;--focus:#111111}}
html.preview-dark{{--paper:#121211;--ink:#f1efe8;--toner-1:#d3d0c7;--toner-2:#a29f96;--toner-3:#3b3a36;--miss:#ff6a5e;--focus:#ff3d8b}}
body{{display:flex;gap:24px;background:#777}} #root{{width:var(--w,400px);height:100vh;background:var(--paper);flex:none}}
</style>
<script type="application/json" id="fixtures">{fx}</script>
<script src="/preview-stub.js"></script></head><body><div id="root"></div>
<script type="module" src="/{js}"></script></body></html>''')
PY
