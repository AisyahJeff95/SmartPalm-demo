import re

with open('css/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Add specific padding for comprehensive sidebar to clear the top nav panel
if "#page-comprehensive .sidebar" not in css:
    css += "\n\n#page-comprehensive .sidebar {\n    padding-top: 72px;\n}\n"

with open('css/styles.css', 'w', encoding='utf-8') as f:
    f.write(css)

def fix_html(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # Fix "Fertilizer Ratio" -> "Fertilizer Used / To Use"
    html = html.replace('<div class="group-box-title">Fertilizer Ratio</div>', '<div class="group-box-title">Fertilizer Used / To Use</div>')

    # Fix "To Use" -> "Ratio"
    html = html.replace('font-weight: 600;">To Use</div>', 'font-weight: 600;">Ratio</div>')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Updated {filepath}")

fix_html('comprehensive.html')
fix_html('standard.html')
