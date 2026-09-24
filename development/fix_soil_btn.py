import re

with open('css/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Replace .soil-entry-btn
old_btn = r'\.soil-entry-btn\s*\{[^}]*\}'
new_btn = """.soil-entry-btn {
    flex: 1;
    height: 38px;
    background-color: #6366f1; /* beautiful indigo */
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}
.soil-entry-btn:hover {
    background-color: #4f46e5;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2);
}"""

# Using re.sub with count=1 just in case
css = re.sub(old_btn, new_btn, css, count=1)

with open('css/styles.css', 'w', encoding='utf-8') as f:
    f.write(css)
print("Updated css/styles.css")

