import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. Update [Satellite] and [Fertilizer Recommendation] headers to use Outfit
    html = re.sub(
        r'style="font-weight: 700; color: #047857; font-size: 16px; margin:',
        r'style="font-family: \'Outfit\', sans-serif; font-weight: 700; color: #047857; font-size: 16px; margin:',
        html
    )

    # 2. Update buttons to have transition and 8px border radius (instead of 4px)
    html = html.replace('border-radius: 4px; cursor: pointer;', 'border-radius: 8px; cursor: pointer; transition: all 0.2s ease;')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Updated {filepath}")

fix_file('comprehensive.html')
fix_file('standard.html')
