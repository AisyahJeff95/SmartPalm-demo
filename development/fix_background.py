import re

with open('css/main.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Remove background properties from #page-launcher
css = re.sub(r'background-image:\s*url\([^)]+\);', '', css)
css = re.sub(r'background-size:\s*cover;', '', css)
css = re.sub(r'background-position:\s*center;', '', css)
css = re.sub(r'background-repeat:\s*no-repeat;', '', css)

with open('css/main.css', 'w', encoding='utf-8') as f:
    f.write(css)

# Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('<div class="cms-layout">', '<div class="cms-layout" style="background-image: url(\'5c0a6e2d37d95a291dd40986ddbf6aee.jpg\'); background-size: cover; background-position: center; background-repeat: no-repeat;">')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
