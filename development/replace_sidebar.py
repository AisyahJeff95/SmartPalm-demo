import re

comp_sidebar = """        <div class="sidebar">
            <button class="back-nav-btn" data-i18n="btnBack" onclick="location.href='index.html'">← Back to Home</button>

            <!-- [Satellite] Section -->
            <div style="font-weight: 700; color: #047857; font-size: 16px; margin: 10px 0 4px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">[Satellite]</div>

            <!-- 1. Estate Name -->
            <div class="group-box" style="border: 1.5px solid #047857;">
                <div class="group-box-title" style="color: #047857;">Estate Name</div>
                <input type="text" id="comp-estate-name" class="form-select" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 13px;" placeholder="Enter estate name..." />
            </div>

            <!-- 2. Satellite Data -->
            <div class="group-box">
                <div class="group-box-title">Satellite Data</div>
                <div style="display: flex; gap: 8px;">
                    <button style="flex: 1; padding: 6px 4px; font-size: 12px; border: 1.5px solid #047857; background: #fff; color: #047857; border-radius: 4px; cursor: pointer; font-weight: 600;">Real-Time Data</button>
                    <button style="flex: 1; padding: 6px 4px; font-size: 12px; border: 1.5px solid #047857; background: #fff; color: #047857; border-radius: 4px; cursor: pointer; font-weight: 600;">Previous Data</button>
                </div>
            </div>

            <!-- 3. Map Selection & Upload -->
            <div class="group-box">
                <div class="group-box-title">Map File Selection</div>
                <div class="form-row">
                    <label class="form-label" style="font-size: 13px;">Select Map:</label>
                    <select class="form-select" id="map-select-comp" onchange="onMapSelectChanged(this.value)">
                        <option value="lahad_datu">Lahad Datu with block boundary</option>
                        <option value="seraya">Seraya with block boundary</option>
                    </select>
                </div>
                <div class="upload-row" style="margin-top: 8px;">
                    <span class="upload-desc" style="font-size: 11px;">Or upload .shp / .dbf files:</span>
                    <button class="upload-btn" onclick="document.getElementById('shp-file-input').click()">Upload</button>
                    <input type="file" id="shp-file-input" accept=".shp,.dbf,.prj,.shx,.zip" multiple style="display: none;" onchange="handleShapefileUpload(event)" />
                </div>
            </div>

            <!-- 4. Viewport Tools -->
            <div class="group-box">
                <div class="group-box-title">Viewport Tools</div>
                <div style="display: flex; gap: 8px;">
                    <button style="flex: 1; padding: 6px 4px; font-size: 12px; background: #047857; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Classify Viewport</button>
                    <button style="flex: 1; padding: 6px 4px; font-size: 12px; background: #ef4444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Remove Stress Level</button>
                </div>
            </div>

            <!-- 5. Soil Data Entry -->
            <div class="group-box">
                <div class="group-box-title">Soil Data Entry</div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button class="soil-entry-btn" onclick="openEdsInlandDialog()" style="width: 100%;">Inland Soil Data Entry</button>
                    <button class="soil-entry-btn" onclick="openEdsAlluvialDialog()" style="width: 100%;">Coastal Soil Data Entry</button>
                </div>
            </div>

            <!-- 6. Point Nutrient Detection -->
            <div class="group-box">
                <div class="group-box-title">Nutrient Detection</div>
                <div class="nutrient-grid" style="margin-top: 10px;">
                    <div class="nutrient-display-card">
                        <div class="nutrient-card-title">N (%)</div>
                        <div class="nutrient-card-val" id="comp-n-val">-- %</div>
                    </div>
                    <div class="nutrient-display-card">
                        <div class="nutrient-card-title">P (%)</div>
                        <div class="nutrient-card-val" id="comp-p-val">-- %</div>
                    </div>
                    <div class="nutrient-display-card">
                        <div class="nutrient-card-title">K (%)</div>
                        <div class="nutrient-card-val" id="comp-k-val">-- %</div>
                    </div>
                    <div class="nutrient-display-card">
                        <div class="nutrient-card-title">Mg (%)</div>
                        <div class="nutrient-card-val" id="comp-mg-val">-- %</div>
                    </div>
                </div>
                <button class="action-button-full" style="margin-top: 8px;" onclick="openFullMapNutrientDialog()">View Full Map Nutrient Detection</button>
            </div>

            <!-- 7. Fertilizer Ratio -->
            <div class="group-box">
                <div class="group-box-title">Fertilizer Ratio</div>
                <div style="display: flex; gap: 8px; margin-top: 4px;">
                    <div style="flex: 1;">
                        <label style="font-size: 11px; color: #64748b; font-weight: 600;">Used</label>
                        <input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px 6px; font-size: 13px;" placeholder="e.g. 2.5" />
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 11px; color: #64748b; font-weight: 600;">Need to Use</label>
                        <input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px 6px; font-size: 13px;" placeholder="e.g. 3.0" />
                    </div>
                </div>
            </div>

            <!-- [Fertilizer Recommendation] Section -->
            <div style="font-weight: 700; color: #047857; font-size: 16px; margin: 16px 0 4px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">[Fertilizer Recommendation]</div>
            
            <button class="report-download-btn" style="width: 100%; padding: 12px; font-size: 14px; background: #047857; color: #fff; text-align: center; font-weight: bold; border-radius: 6px; border: none; cursor: pointer; margin-bottom: 20px;" onclick="viewReportPDF('Inland')">📄 Generate Report</button>

        </div>"""

std_sidebar = """        <div class="sidebar">
            <button class="back-nav-btn" data-i18n="btnBack" onclick="location.href='index.html'">← Back to Home</button>

            <!-- [Satellite] Section -->
            <div style="font-weight: 700; color: #047857; font-size: 16px; margin: 10px 0 4px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">[Satellite]</div>

            <!-- 1. Estate Name -->
            <div class="group-box" style="border: 1.5px solid #047857;">
                <div class="group-box-title" style="color: #047857;">Estate Name</div>
                <input type="text" id="std-estate-name" class="form-select" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 13px;" placeholder="Enter estate name..." />
            </div>

            <!-- 2. Satellite Data -->
            <div class="group-box">
                <div class="group-box-title">Satellite Data</div>
                <div style="display: flex; gap: 8px;">
                    <button style="flex: 1; padding: 6px 4px; font-size: 12px; border: 1.5px solid #047857; background: #fff; color: #047857; border-radius: 4px; cursor: pointer; font-weight: 600;">Real-Time Data</button>
                    <button style="flex: 1; padding: 6px 4px; font-size: 12px; border: 1.5px solid #047857; background: #fff; color: #047857; border-radius: 4px; cursor: pointer; font-weight: 600;">Previous Data</button>
                </div>
            </div>

            <!-- 3. Map Selection & Upload -->
            <div class="group-box">
                <div class="group-box-title">Map File Selection</div>
                <div class="form-row">
                    <label class="form-label" style="font-size: 13px;">Select Map:</label>
                    <select class="form-select" id="map-select-std" onchange="onMapSelectChanged(this.value)">
                        <option value="lahad_datu">Lahad Datu with block boundary</option>
                        <option value="seraya">Seraya with block boundary</option>
                    </select>
                </div>
                <div class="upload-row" style="margin-top: 8px;">
                    <span class="upload-desc" style="font-size: 11px;">Or upload .shp / .dbf files:</span>
                    <button class="upload-btn" onclick="document.getElementById('shp-file-input').click()">Upload</button>
                    <input type="file" id="shp-file-input" accept=".shp,.dbf,.prj,.shx,.zip" multiple style="display: none;" onchange="handleShapefileUpload(event)" />
                </div>
            </div>

            <!-- 4. Viewport Tools -->
            <div class="group-box">
                <div class="group-box-title">Viewport Tools</div>
                <div style="display: flex; gap: 8px;">
                    <button style="flex: 1; padding: 6px 4px; font-size: 12px; background: #047857; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Classify Viewport</button>
                    <button style="flex: 1; padding: 6px 4px; font-size: 12px; background: #ef4444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Remove Stress Level</button>
                </div>
            </div>

            <!-- 5. Point Nutrient Detection -->
            <div class="group-box">
                <div class="group-box-title">Nutrient Detection</div>
                <div class="nutrient-grid" style="margin-top: 10px;">
                    <div class="nutrient-display-card">
                        <div class="nutrient-card-title">N (%)</div>
                        <div class="nutrient-card-val" id="std-n-val">-- %</div>
                    </div>
                    <div class="nutrient-display-card">
                        <div class="nutrient-card-title">P (%)</div>
                        <div class="nutrient-card-val" id="std-p-val">-- %</div>
                    </div>
                    <div class="nutrient-display-card">
                        <div class="nutrient-card-title">K (%)</div>
                        <div class="nutrient-card-val" id="std-k-val">-- %</div>
                    </div>
                    <div class="nutrient-display-card">
                        <div class="nutrient-card-title">Mg (%)</div>
                        <div class="nutrient-card-val" id="std-mg-val">-- %</div>
                    </div>
                </div>
                <button class="action-button-full" style="margin-top: 8px;" onclick="openFullMapNutrientDialog()">View Full Map Nutrient Detection</button>
            </div>

            <!-- 6. Fertilizer Ratio -->
            <div class="group-box">
                <div class="group-box-title">Fertilizer Ratio</div>
                <div style="display: flex; gap: 8px; margin-top: 4px;">
                    <div style="flex: 1;">
                        <label style="font-size: 11px; color: #64748b; font-weight: 600;">Used</label>
                        <input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px 6px; font-size: 13px;" placeholder="e.g. 2.5" />
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 11px; color: #64748b; font-weight: 600;">Need to Use</label>
                        <input type="text" class="form-select" style="width: 100%; box-sizing: border-box; padding: 4px 6px; font-size: 13px;" placeholder="e.g. 3.0" />
                    </div>
                </div>
            </div>

            <!-- [Fertilizer Recommendation] Section -->
            <div style="font-weight: 700; color: #047857; font-size: 16px; margin: 16px 0 4px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">[Fertilizer Recommendation]</div>
            
            <button class="report-download-btn" style="width: 100%; padding: 12px; font-size: 14px; background: #047857; color: #fff; text-align: center; font-weight: bold; border-radius: 6px; border: none; cursor: pointer; margin-bottom: 20px;">📄 Generate Report</button>

        </div>"""

def replace_in_file(filepath, replacement_str):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace from <div class="sidebar"> up to the next outer div which is map-wrapper
    pattern = r'<div class="sidebar">.*?<!-- (Right Map View|Map Area) -->'
    match = re.search(pattern, content, flags=re.DOTALL)
    if match:
        end_marker = "<!-- " + match.group(1) + " -->"
        new_content = content[:match.start()] + replacement_str + "\n\n        " + end_marker + content[match.end():]
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
    else:
        print(f"Could not find sidebar pattern in {filepath}")

replace_in_file('comprehensive.html', comp_sidebar)
replace_in_file('standard.html', std_sidebar)
