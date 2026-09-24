import re
import os

files = ['index.html', 'comprehensive.html', 'standard.html', 'PalmnexReaDS.html']

for f in files:
    if not os.path.exists(f):
        continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Left Panel: add inline transform: scale(0.75); to reada-logo-final.png
    content = content.replace(
        '<img src="reada-logo-final.png" class="icon" />',
        '<img src="reada-logo-final.png" class="icon" style="transform: scale(0.75);" />'
    )
    
    # Dashboard: reduce size for the card icon wrapper content
    content = content.replace(
        '<img src="reada-logo-final.png" alt="PalmnexReaDS Logo" style="width: 100%; height: 100%; object-fit: contain;" />',
        '<img src="reada-logo-final.png" alt="PalmnexReaDS Logo" style="width: 100%; height: 100%; object-fit: contain; transform: scale(0.75);" />'
    )
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("PalmNexReaDS logo size reduced!")
