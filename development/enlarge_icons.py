import re
import os
import math

files = ['index.html', 'comprehensive.html', 'standard.html', 'PalmnexReaDS.html']

def increase_50_percent(match):
    src = match.group(1)
    width = int(match.group(2))
    height = int(match.group(3))
    
    new_width = math.ceil(width * 1.5)
    new_height = math.ceil(height * 1.5)
    
    return f'src="{src}" class="icon" style="width: {new_width}px; height: {new_height}px;'

for f in files:
    if not os.path.exists(f):
        continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # regex to match: src="something.png" class="icon" style="width: 22px; height: 22px;
    # It catches all the sidebar icons since they share this pattern
    content = re.sub(
        r'src="([^"]+\.png)" class="icon" style="width:\s*(\d+)px;\s*height:\s*(\d+)px;',
        increase_50_percent,
        content
    )
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("All left panel icons increased by 50%!")
