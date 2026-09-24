import re
import os

files = ['index.html', 'comprehensive.html', 'standard.html', 'PalmnexReaDS.html']

for f in files:
    if not os.path.exists(f):
        continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # regex to wrap the text inside .cms-nav-item after the img tag.
    # The text usually looks like " Home", " Comprehensive Fert", etc.
    # We will look for <a ... class="cms-nav-item..."><img ... /> Text </a>
    
    def replacer(match):
        a_tag_start = match.group(1)
        img_tag = match.group(2)
        text = match.group(3).strip()
        # if already wrapped, do nothing
        if '<span class="nav-label">' in text:
            return match.group(0)
        return f'{a_tag_start}\n                    {img_tag} <span class="nav-label">{text}</span>\n                </a>'

    # match <a class="cms-nav-item..."> ... <img ... /> ... </a>
    content = re.sub(
        r'(<a[^>]+class="cms-nav-item[^"]*"[^>]*>)\s*(<img[^>]+>)\s*([^<]+)\s*</a>',
        replacer,
        content
    )
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Text wrapped in nav-label!")
