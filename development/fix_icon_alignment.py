import re
import os

files = ['index.html', 'comprehensive.html', 'standard.html', 'PalmnexReaDS.html']

for f in files:
    if not os.path.exists(f):
        continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Remove the inline styles from the icon images so CSS takes over
    content = re.sub(
        r'(<img src="[^"]+" class="icon") style="[^"]*"',
        r'\1',
        content
    )
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Inline styles removed from icons!")
