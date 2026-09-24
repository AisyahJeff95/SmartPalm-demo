import os

b64_file = '/Users/drsitiaisyahjaafar/SmartPalm-demo/development/MPOBLahadDatu_36TrialPlot.b64'
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
    
    const checkShp = setInterval(() => {{
        if (typeof window.shp !== "undefined") {{
            clearInterval(checkShp);
            window.shp(bytes.buffer).then(function(geojson) {{
                if (Array.isArray(geojson)) geojson = geojson[0];
                geojson.mapName = "MPOB Lahad Datu 36 Trial Plot";
                REAL_MAPS_DATA["mpob_36_trial"] = geojson;
                
                ['map-select-comp', 'map-select-std'].forEach(selectId => {{
                    let select = document.getElementById(selectId);
                    if (select && !select.querySelector('option[value="mpob_36_trial"]')) {{
                        let opt = document.createElement('option');
                        opt.value = "mpob_36_trial";
                        opt.innerText = "MPOB Lahad Datu 36 Trial Plot";
                        select.appendChild(opt);
                    }}
                }});
            }}).catch(function(err) {{
                console.error("Failed to parse embedded 36 trial shapefile:", err);
            }});
        }}
    }}, 100);
}})();
"""

with open('/Users/drsitiaisyahjaafar/SmartPalm-demo/development/js/comprehensive.js', 'a') as f:
    f.write('\n' + js_code + '\n')
