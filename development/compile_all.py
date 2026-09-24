#!/usr/bin/env python3
"""
compile_all.py  (v3 — fixes)
Fixes:
  1. reada-bg.jpg referenced as url('../reada-bg.jpg') in inlined CSS — replace with data URI
  2. home bg image (5c0a6e2d37d95a291dd40986ddbf6aee.jpg) is missing — use reada-bg.jpg as fallback
  3. reada-map-embed.html iframe src — inline as blob srcdoc substitution
  4. Local JS with ?v=... query strings not matched — fix regex to strip query strings
  5. localStorage blocked in blob URLs — patch it with a memory polyfill injected into each page
"""

import base64
import mimetypes
import os
import re
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(BASE_DIR, "compiled.html")

CDN_CACHE = {}

# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch_cdn(url):
    if url in CDN_CACHE:
        return CDN_CACHE[url]
    print(f"    [CDN] {url}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=45) as r:
            content = r.read().decode("utf-8", errors="replace")
        CDN_CACHE[url] = content
        return content
    except Exception as e:
        print(f"    WARNING: {url} → {e}")
        return None

def image_to_data_uri(filepath):
    mime, _ = mimetypes.guess_type(filepath)
    if not mime:
        ext = os.path.splitext(filepath)[1].lower()
        mime = {".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",
                ".gif":"image/gif",".svg":"image/svg+xml"}.get(ext,"application/octet-stream")
    with open(filepath,"rb") as f:
        data = base64.b64encode(f.read()).decode("ascii")
    return f"data:{mime};base64,{data}"

def read_text(path):
    with open(path,"r",encoding="utf-8",errors="replace") as f:
        return f.read()

# ── Build image map (encode all images once) ──────────────────────────────────

LOCAL_IMAGES = [
    "MPOB-3-all-black-fonts.png","MPOB-3.png","MPOB-3_transparent.png",
    "home-logo-final.png","comp-logo-final.png","std-logo-final.png",
    "reada-logo-final.png","report_photo_new.png","palm_block_satellite.png",
    "full_map_nutrient_detection.png","block22_permanent_photo.png",
    "reada-bg.jpg",
    "WhatsApp Image 2026-08-11 at 08.43.18.jpeg",
]

print("Encoding images...")
IMAGE_MAP = {}
for img in LOCAL_IMAGES:
    full = os.path.join(BASE_DIR, img)
    if os.path.isfile(full):
        IMAGE_MAP[img] = image_to_data_uri(full)
        print(f"  ✓ {img} ({os.path.getsize(full)//1024} KB)")

# The home page references a missing bg image — use reada-bg.jpg as fallback
MISSING_HOME_BG = "5c0a6e2d37d95a291dd40986ddbf6aee.jpg"
if MISSING_HOME_BG not in IMAGE_MAP and "reada-bg.jpg" in IMAGE_MAP:
    IMAGE_MAP[MISSING_HOME_BG] = IMAGE_MAP["reada-bg.jpg"]
    print(f"  ↳ {MISSING_HOME_BG} (fallback → reada-bg.jpg)")

# localStorage polyfill — blob URLs have null origin so localStorage is blocked.
# This in-memory polyfill drops in silently so existing code works unchanged.
LOCALSTORAGE_POLYFILL = """
<script>
// localStorage polyfill for blob:// origins
(function() {
    try { localStorage.setItem('__test__', '1'); localStorage.removeItem('__test__'); }
    catch(e) {
        var _store = {};
        var _ls = {
            getItem: function(k) { return Object.prototype.hasOwnProperty.call(_store,k) ? _store[k] : null; },
            setItem: function(k,v) { _store[k] = String(v); },
            removeItem: function(k) { delete _store[k]; },
            clear: function() { _store = {}; },
            key: function(i) { return Object.keys(_store)[i] || null; },
            get length() { return Object.keys(_store).length; }
        };
        try { Object.defineProperty(window, 'localStorage', { value: _ls, writable: false }); }
        catch(e2) { window.localStorage = _ls; }
    }
})();
</script>
"""

# ── reada-map-embed.html — inline it as a srcdoc blob replacement ─────────────

def make_reada_map_embed_b64():
    path = os.path.join(BASE_DIR, "reada-map-embed.html")
    if not os.path.isfile(path):
        return None
    html = read_text(path)
    # Inline its CDN deps
    def repl_cdn_css(m):
        c = fetch_cdn(m.group(1))
        return f"<style>\n{c}\n</style>" if c else m.group(0)
    html = re.sub(r'<link[^>]+href="(https?://[^"]+\.css)"[^>]*/?>',repl_cdn_css,html)
    def repl_cdn_js(m):
        c = fetch_cdn(m.group(1))
        return f"<script>\n{c}\n</script>" if c else m.group(0)
    html = re.sub(r'<script\s+src="(https?://[^"]+)"[^>]*>\s*</script>',repl_cdn_js,html)
    # Encode
    b64 = base64.b64encode(html.encode("utf-8")).decode("ascii")
    print(f"  ✓ reada-map-embed.html → {len(b64)//1024} KB b64")
    return b64

# ── Per-page standalone builder ───────────────────────────────────────────────

def inline_css_url_images(css_text):
    """Replace url('../reada-bg.jpg') and similar relative paths in CSS with data URIs."""
    def repl_url(m):
        raw = m.group(1).strip("'\"")
        # Resolve relative path (CSS is in css/ subdir, images in BASE_DIR)
        # Handle both '../filename' and 'filename'
        basename = os.path.basename(raw.split("?")[0])
        if basename in IMAGE_MAP:
            return f"url('{IMAGE_MAP[basename]}')"
        # Try direct lookup
        if raw in IMAGE_MAP:
            return f"url('{IMAGE_MAP[raw]}')"
        return m.group(0)
    return re.sub(r"url\((['\"]?[^)'\"\s]+['\"]?)\)", repl_url, css_text)

def make_standalone(filename, reada_map_b64=None):
    """Turn a page HTML into fully self-contained HTML."""
    path = os.path.join(BASE_DIR, filename)
    if not os.path.isfile(path):
        return None
    html = read_text(path)

    # ── 1. Inline local CSS (and patch url() references within it) ────────────
    def repl_local_css(m):
        href = m.group(1)
        if href.startswith("http") or href.startswith("//"):
            return m.group(0)
        full = os.path.join(BASE_DIR, href.replace("/", os.sep))
        if os.path.isfile(full):
            css = read_text(full)
            css = inline_css_url_images(css)  # fix url('../reada-bg.jpg') etc.
            return f"<style>\n{css}\n</style>"
        return m.group(0)
    html = re.sub(r'<link[^>]+href="([^"]+\.css)"[^>]*/?>',repl_local_css,html)

    # ── 2. Inline CDN CSS ─────────────────────────────────────────────────────
    def repl_cdn_css(m):
        href = m.group(1)
        c = fetch_cdn(href)
        return f"<style>\n/* {href} */\n{c}\n</style>" if c else m.group(0)
    html = re.sub(r'<link[^>]+href="(https?://[^"]+\.css)"[^>]*/?>',repl_cdn_css,html)

    # ── 3. Inline CDN JS ──────────────────────────────────────────────────────
    def repl_cdn_js(m):
        src = m.group(1)
        c = fetch_cdn(src)
        return f"<script>\n/* {src} */\n{c}\n</script>" if c else m.group(0)
    html = re.sub(r'<script\s+src="(https?://[^"]+)"[^>]*>\s*</script>',repl_cdn_js,html)

    # ── 4. Inline local JS (handle ?v=... query strings) ─────────────────────
    def repl_local_js(m):
        src_raw = m.group(1)  # may be "js/auth.js?v=20260903_v3"
        src_path = src_raw.split("?")[0]  # strip query string
        full = os.path.join(BASE_DIR, src_path.replace("/", os.sep))
        if os.path.isfile(full):
            return f"<script>\n{read_text(full)}\n</script>"
        return m.group(0)
    # Match any local (non-http) script src — handles js/ prefix and bare names
    html = re.sub(r'<script\s+src="((?!https?://)[^"]+)"[^>]*>\s*</script>',repl_local_js,html)

    # ── 5. Inline images (src="..." and CSS url() in inline styles) ───────────
    for img, data_uri in IMAGE_MAP.items():
        html = html.replace(f'src="{img}"', f'src="{data_uri}"')
        html = html.replace(f"src='{img}'", f"src='{data_uri}'")
        # Also replace inline style background-image: url('filename')
        html = html.replace(f"url('{img}')", f"url('{data_uri}')")
        html = html.replace(f'url("{img}")', f'url("{data_uri}")')

    # ── 6. Replace reada-map-embed.html iframe src with inline blob ───────────
    if reada_map_b64:
        # Replace the iframe src with a JS-generated blob URL via onload script
        inject = f"""<script>
(function() {{
    var frame = document.getElementById('reada-map-iframe');
    if (!frame) return;
    var b64 = '{reada_map_b64}';
    var bin = atob(b64);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    var blob = new Blob([buf], {{type: 'text/html'}});
    frame.src = URL.createObjectURL(blob);
}})();
</script>"""
        # Remove the existing iframe src (replace with empty src, inject script)
        html = re.sub(
            r'(<iframe[^>]+id="reada-map-iframe"[^>]*)src="[^"]*"([^>]*>)',
            r'\1\2',
            html
        )
        # Inject the script right before </body>
        html = html.replace("</body>", inject + "\n</body>")

    # ── 7. Fix cross-page navigation → postMessage to parent ─────────────────
    NAV_MAP = {
        "index.html":         "home",
        "comprehensive.html": "comprehensive",
        "standard.html":      "standard",
        "PalmnexReaDS.html":  "reada",
    }
    for page_file, page_id in NAV_MAP.items():
        msg = f"window.parent.postMessage({{nav:'{page_id}'}},'*')"
        html = html.replace(f'href="{page_file}"',
                            f'href="#" onclick="{msg}; return false;"')
        html = html.replace(f"location.href='{page_file}'", msg)
        html = html.replace(f'location.href="{page_file}"', msg)
        html = html.replace(f"handleProtectedCardClick('{page_file}')",
                            f"(function(){{ {msg} }})()")

    # ── 8. Inject localStorage polyfill right after <head> ────────────────────
    html = html.replace("<head>", "<head>\n" + LOCALSTORAGE_POLYFILL, 1)
    if "<head>" not in html:
        html = LOCALSTORAGE_POLYFILL + html

    return html


# ── Main build ────────────────────────────────────────────────────────────────

PAGES = [
    ("home",          "index.html",        "Home",               "home-logo-final.png"),
    ("comprehensive", "comprehensive.html", "Comprehensive Fert", "comp-logo-final.png"),
    ("standard",      "standard.html",      "Standard Fert",      "std-logo-final.png"),
    ("reada",         "PalmnexReaDS.html",  "PalmNexReaDS",       "reada-logo-final.png"),
]

print("\nPre-processing reada-map-embed.html...")
reada_map_b64 = make_reada_map_embed_b64()

print("\nBuilding standalone pages...")
page_html_b64 = {}
for page_id, filename, label, _ in PAGES:
    print(f"\n  [{page_id}] {filename}")
    standalone = make_standalone(
        filename,
        reada_map_b64=(reada_map_b64 if page_id == "reada" else None)
    )
    if standalone:
        b64 = base64.b64encode(standalone.encode("utf-8")).decode("ascii")
        page_html_b64[page_id] = b64
        print(f"  ✓ {len(b64)//1024} KB b64")
    else:
        page_html_b64[page_id] = ""
        print(f"  ✗ not found")

# ── Build shell ───────────────────────────────────────────────────────────────

nav_icons = {pid: IMAGE_MAP.get(icon,"") for pid,_,_,icon in PAGES}

js_page_data = "const PAGE_DATA = {\n"
for page_id in page_html_b64:
    js_page_data += f"  '{page_id}': '{page_html_b64[page_id]}',\n"
js_page_data += "};\n"

compiled = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>SmartPalm - PalmNex Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700&display=swap" rel="stylesheet"/>
<style>
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 100%; height: 100%; overflow: hidden; background: #0f1117; font-family: 'Inter', sans-serif; }}
#shell {{ display: flex; width: 100%; height: 100vh; }}
#shell-sidebar {{
    width: 64px; background: #ffffff; border-right: 1px solid #e2e8f0;
    display: flex; flex-direction: column; align-items: center;
    padding: 12px 0; gap: 4px; z-index: 100; flex-shrink: 0;
}}
.shell-nav-btn {{
    width: 48px; height: 48px; border: none; background: none;
    border-radius: 10px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.18s; padding: 4px;
}}
.shell-nav-btn:hover {{ background: #f1f5f9; }}
.shell-nav-btn.active {{ background: #e8f5f0; }}
.shell-nav-btn img {{ width: 36px; height: 36px; object-fit: contain; }}
#shell-content {{ flex: 1; position: relative; overflow: hidden; }}
.page-frame {{ position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; }}
.page-frame.active {{ display: block; }}
#loading-overlay {{
    position: absolute; inset: 0; background: rgba(15,17,23,0.75);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    z-index: 999; color: #fff; gap: 16px;
}}
.spinner {{
    width: 48px; height: 48px; border: 4px solid rgba(255,255,255,0.2);
    border-top-color: #10b981; border-radius: 50%;
    animation: spin 0.8s linear infinite;
}}
@keyframes spin {{ to {{ transform: rotate(360deg); }} }}
#loading-overlay.hidden {{ display: none; }}
</style>
</head>
<body>
<div id="shell">
  <div id="shell-sidebar">
    <button class="shell-nav-btn active" id="btn-home" onclick="navigateTo('home')" title="Home">
      <img src="{nav_icons.get('home','')}" alt="Home"/>
    </button>
    <button class="shell-nav-btn" id="btn-comprehensive" onclick="navigateTo('comprehensive')" title="Comprehensive Fert">
      <img src="{nav_icons.get('comprehensive','')}" alt="Comprehensive"/>
    </button>
    <button class="shell-nav-btn" id="btn-standard" onclick="navigateTo('standard')" title="Standard Fert">
      <img src="{nav_icons.get('standard','')}" alt="Standard"/>
    </button>
    <button class="shell-nav-btn" id="btn-reada" onclick="navigateTo('reada')" title="PalmNexReaDS">
      <img src="{nav_icons.get('reada','')}" alt="ReaDS" style="transform:scale(0.75)"/>
    </button>
  </div>
  <div id="shell-content">
    <div id="loading-overlay">
      <div class="spinner"></div>
      <span id="loading-label" style="font-family:'Inter',sans-serif;font-size:14px;">Loading SmartPalm...</span>
    </div>
    <iframe id="frame-home"          class="page-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"></iframe>
    <iframe id="frame-comprehensive" class="page-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"></iframe>
    <iframe id="frame-standard"      class="page-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"></iframe>
    <iframe id="frame-reada"         class="page-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"></iframe>
  </div>
</div>
<script>
{js_page_data}

const PAGES = ['home','comprehensive','standard','reada'];
const loaded = {{}};
let current = null;

function b64ToBlob(b64, mime) {{
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], {{type: mime}});
}}

function ensureLoaded(pageId) {{
    if (loaded[pageId]) return;
    const frame = document.getElementById('frame-' + pageId);
    const b64 = PAGE_DATA[pageId];
    if (!b64 || !frame) return;
    const blob = b64ToBlob(b64, 'text/html');
    const url = URL.createObjectURL(blob);
    frame.src = url;
    loaded[pageId] = true;
}}

function navigateTo(pageId) {{
    if (!PAGES.includes(pageId)) return;
    if (current === pageId) return;

    const isHeavy = pageId !== 'home';
    if (isHeavy && !loaded[pageId]) {{
        document.getElementById('loading-label').textContent = 'Loading ' + pageId + '...';
        document.getElementById('loading-overlay').classList.remove('hidden');
    }}

    ensureLoaded(pageId);
    const frame = document.getElementById('frame-' + pageId);

    const doSwitch = () => {{
        PAGES.forEach(p => {{
            const f = document.getElementById('frame-' + p);
            if (f) f.classList.remove('active');
            const b = document.getElementById('btn-' + p);
            if (b) b.classList.remove('active');
        }});
        frame.classList.add('active');
        const btn = document.getElementById('btn-' + pageId);
        if (btn) btn.classList.add('active');
        document.getElementById('loading-overlay').classList.add('hidden');
        current = pageId;
        // Trigger map resize
        setTimeout(() => {{
            try {{
                const win = frame.contentWindow;
                if (win && win.mapComp) win.mapComp.invalidateSize();
                if (win && win.mapStd) win.mapStd.invalidateSize();
            }} catch(e) {{}}
        }}, 200);
    }};

    const doc = frame.contentDocument;
    if (loaded[pageId] && doc && doc.readyState === 'complete') {{
        doSwitch();
    }} else {{
        frame.onload = () => {{ doSwitch(); frame.onload = null; }};
        setTimeout(() => {{
            document.getElementById('loading-overlay').classList.add('hidden');
        }}, 8000);
    }}
}}

window.addEventListener('message', function(e) {{
    if (e.data && e.data.nav) navigateTo(e.data.nav);
}});

window.addEventListener('DOMContentLoaded', function() {{
    ensureLoaded('home');
    const homeFrame = document.getElementById('frame-home');
    homeFrame.onload = () => {{
        homeFrame.classList.add('active');
        document.getElementById('btn-home').classList.add('active');
        document.getElementById('loading-overlay').classList.add('hidden');
        current = 'home';
        homeFrame.onload = null;
    }};
}});
</script>
</body>
</html>
"""

print(f"\nWriting {OUTPUT_FILE}...")
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write(compiled)

kb = os.path.getsize(OUTPUT_FILE) // 1024
print(f"\n✅ Done! compiled.html = {kb} KB ({kb//1024} MB)")
