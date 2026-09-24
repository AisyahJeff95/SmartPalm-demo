import re

def update_html(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # I want to target only the sidebar we just added.
    pattern = r'(<div class="sidebar">.*?)<!-- (Right Map View|Map Area) -->'
    match = re.search(pattern, html, flags=re.DOTALL)
    if not match:
        return
        
    sidebar = match.group(1)
    
    # Titles are already 16px (in inline styles) and group-box-title is 16px in css.
    # Change all other inline font-size to 12px.
    sidebar = re.sub(r'font-size:\s*1[1345]px;', 'font-size: 12px;', sidebar)
    
    # Then I'll replace it back
    new_html = html[:match.start()] + sidebar + "<!-- " + match.group(2) + " -->" + html[match.end():]
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_html)
    print(f"Updated {filepath}")

update_html('comprehensive.html')
update_html('standard.html')

def update_css(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        css = f.read()
        
    # .form-label
    css = re.sub(r'(\.form-label\s*\{[^}]*font-size:\s*)15px', r'\g<1>12px', css)
    # .nutrient-card-title (maybe make this 12px, user said excluding titles 16px, but nutrient card title might be 12px or 16px. I'll make it 12px)
    css = re.sub(r'(\.nutrient-card-title\s*\{[^}]*font-size:\s*)13px', r'\g<1>12px', css)
    # .nutrient-card-val is 20px, if I make it 12px it will be tiny, but I'll make it 12px to follow the instruction strictly.
    css = re.sub(r'(\.nutrient-card-val\s*\{[^}]*font-size:\s*)20px', r'\g<1>12px', css)

    # Make .group-box-title exactly 16px (it already is, but just in case)
    css = re.sub(r'(\.group-box-title\s*\{[^}]*font-size:\s*)[0-9]+px', r'\g<1>16px', css)

    # Let's also check .soil-entry-btn, .report-download-btn, etc.
    css = re.sub(r'(\.soil-entry-btn\s*\{[^}]*font-size:\s*)14px', r'\g<1>12px', css)
    css = re.sub(r'(\.action-button-full\s*\{[^}]*font-size:\s*)14px', r'\g<1>12px', css)
    css = re.sub(r'(\.back-nav-btn\s*\{[^}]*font-size:\s*)13px', r'\g<1>12px', css)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(css)
    print(f"Updated {filepath}")

update_css('css/styles.css')

