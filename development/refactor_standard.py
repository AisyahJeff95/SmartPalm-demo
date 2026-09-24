import re

# 1. Update css/styles.css
with open('css/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Change .sidebar width to 380px
css = re.sub(r'(\.sidebar\s*\{[^}]*width:\s*)460px', r'\g<1>380px', css)

# Standard specific classes: update to light theme
css = css.replace('background-color: rgba(20, 28, 52, 0.65);', 'background-color: #ffffff;')
css = css.replace('border: 1px solid rgba(255, 255, 255, 0.1);', 'border: 1px solid #cbd5e1;')
css = css.replace('color: #38bdf8;', 'color: #047857;')
css = css.replace('background-color: rgba(15, 23, 42, 0.9);', 'background-color: #f8fafc;')
css = css.replace('border: 1px solid rgba(255, 255, 255, 0.15);', 'border: 1px solid #e2e8f0;')
css = css.replace('background-color: #1e293b;', 'background-color: #ffffff;')
css = css.replace('color: #f8fafc;', 'color: #0f172a;')
css = css.replace('border: 1px solid rgba(56, 189, 248, 0.5);', 'border: 1px solid #047857;')
css = css.replace('color: #bae6fd;', 'color: #334155;')
css = css.replace('background-color: #060913;', 'background-color: #ffffff;')

with open('css/styles.css', 'w', encoding='utf-8') as f:
    f.write(css)

# 2. Update css/tables-forms.css if sidebar exists
try:
    with open('css/tables-forms.css', 'r', encoding='utf-8') as f:
        tf_css = f.read()
    tf_css = re.sub(r'(\.sidebar\s*\{[^}]*width:\s*)460px', r'\g<1>380px', tf_css)
    with open('css/tables-forms.css', 'w', encoding='utf-8') as f:
        f.write(tf_css)
except Exception:
    pass

# 3. Update standard.html
with open('standard.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace classes
html = html.replace('standard-sidebar', 'sidebar')
html = html.replace('standard-group-box', 'group-box')
html = html.replace('standard-group-title', 'group-box-title')
html = html.replace('standard-select', 'form-select')

with open('standard.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Refactored!")
