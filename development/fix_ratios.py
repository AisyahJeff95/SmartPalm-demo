import re

new_ratio_html = """            <div class="group-box">
                <div class="group-box-title">Fertilizer Ratio</div>
                <div style="display: flex; justify-content: space-between; margin-top: 4px; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; margin-bottom: 6px;">
                    <div style="width: 24px;"></div>
                    <div style="flex: 1; text-align: center; font-size: 12px; color: #64748b; font-weight: 600;">Used</div>
                    <div style="flex: 1; text-align: center; font-size: 12px; color: #64748b; font-weight: 600;">Need to Use</div>
                </div>
                <!-- N -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="width: 24px; font-size: 12px; font-weight: bold; color: #444;">N</div>
                    <div style="flex: 1; padding: 0 4px;"><input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px; font-size: 12px; text-align: center;" placeholder="-" /></div>
                    <div style="flex: 1; padding: 0 4px;"><input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px; font-size: 12px; text-align: center;" placeholder="-" /></div>
                </div>
                <!-- P -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="width: 24px; font-size: 12px; font-weight: bold; color: #444;">P</div>
                    <div style="flex: 1; padding: 0 4px;"><input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px; font-size: 12px; text-align: center;" placeholder="-" /></div>
                    <div style="flex: 1; padding: 0 4px;"><input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px; font-size: 12px; text-align: center;" placeholder="-" /></div>
                </div>
                <!-- K -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="width: 24px; font-size: 12px; font-weight: bold; color: #444;">K</div>
                    <div style="flex: 1; padding: 0 4px;"><input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px; font-size: 12px; text-align: center;" placeholder="-" /></div>
                    <div style="flex: 1; padding: 0 4px;"><input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px; font-size: 12px; text-align: center;" placeholder="-" /></div>
                </div>
                <!-- Mg -->
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="width: 24px; font-size: 12px; font-weight: bold; color: #444;">Mg</div>
                    <div style="flex: 1; padding: 0 4px;"><input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px; font-size: 12px; text-align: center;" placeholder="-" /></div>
                    <div style="flex: 1; padding: 0 4px;"><input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px; font-size: 12px; text-align: center;" placeholder="-" /></div>
                </div>
            </div>"""

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We want to replace the div class="group-box" that contains Fertilizer Ratio
    pattern = r'<div class="group-box">\s*<div class="group-box-title">Fertilizer Ratio</div>.*?</div>\s*</div>\s*</div>'
    match = re.search(pattern, content, flags=re.DOTALL)
    
    if match:
        new_content = content[:match.start()] + new_ratio_html + content[match.end():]
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
    else:
        print(f"Could not find Fertilizer Ratio block in {filepath}")

replace_in_file('comprehensive.html')
replace_in_file('standard.html')

