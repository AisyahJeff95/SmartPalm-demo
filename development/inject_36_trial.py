import os

b64_file = 'MPOBLahadDatu_36TrialPlot.b64'
with open(b64_file, 'r') as f:
    b64_data = f.read().replace('\n', '').strip()

js_code = f"""
// Add MPOB 36 Trial Plot dynamically
(function() {{
    const b64Data = "{b64_data}";
    const binaryStr = atob(b64Data);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {{
        bytes[i] = binaryStr.charCodeAt(i);
    }}

    // We must wait for shpjs to be available, or parse it directly if it is.
    const checkShp = setInterval(() => {{
        if (typeof window.shp !== 'undefined') {{
            clearInterval(checkShp);
            window.shp(bytes.buffer).then(function(geojson) {{
                geojson.mapName = 'MPOB Lahad Datu 36 Trial Plot';
                REAL_MAPS_DATA['mpob_36_trial'] = geojson;
                
                // Trigger map refresh if it's currently selected
                let compSelect = document.getElementById('map-select-comp');
                if (compSelect && compSelect.value === 'mpob_36_trial') {{
                    if (typeof loadShapeBoundaries === 'function') {{
                        loadShapeBoundaries('mpob_36_trial');
                    }}
                }}
            }}).catch(function(err) {{
                console.error("Failed to parse embedded 36 trial shapefile:", err);
            }});
        }}
    }}, 100);
}})();
"""

with open('js/comprehensive.js', 'a') as f:
    f.write('\n' + js_code + '\n')

print("Successfully injected!")
