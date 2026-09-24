import re
import os

files = ['index.html', 'comprehensive.html', 'standard.html', 'PalmnexReaDS.html']

for f in files:
    if not os.path.exists(f):
        continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Replace Comprehensive icon
    content = re.sub(
        r'<span class="icon">📊</span>',
        r'<img src="comp-logo-final.png" class="icon" style="width: 22px; height: 22px; object-fit: contain; margin-right: 12px;" />',
        content
    )
    
    # Replace Standard icon
    content = re.sub(
        r'<span class="icon">📈</span>',
        r'<img src="std-logo-final.png" class="icon" style="width: 22px; height: 22px; object-fit: contain; margin-right: 12px;" />',
        content
    )
    
    # Replace PalmnexReaDS icon
    content = re.sub(
        r'<span class="icon">🔬</span>',
        r'<img src="reada-logo-final.png" class="icon" style="width: 22px; height: 22px; object-fit: contain; margin-right: 12px;" />',
        content
    )
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Icons replaced in sidebar!")
