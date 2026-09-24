import re

with open('css/cms-layout.css', 'r', encoding='utf-8') as f:
    css = f.read()

old = """.cms-card.reads { background-color: #f4fdf8; border-color: #dcfce7; }
.cms-card.reads .cms-card-icon-wrapper { background: #dcfce7; color: #15803d; }"""

new = """.cms-card.reads { 
    background: linear-gradient(135deg, #112d2b 0%, #0d5c46 100%); 
    border-color: #064e3b; 
    box-shadow: 0 10px 25px -5px rgba(13, 92, 70, 0.4);
}
.cms-card.reads .cms-card-title { color: #ffffff; }
.cms-card.reads .cms-card-desc { color: #d1fae5; }
.cms-card.reads .cms-card-icon-wrapper { background: rgba(255, 255, 255, 0.15); color: #ffffff; }
.cms-card.reads .cms-card-action { color: #6ee7b7; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.cms-card.reads:hover .cms-card-action { color: #ffffff; }
.cms-card.reads:hover { box-shadow: 0 15px 35px -5px rgba(13, 92, 70, 0.5); transform: translateY(-4px); }"""

css = css.replace(old, new)

with open('css/cms-layout.css', 'w', encoding='utf-8') as f:
    f.write(css)
