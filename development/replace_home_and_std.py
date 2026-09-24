import os

files = ['index.html', 'comprehensive.html', 'standard.html', 'PalmnexReaDS.html']

for f in files:
    if not os.path.exists(f):
        continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Replace Home icon
    content = content.replace(
        '<span class="icon">🏠</span>',
        '<img src="home-logo-final.png" class="icon" style="width: 22px; height: 22px; object-fit: contain; margin-right: 12px; vertical-align: middle;" />'
    )
    
    # Increase Standard icon size
    content = content.replace(
        '<img src="std-logo-final.png" class="icon" style="width: 22px; height: 22px; object-fit: contain; margin-right: 12px;" />',
        '<img src="std-logo-final.png" class="icon" style="width: 26px; height: 26px; object-fit: contain; margin-right: 12px; vertical-align: middle;" />'
    )
    
    # Also add vertical-align: middle to the other logos so they line up better with text (optional but good idea)
    content = content.replace(
        '<img src="comp-logo-final.png" class="icon" style="width: 22px; height: 22px; object-fit: contain; margin-right: 12px;" />',
        '<img src="comp-logo-final.png" class="icon" style="width: 22px; height: 22px; object-fit: contain; margin-right: 12px; vertical-align: middle;" />'
    )
    content = content.replace(
        '<img src="reada-logo-final.png" class="icon" style="width: 22px; height: 22px; object-fit: contain; margin-right: 12px;" />',
        '<img src="reada-logo-final.png" class="icon" style="width: 22px; height: 22px; object-fit: contain; margin-right: 12px; vertical-align: middle;" />'
    )

    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Home icons replaced and standard icon enlarged in sidebar!")
