import re

def update_titles(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # The current HTML has:
    # <div style="font-family: 'Outfit', sans-serif; font-weight: 700; color: #047857; font-size: 16px; margin: 10px 0 4px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">[Satellite]</div>
    # Let's change the inline styles to something more prominent and remove brackets.
    
    new_sat_style = 'style="font-family: \'Outfit\', sans-serif; font-weight: 700; color: #1e293b; font-size: 18px; margin: 16px 0 8px 0; padding-bottom: 6px; letter-spacing: -0.5px;"'
    new_fert_style = 'style="font-family: \'Outfit\', sans-serif; font-weight: 700; color: #1e293b; font-size: 18px; margin: 24px 0 8px 0; padding-bottom: 6px; letter-spacing: -0.5px;"'
    
    # Let's replace the whole div to be safe.
    html = re.sub(
        r'<div style="font-family:[^>]*>\[Satellite\]</div>',
        f'<div {new_sat_style}>Satellite</div>',
        html
    )
    
    html = re.sub(
        r'<div style="font-family:[^>]*>\[Fertilizer Recommendation\]</div>',
        f'<div {new_fert_style}>Fertilizer Recommendation</div>',
        html
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Updated {filepath}")

update_titles('comprehensive.html')
update_titles('standard.html')
