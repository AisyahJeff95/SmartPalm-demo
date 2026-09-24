import re

with open('/Users/drsitiaisyahjaafar/SmartPalm-demo/development/PalmnexReaDS.html', 'r') as f:
    content = f.read()

# 1. Add css/cms-layout.css
css_link = '<link rel="stylesheet" href="css/cms-layout.css" />\n    <link rel="stylesheet" href="css/main.css" />'
content = content.replace('<link rel="stylesheet" href="css/main.css" />', css_link)

# 2. Add CMS layout wrapper
layout_html = """<body>
    <div class="cms-layout">
        <!-- Top Panel -->
        <div class="cms-top-panel">
            <div class="cms-sidebar-brand">
                <img src="MPOB-3-all-black-fonts.png" alt="MPOB Logo" style="max-width: 100%; height: auto; max-height: 50px;" />
            </div>
            <!-- Global Top Right Actions -->
            <div class="global-top-right-actions">
                <div class="action-btn-container" onclick="document.getElementById('manual-modal').style.display='flex'">
                    <div class="action-icon-box">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>
                    </div>
                    <span class="action-label">User Manual</span>
                </div>
                <div class="action-btn-container">
                    <div class="action-icon-box">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.9 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.34.16-2h4.68c.09.66.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.66-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg>
                    </div>
                    <span class="action-label">Language</span>
                </div>
                <div class="action-btn-container">
                    <div class="action-icon-box">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    </div>
                    <span class="action-label">Login / Sign Up</span>
                </div>
            </div>
        </div>

        <!-- New Persistent Sidebar -->
        <aside class="cms-sidebar">
            <nav class="cms-nav">
                <a href="index.html" class="cms-nav-item">
                    <img src="home-logo-final.png" class="icon" /> <span class="nav-label">Home</span>
                </a>
                <a href="comprehensive.html" class="cms-nav-item">
                    <img src="comp-logo-final.png" class="icon" /> <span class="nav-label">Comprehensive Fert</span>
                </a>
                <a href="standard.html" class="cms-nav-item">
                    <img src="std-logo-final.png" class="icon" /> <span class="nav-label">Standard Fert</span>
                </a>
                <a href="PalmnexReaDS.html" class="cms-nav-item active">
                    <img src="reada-logo-final.png" class="icon" style="transform: scale(0.75);" /> <span class="nav-label">PalmNexReaDS</span>
                </a>
            </nav>
        </aside>

        <!-- Main Content Area -->
        <main class="cms-main-content" style="padding: 0; display: flex; flex-direction: column; overflow: hidden; height: 100vh;">
"""
content = content.replace('<body>', layout_html)

# 3. Close the new wrapper tags before </body>
content = content.replace('</body>', '        </main>\n    </div>\n</body>')

with open('/Users/drsitiaisyahjaafar/SmartPalm-demo/development/PalmnexReaDS.html', 'w') as f:
    f.write(content)

