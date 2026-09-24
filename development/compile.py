#!/usr/bin/env python3
"""
compile.py
Compiles comprehensive.html into a single self-contained compiled.html by:
  1. Inlining local CSS files (href="css/...")
  2. Inlining local images as base64 data URIs (src="logo.png" etc.)
  3. Fetching CDN JS/CSS and inlining them
  4. Removing nav links to other pages (makes them non-clickable placeholders)
"""

import base64
import mimetypes
import os
import re
import sys
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(BASE_DIR, "comprehensive.html")
OUTPUT_FILE = os.path.join(BASE_DIR, "compiled.html")

CDN_CACHE = {}

def fetch_cdn(url):
    if url in CDN_CACHE:
        return CDN_CACHE[url]
    print(f"  Fetching: {url}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8", errors="replace")
        CDN_CACHE[url] = content
        return content
    except Exception as e:
        print(f"  WARNING: Could not fetch {url}: {e}")
        return None

def image_to_data_uri(filepath):
    mime, _ = mimetypes.guess_type(filepath)
    if not mime:
        ext = os.path.splitext(filepath)[1].lower()
        mime = {".png": "image/png", ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg", ".gif": "image/gif",
                ".svg": "image/svg+xml", ".ico": "image/x-icon"}.get(ext, "application/octet-stream")
    with open(filepath, "rb") as f:
        data = base64.b64encode(f.read()).decode("ascii")
    return f"data:{mime};base64,{data}"

def read_local_css(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()

def process(html):
    # ── 1. Inline local CSS <link href="css/..."> ───────────────────────────
    def replace_local_css(m):
        href = m.group(1)
        if href.startswith("http") or href.startswith("//"):
            return m.group(0)  # handle CDN links separately
        full = os.path.join(BASE_DIR, href.replace("/", os.sep))
        if os.path.isfile(full):
            print(f"  Inlining CSS: {href}")
            css = read_local_css(full)
            return f"<style>\n{css}\n</style>"
        return m.group(0)

    html = re.sub(
        r'<link[^>]+href="([^"]+\.css)"[^>]*/?>',
        replace_local_css,
        html
    )

    # ── 2. Inline CDN CSS <link href="https://...css"> ──────────────────────
    def replace_cdn_css(m):
        href = m.group(1)
        if not (href.startswith("http") or href.startswith("//")):
            return m.group(0)
        content = fetch_cdn(href)
        if content:
            return f"<style>\n/* Inlined from: {href} */\n{content}\n</style>"
        return m.group(0)

    html = re.sub(
        r'<link[^>]+href="(https?://[^"]+\.css)"[^>]*/?>',
        replace_cdn_css,
        html
    )

    # ── 3. Inline CDN JS <script src="https://..."> ─────────────────────────
    def replace_cdn_js(m):
        src = m.group(1)
        content = fetch_cdn(src)
        if content:
            return f"<script>\n/* Inlined from: {src} */\n{content}\n</script>"
        return m.group(0)

    html = re.sub(
        r'<script\s+src="(https?://[^"]+)"[^>]*>\s*</script>',
        replace_cdn_js,
        html
    )

    # ── 4. Inline local images src="filename.png/jpg/jpeg" ──────────────────
    LOCAL_IMAGES = [
        "MPOB-3-all-black-fonts.png",
        "MPOB-3.png",
        "MPOB-3_transparent.png",
        "home-logo-final.png",
        "comp-logo-final.png",
        "std-logo-final.png",
        "reada-logo-final.png",
        "report_photo_new.png",
        "palm_block_satellite.png",
        "full_map_nutrient_detection.png",
        "block22_permanent_photo.png",
    ]
    for img in LOCAL_IMAGES:
        full = os.path.join(BASE_DIR, img)
        if os.path.isfile(full):
            print(f"  Inlining image: {img}")
            data_uri = image_to_data_uri(full)
            html = html.replace(f'src="{img}"', f'src="{data_uri}"')
        else:
            print(f"  WARNING: Image not found: {img}")

    # ── 5. Inline Google Fonts as empty (fonts load from CDN; keep tag as-is
    #       OR just remove it — fonts degrade gracefully to sans-serif)
    # We'll keep the Google Fonts link as-is (needs internet) but note it.
    # If strict offline needed, remove it:
    # html = re.sub(r'<link[^>]+fonts\.googleapis\.com[^>]*/?>', '', html)

    # ── 6. Remove nav hrefs to other pages (keep UI intact, disable nav) ────
    #   Replace href="index.html", href="standard.html", etc. with href="#"
    for page in ["index.html", "standard.html", "PalmnexReaDS.html", "comprehensive.html"]:
        html = html.replace(f'href="{page}"', 'href="javascript:void(0)"')

    return html

def main():
    print(f"Reading {INPUT_FILE} ({os.path.getsize(INPUT_FILE)//1024} KB)...")
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        html = f.read()

    print("Processing...")
    html = process(html)

    print(f"Writing {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(html)

    size_kb = os.path.getsize(OUTPUT_FILE) // 1024
    print(f"\n✅ Done! compiled.html is {size_kb} KB ({size_kb//1024} MB)")
    print(f"   Output: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
