import os
import re

files = ['index.html', 'comprehensive.html', 'standard.html', 'PalmnexReaDS.html']

for f in files:
    if not os.path.exists(f):
        continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # 1. Update brand logo in other files
    content = content.replace(
        '<h2>PalmNex <span>CMS</span></h2>',
        '<img src="MPOB-3-all-black-fonts.png" alt="MPOB Logo" style="max-width: 100%; height: auto; max-height: 50px;" />'
    )
    
    # 2. Increase Standard logo size by 20% (approx 26px to 32px)
    content = re.sub(
        r'src="std-logo-final\.png" class="icon" style="width: \d+px; height: \d+px;',
        r'src="std-logo-final.png" class="icon" style="width: 32px; height: 32px;',
        content
    )
    
    # 3. Increase Home logo size by 20% (approx 22px to 26px)
    content = re.sub(
        r'src="home-logo-final\.png" class="icon" style="width: \d+px; height: \d+px;',
        r'src="home-logo-final.png" class="icon" style="width: 26px; height: 26px;',
        content
    )
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Left panel updated successfully!")
