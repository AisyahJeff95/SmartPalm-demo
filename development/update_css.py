import re

with open('css/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Update .sidebar
sidebar_old = r'\.sidebar\s*\{[^}]*\}'
sidebar_new = """.sidebar {
    width: 380px;
    background: rgba(255, 255, 255, 0.4);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-right: 1px solid rgba(255, 255, 255, 0.3);
    display: flex;
    flex-direction: column;
    padding: 24px;
    gap: 16px;
    height: 100%;
    overflow-y: auto;
    font-family: 'Inter', sans-serif;
}"""
css = re.sub(sidebar_old, sidebar_new, css, count=1)

# 2. Update .group-box
groupbox_old = r'\.group-box\s*\{[^}]*\}'
groupbox_new = """.group-box {
    background-color: rgba(255, 255, 255, 0.85);
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    transition: box-shadow 0.3s ease;
    position: relative;
}
.group-box:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08);
}"""
css = re.sub(groupbox_old, groupbox_new, css, count=1)

# 3. Update .group-box-title
title_old = r'\.group-box-title\s*\{[^}]*\}'
title_new = """.group-box-title {
    position: static;
    background: transparent;
    font-family: 'Outfit', sans-serif;
    font-weight: 700;
    font-size: 16px;
    color: #1e293b;
    margin: 0 0 12px 0;
    padding: 0;
}"""
css = re.sub(title_old, title_new, css, count=1)

# 4. Update .form-select
css = re.sub(r'(\.form-select\s*\{[^}]*\}?)', r'\1\n    border-radius: 6px;\n    transition: all 0.2s ease;', css, count=1)

# 5. Update .upload-btn
css = re.sub(r'(\.upload-btn\s*\{[^}]*\}?)', r'\1\n    border-radius: 8px;\n    transition: all 0.2s ease;', css, count=1)
# Add upload-btn hover if it doesn't exist (it probably does, but transition will apply)

with open('css/styles.css', 'w', encoding='utf-8') as f:
    f.write(css)

print("Updated css/styles.css")
