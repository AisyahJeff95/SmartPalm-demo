def remove_back_btn(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We remove the back-nav-btn from the sidebar
    import re
    new_content = re.sub(r'\s*<button class="back-nav-btn"[^>]*>← Back to Home</button>', '', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated {filepath}")

remove_back_btn('standard.html')
remove_back_btn('comprehensive.html')
