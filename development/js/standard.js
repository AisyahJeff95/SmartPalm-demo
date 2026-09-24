function calculateStandardCorrectiveDosage() {
            const container = document.getElementById('std-corrective-list');
            if (!container) return;

            const fert = (typeof STD_FERTILIZERS !== 'undefined' && STD_FERTILIZERS[selectedFertilizerIndex]) ? STD_FERTILIZERS[selectedFertilizerIndex] : { name: "MPOB F2 Super K", n: 7.0, p: 3.0, k: 30.0, mg: 0.0 };
            const nPct = fert.n / 100;
            const dosagePerPalm = (nPct > 0) ? (0.622 / nPct) : 8.89;
            const palmsPerBlock = 143;

            const nutrients = [
                { key: "N", pct: fert.n, actual: currentNutrients.N, target: 2.50, color: "#10b981" },
                { key: "P", pct: fert.p, actual: currentNutrients.P, target: 0.15, color: "#f59e0b" },
                { key: "K", pct: fert.k, actual: currentNutrients.K, target: 0.90, color: "#a855f7" },
                { key: "Mg", pct: fert.mg, actual: currentNutrients.Mg, target: 0.25, color: "#84cc16" }
            ];

            let html = "";
            nutrients.forEach(nut => {
                const nutPct = nut.pct / 100;
                const supplied = dosagePerPalm * nutPct;
                const deficitRatio = nut.actual < nut.target ? (nut.target / nut.actual) : 1.0;
                const targetVal = supplied * deficitRatio;
                const correctivePalm = Math.max(0, targetVal - supplied);
                const correctiveBlock = correctivePalm * palmsPerBlock;

                const valColor = correctivePalm > 0 ? '#10b981' : '#64748b';

                html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px;">
                    <span>
                        <strong style="color: ${nut.color}; font-family: monospace; font-size: 14px; margin-right: 4px;">${nut.key}</strong>
                        <span style="color: #e2e8f0; font-size: 12px;">Deficit</span>
                    </span>
                    <span style="font-family: monospace;">
                        <strong style="color: ${valColor}; font-size: 13px;">${correctiveBlock.toFixed(2)} kg</strong>
                        <span style="color: #94a3b8; font-size: 11px; margin-left: 4px;">(${correctivePalm.toFixed(2)} kg/palm)</span>
                    </span>
                </div>
                `;
            });

            container.innerHTML = html;
        }

        function updateFertilizerData(val) {
            selectedFertilizerIndex = parseInt(val, 10) || 0;
            calculateStandardCorrectiveDosage();
        }

        // Switch dropdown map change
        
        function openEdsInlandDialog() {
            document.getElementById('modal-eds-inland').classList.add('active');
        }

        function openEdsAlluvialDialog() {
            document.getElementById('modal-eds-alluvial').classList.add('active');
        }

        function closeEdsDialogs() {
            document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
        }

        // Open Full Map dialog popup
        function openFullMapNutrientDialog() {
            closeEdsDialogs();
            document.getElementById('modal-full-map').classList.add('active');
            setTimeout(() => { if (typeof fullMap !== 'undefined') fullMap.invalidateSize(); }, 100);
        }

        // standard Sentinel classification simulator
        function triggerSentinelClassification() {
            document.getElementById('sentinel-status').innerText = "Simulating: Fetching Sentinel-2 tiles. Please wait...";
            
            setTimeout(() => {
                document.getElementById('sentinel-status').innerText = "Sentinel-2 Classification successfully mapped to Map viewport!";
                // Highlight boundary polygons with green/yellow canopy indices
                stdBoundaryLayer.eachLayer(layer => {
                    let rnd = Math.random();
                    let color = (rnd > 0.5) ? "#2ecc71" : "#f1c40f";
                    layer.setStyle({
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.50
                    });
                });
            }, 1500);
        }

        // ReaDA System Tab Router
        function toggleReadaTab(tab) {
            document.querySelectorAll('.reada-tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.reada-tab-panel').forEach(p => p.style.display = 'none');
            
            event.target.classList.add('active');
            document.getElementById(`reada-tab-${tab}`).style.display = 'block';
        }

        // =========================================================================
        //  MPOB MEDS 1.1 MATHEMATICAL ENGINE IMPLEMENTATION (JS)
        // =========================================================================
        const rev_matrix = {
            0.0: {0.0: 0, 0.5: 376, 1.0: 680, 1.5: 888, 2.0: 1040, 2.5: 1136, 3.0: 1184, 3.5: 1200, 4.0: 1184, 4.5: 1144, 5.0: 1080},
            0.5: {0.0: 672, 0.5: 1104, 1.0: 1472, 1.5: 1728, 2.0: 1936, 2.5: 2080, 3.0: 2184, 3.5: 2240, 4.0: 2264, 4.5: 2264, 5.0: 2240},
            1.0: {0.0: 1216, 0.5: 1712, 1.0: 2136, 1.5: 2448, 2.0: 2720, 2.5: 2904, 3.0: 3056, 3.5: 3160, 4.0: 3232, 4.5: 3272, 5.0: 3288},
            1.5: {0.0: 1552, 0.5: 2088, 1.0: 2568, 1.5: 2928, 2.0: 3240, 2.5: 3472, 3.0: 3664, 3.5: 3808, 4.0: 3912, 4.5: 3984, 5.0: 4032},
            2.0: {0.0: 1800, 0.5: 2392, 1.0: 2920, 1.5: 3328, 2.0: 3688, 2.5: 3960, 3.0: 4200, 3.5: 4376, 4.0: 4528, 4.5: 4632, 5.0: 4712},
            2.5: {0.0: 1944, 0.5: 2576, 1.0: 3144, 1.5: 3592, 2.0: 3992, 2.5: 4296, 3.0: 4568, 3.5: 4776, 4.0: 4952, 4.5: 5088, 5.0: 5200},
            3.0: {0.0: 2032, 0.5: 2704, 1.0: 3320, 1.5: 3808, 2.0: 4240, 2.5: 4584, 3.0: 4896, 3.5: 5136, 4.0: 5344, 4.5: 5504, 5.0: 5648},
            3.5: {0.0: 2064, 0.5: 2776, 1.0: 3424, 1.5: 3944, 2.0: 4408, 2.5: 4784, 3.0: 5120, 3.5: 5384, 4.0: 5624, 4.5: 5808, 5.0: 5968},
            4.0: {0.0: 2072, 0.5: 2816, 1.0: 3504, 1.5: 4048, 2.0: 4552, 2.5: 4952, 3.0: 5320, 3.5: 5608, 4.0: 5872, 4.5: 6080, 5.0: 6264},
            4.5: {0.0: 2056, 0.5: 2832, 1.0: 3544, 1.5: 4120, 2.0: 4640, 2.5: 5064, 3.0: 5456, 3.5: 5768, 4.0: 6048, 4.5: 6272, 5.0: 6480},
            5.0: {0.0: 2024, 0.5: 2824, 1.0: 3568, 1.5: 4168, 2.0: 4720, 2.5: 5160, 3.0: 5576, 3.5: 5904, 4.0: 6208, 4.5: 6456, 5.0: 6680},
            5.5: {0.0: 1984, 0.5: 2808, 1.0: 3568, 1.5: 4192, 2.0: 4760, 2.5: 5224, 3.0: 5656, 3.5: 6008, 4.0: 6328, 4.5: 6584, 5.0: 6824},
            6.0: {0.0: 1936, 0.5: 2776, 1.0: 3568, 1.5: 4208, 2.0: 4800, 2.5: 5280, 3.0: 5728, 3.5: 6096, 4.0: 6432, 4.5: 6704, 5.0: 6960}
        };

        const n_rates = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0];
        const k_rates = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

        let activeOutputData = {
            yield: {},
            rev: {},
            crr: {}
        };

        let tempSelectedCell = { n: 1.0, k: 3.0, yield: 0, crr: 0 };

        function calculateEDSInland() {
            // Read inputs
            const age = parseFloat(document.getElementById('inland-age').value) || 12;
            const density = parseFloat(document.getElementById('inland-density').value) || 148;
            const drainage = parseFloat(document.getElementById('inland-drainage').value) || 1;
            const consistency = parseFloat(document.getElementById('inland-consistency').value) || 1;
            const slope = parseFloat(document.getElementById('inland-slope').value) || 0.5;
            const root = parseFloat(document.getElementById('inland-root').value) || 0.2;
            const organic = parseFloat(document.getElementById('inland-organic').value) || 2;
            const silt = parseFloat(document.getElementById('inland-silt').value) || 18;
            const extractable = parseFloat(document.getElementById('inland-extractable').value) || 0.13;
            const teb = parseFloat(document.getElementById('inland-teb').value) || 1.3;
            const rainfall = parseFloat(document.getElementById('inland-rainfall').value) || 2000;

            const cost_ffb = parseFloat(document.getElementById('inland-cost-ffb').value) || 800;
            const cost_sa = parseFloat(document.getElementById('inland-cost-sa').value) || 1200;
            const cost_kcl = parseFloat(document.getElementById('inland-cost-kcl').value) || 1600;

            // 1. Calculate Inland Baseline Yield
            let y_pot = 93.81 - (1.652 * age) - (0.1957 * density) - (9.101 * drainage) - (0.0116 * extractable);
            let k_ratio = teb !== 0 ? extractable / teb : 0.10;
            let rating = 9.823 - (5.221 * drainage) + (4.3 * organic) + (50.04 * k_ratio);
            let sf = rating > 0 ? rating / 18.206 : 1.0;
            let Y0 = 14.38 * sf * (y_pot / 35.919892);
            Y0 = parseFloat(Y0.toFixed(2));

            // Generate Grids
            generateEconomicGrid(Y0, density, cost_ffb, cost_sa, cost_kcl, 'Inland');
        }

        function calculateEDSAlluvial() {
            const clay = parseFloat(document.getElementById('alluvial-clay').value) || 45;
            const drainage = parseFloat(document.getElementById('alluvial-drainage').value) || 1;
            const density = parseFloat(document.getElementById('alluvial-density').value) || 148;
            const rainfall = parseFloat(document.getElementById('alluvial-rainfall').value) || 2000;
            
            const cost_ffb = parseFloat(document.getElementById('alluvial-cost-ffb').value) || 800;
            const cost_sa = parseFloat(document.getElementById('alluvial-cost-sa').value) || 1200;
            const cost_kcl = parseFloat(document.getElementById('alluvial-cost-kcl').value) || 1600;

            // Coastal Baseline Yield
            let Y0 = 20.44 - (3.022 * drainage) + (0.004535 * rainfall);
            Y0 = parseFloat(Y0.toFixed(2));

            generateEconomicGrid(Y0, density, cost_ffb, cost_sa, cost_kcl, 'Alluvial');
        }

        function generateEconomicGrid(Y0, density, cost_ffb, cost_sa, cost_kcl, soilType) {
            activeOutputData.yield = {};
            activeOutputData.rev = {};
            activeOutputData.crr = {};

            // Loop to fill grids
            for (let n of n_rates) {
                activeOutputData.yield[n] = {};
                activeOutputData.rev[n] = {};
                activeOutputData.crr[n] = {};
                for (let k of k_rates) {
                    let predicted_yield = 0;
                    if (soilType === 'Inland') {
                        let rev_gain = rev_matrix[n][k] || 0;
                        let added_yield = rev_gain / 800.0;
                        predicted_yield = Math.max(0.0, Y0 + added_yield);
                    } else {
                        // Alluvial Surface Formula
                        let val = 268.50 - (19.9268 * n) - (9.8243 * k) + (0.3884 * (n**2)) + (0.7609 * (n * k)) - (0.01409 * (n**2 * k));
                        let delta = val - 268.50;
                        predicted_yield = Math.max(0.0, Y0 + delta);
                    }
                    activeOutputData.yield[n][k] = parseFloat(predicted_yield.toFixed(2));
                }
            }

            let base_y = activeOutputData.yield[0.0][0.0];

            for (let n of n_rates) {
                for (let k of k_rates) {
                    let y = activeOutputData.yield[n][k];
                    let r_es = y - base_y;
                    let p_r = r_es * cost_ffb;
                    let t_c = ((n * density * cost_sa / 1000.0) + (k * density * cost_kcl / 1000.0));

                    activeOutputData.rev[n][k] = Math.round(p_r);

                    if (n === 0.0 && k === 0.0) {
                        activeOutputData.crr[n][k] = 0.0;
                    } else {
                        let crr_val = p_r <= 0 ? 0.0 : t_c / p_r;
                        activeOutputData.crr[n][k] = parseFloat(crr_val.toFixed(2));
                    }
                }
            }

            // Save EDS Calculation Details for Report Output
            reportData.soilType = soilType;
            reportData.palmAge = (soilType === 'Inland') ? document.getElementById('inland-age').value : 12;
            reportData.density = density;
            reportData.rainfall = (soilType === 'Inland') ? document.getElementById('inland-rainfall').value : document.getElementById('alluvial-rainfall').value;

            // Render output matrix tables
            renderOutputTable('yield');
            renderOutputTable('rev');
            renderOutputTable('crr');

            // Open output modal tab
            document.getElementById('output-modal-title').innerText = `EDS ${soilType} Soil Output Grid`;

            closeEdsDialogs();
            document.getElementById('modal-eds-output').classList.add('active');
            switchOutputTab('yield');
            selectGridCell(1.0, 3.0); // Select default optimal rate cell
        }

        // Render HTML Table Grid for Yield, Revenue, or CRR matrix outputs
        function renderOutputTable(tabType) {
            let container = document.getElementById(`${tabType}-table-container`);
            let data = activeOutputData[tabType];
            
            let html = `<div class="matrix-layout-container">
                <div class="matrix-x-label">K Fertilizer (kg/palm)</div>
                <div class="matrix-middle-row">
                    <div class="matrix-y-label">N Fertilizer (kg/palm)</div>
                    <div class="matrix-table-wrapper">
                        <table class="matrix-table">
                            <thead>
                                <tr>
                                    <th>N \\ K</th>`;
            for (let k of k_rates) {
                html += `<th data-col-header="${k.toFixed(1)}">${k.toFixed(1)}</th>`;
            }
            html += `</tr>
                            </thead>
                            <tbody>`;

            for (let n of n_rates) {
                html += `<tr>
                    <td class="row-header" data-row-header="${n.toFixed(1)}">${n.toFixed(1)}</td>`;
                for (let k of k_rates) {
                    let val = data[n][k];
                    let displayVal = (tabType === 'rev') ? `RM ${val}` : val.toFixed(2);
                    let cellClass = 'cell-item';
                    let crr_val = activeOutputData.crr[n][k];
                    
                    if (tabType === 'crr') {
                        if (Math.abs(val - 0.30) < 0.005) {
                            cellClass += ' crr-green';
                        } else if (val >= 0.275 && val <= 0.295) {
                            cellClass += ' crr-yellow';
                        }
                    } else { // yield or rev
                        if (Math.abs(crr_val - 0.30) < 0.005) {
                            cellClass += ' crr-grey';
                        }
                    }

                    html += `<td class="${cellClass}" data-n="${n.toFixed(1)}" data-k="${k.toFixed(1)}" onclick="selectGridCell(${n}, ${k})">${displayVal}</td>`;
                }
                html += `</tr>`;
            }
            html += `</tbody></table></div></div></div>`;
            container.innerHTML = html;
        }

        // Select and Highlight a cell inside Output grids
        function selectGridCell(n, k) {
            // Remove previous selections
            document.querySelectorAll('.matrix-table td.cell-item').forEach(el => el.classList.remove('selected'));
            document.querySelectorAll('.matrix-table th, .matrix-table td.row-header').forEach(el => el.classList.remove('header-highlighted'));
            
            // Highlight cells matching coordinates in all three grids
            let nStr = n.toFixed(1);
            let kStr = k.toFixed(1);
            document.querySelectorAll(`.matrix-table td.cell-item[data-n="${nStr}"][data-k="${kStr}"]`).forEach(el => el.classList.add('selected'));

            // Highlight corresponding column and row headers
            document.querySelectorAll(`.matrix-table th[data-col-header="${kStr}"]`).forEach(el => el.classList.add('header-highlighted'));
            document.querySelectorAll(`.matrix-table td.row-header[data-row-header="${nStr}"]`).forEach(el => el.classList.add('header-highlighted'));

            tempSelectedCell.n = n;
            tempSelectedCell.k = k;
            tempSelectedCell.yield = activeOutputData.yield[n][k];
            tempSelectedCell.crr = activeOutputData.crr[n][k];

            document.getElementById('selected-cell-lbl').innerText = `Selected treatment: N=${n.toFixed(1)} K=${k.toFixed(1)} (Yield: ${tempSelectedCell.yield} t/ha, CRR: ${tempSelectedCell.crr})`;
        }

        // Apply selections into global state
        function applySelectedTreatment() {
            reportData.nRate = tempSelectedCell.n;
            reportData.kRate = tempSelectedCell.k;
            reportData.yieldVal = tempSelectedCell.yield;
            reportData.crrVal = tempSelectedCell.crr;
            reportData.revenueVal = activeOutputData.rev[reportData.nRate][reportData.kRate];
            reportData.blockName = selectedBlock;

            closeEdsDialogs();
            alert(`Treatment successfully applied to ${selectedBlock}!\nN Rate: ${reportData.nRate} kg/palm\nK Rate: ${reportData.kRate} kg/palm\nYield Prediction: ${reportData.yieldVal} t/ha`);
        }

        // Output modal tabs Router
        function switchOutputTab(tab) {
            document.querySelectorAll('.output-tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.output-tab-panel').forEach(p => p.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(`panel-${tab}`).classList.add('active');
        }

        function viewPdfReportFromOutputModal() {
            // Apply the currently selected treatment
            reportData.nRate = tempSelectedCell.n;
            reportData.kRate = tempSelectedCell.k;
            reportData.yieldVal = tempSelectedCell.yield;
            reportData.crrVal = tempSelectedCell.crr;
            reportData.revenueVal = activeOutputData.rev[reportData.nRate][reportData.kRate];
            reportData.blockName = selectedBlock;
            
            // Close the modal
            closeEdsDialogs();
            
            // Open PDF Report Preview Dialog
            viewReportPDF(reportData.soilType);
        }

        // =========================================================================
        //  PDF REPORT GENERATION SERVICE (html2pdf)
        // =========================================================================
        function viewReportPDF(soilMode) {
            let printArea = document.getElementById('report-preview-body');
            printArea.style.padding = '20px 10px';
            printArea.style.fontFamily = 'unset';
            printArea.style.color = 'unset';

            let fert = (typeof STD_FERTILIZERS !== 'undefined' && STD_FERTILIZERS[selectedFertilizerIndex]) ? STD_FERTILIZERS[selectedFertilizerIndex] : { name: "MPOB F2 Super K", n: 7.0, p: 3.0, k: 30.0, mg: 0.0 };
            
            // Standard report calculations
            let nPct = fert.n / 100;
            let dosagePerPalm = (nPct > 0) ? (0.622 / nPct) : 8.89;
            let reqPerHaMT = (dosagePerPalm * 143) / 1000;
            
            let n_kg_palm = dosagePerPalm * (fert.n/100);
            let n_kg_ha = n_kg_palm * 143;
            let p_kg_palm = dosagePerPalm * (fert.p/100);
            let p_kg_ha = p_kg_palm * 143;
            let k_kg_palm = dosagePerPalm * (fert.k/100);
            let k_kg_ha = k_kg_palm * 143;
            let mg_kg_palm = dosagePerPalm * (fert.mg/100);
            let mg_kg_ha = mg_kg_palm * 143;

            let nutrients = [
                { key: "N", actual: currentNutrients.N, target: 2.5000, pct: fert.n },
                { key: "P", actual: currentNutrients.P, target: 0.1500, pct: fert.p },
                { key: "K", actual: currentNutrients.K, target: 0.9000, pct: fert.k },
                { key: "Mg", actual: currentNutrients.Mg, target: 0.2500, pct: fert.mg }
            ];

            let now = new Date();
            let dateStr = now.toLocaleDateString('en-GB') + ', ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();
            let mapVal = document.getElementById('map-select-std') ? document.getElementById('map-select-std').value : 'lahad_datu';
            
            let estate_name_input = document.getElementById('std-estate-name') ? document.getElementById('std-estate-name').value.trim() : '';
            let estate_name = estate_name_input;
            if (!estate_name) {
                if (mapVal === 'lahad_datu') {
                    estate_name = 'Lahad Datu with block boundary';
                } else if (mapVal === 'seraya') {
                    estate_name = 'Seraya with block boundary';
                } else if (mapVal.startsWith('custom_')) {
                    let opt = document.querySelector('#map-select-std option:checked');
                    if (opt) {
                        let text = opt.innerText;
                        let m = text.match(/Custom:\s*(.*?)(?:\.(?:zip|shp))?\s*\(/i);
                        if (m && m[1]) estate_name = m[1].trim();
                        else estate_name = text;
                    }
                }
            }
            if (!estate_name) estate_name = "Unknown Estate";

            let coords_str = `Lat=${selectedLat.toFixed(5)}, Lng=${selectedLng.toFixed(5)}`;
            
            // Draw full base64 map data
            let mapCanvas = document.querySelector('#map-std canvas.leaflet-zoom-animated');
            let sat_data_url = "";
            if (mapCanvas) {
                sat_data_url = mapCanvas.toDataURL("image/png");
            } else {
                let m = document.getElementById('map-std');
                if(m) {
                    sat_data_url = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='145' height='145'><rect width='145' height='145' fill='%23eee'/><text x='10' y='70' font-family='Arial' font-size='10' fill='%23333'>Map Unavailable</text></svg>";
                }
            }

            let htmlContent = `
            <style>
                .report-page {
                    width: 210mm;
                    height: 296.5mm;
                    margin: 0 auto 20px auto;
                    background: #ffffff;
                    padding: 15mm 20mm;
                    box-sizing: border-box;
                    font-family: 'Segoe UI', 'Inter', sans-serif;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    page-break-after: always;
                }
                @media print {
                    .report-page {
                        margin: 0;
                        box-shadow: none;
                        page-break-after: always;
                    }
                }
            </style>
            <!-- PAGE 1: High Level Summary -->
            <div class="report-page">
                <div style="border-bottom: 2.5px solid #2d6a4f; padding-bottom: 8px; margin-bottom: 14px;">
                  <h1 style="margin: 0; color: #2d6a4f; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Report</h1>
                  <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px;">MPOB - PALMNEX STANDARD SOIL ANALYSIS</div>
                </div>

                <!-- Top Section: Estate Info + Real Google Satellite Grid Map -->
                <div style="display: flex; gap: 14px; margin-bottom: 14px;">
                  <div style="flex: 1; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px;">
                    <h3 style="margin-top: 0; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: #0f172a;">Estate info</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #334155;">
                      <tr>
                        <td style="padding: 3px 0; width: 45%; color: #64748b;">- Name</td>
                        <td style="padding: 3px 0; font-weight: 700; color: #0f172a;">${estate_name}</td>
                      </tr>
                      <tr>
                        <td style="padding: 3px 0; color: #64748b;">- Location</td>
                        <td style="padding: 3px 0; font-weight: 600; color: #0f172a;">Lahad Datu, Sabah (${coords_str})</td>
                      </tr>
                      <tr>
                        <td style="padding: 3px 0; color: #64748b;">- Current fertilizer usage</td>
                        <td style="padding: 3px 0; font-weight: 600; color: #0f172a;">Standard MPOB Rates</td>
                      </tr>
                      <tr>
                        <td style="padding: 3px 0; color: #64748b;">- 1 block = 25 ha (basic)</td>
                        <td style="padding: 3px 0; font-weight: 700; color: #2d6a4f;">25.0 ha (${selectedBlock})</td>
                      </tr>
                    </table>
                  </div>

                  <!-- Full Lahad Datu Google Satellite Map Box -->
                  <div style="flex: 1; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; display: flex; align-items: center; justify-content: center;">
                    <div style="position: relative; width: 145px; height: 145px; border-radius: 6px; overflow: hidden; border: 2.5px solid #ff7800; box-shadow: 0 4px 10px rgba(0,0,0,0.15); background-color: #0b0f19;">
                      <img src="${sat_data_url}" style="width: 100%; height: 100%; object-fit: contain;" />
                    </div>
                  </div>
                </div>

                <!-- Middle Section: Report Table -->
                <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px;">
                  <h3 style="margin-top: 0; margin-bottom: 8px; font-size: 13px; font-weight: 700; color: #0f172a;">Report</h3>
                  
                  <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: center; margin-top: 10px;">
                    <thead>
                      <tr style="background-color: #f1f5f9; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 700;">
                        <th style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: left; width: 20%;">Element</th>
                        <th style="padding: 7px 8px; border: 1px solid #cbd5e1; width: 26%;">Leaf Analysis (avg%)</th>
                        <th style="padding: 7px 8px; border: 1px solid #cbd5e1; width: 27%;">Fert Recommendation (kg/palm)</th>
                        <th style="padding: 7px 8px; border: 1px solid #cbd5e1; width: 27%;">Fert Recommendation (kg/ha)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">N</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">Average per block (${currentNutrients.N.toFixed(2)}%)</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${n_kg_palm.toFixed(2)}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${n_kg_ha.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">P</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${currentNutrients.P.toFixed(3)}%</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${p_kg_palm.toFixed(2)}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${p_kg_ha.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">K</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${currentNutrients.K.toFixed(2)}%</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${k_kg_palm.toFixed(2)}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${k_kg_ha.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">Mg</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${currentNutrients.Mg.toFixed(3)}%</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${mg_kg_palm.toFixed(2)}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${mg_kg_ha.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div style="margin-top: 10px; font-size: 11px; font-weight: 700; color: #0f172a;">
                    Recommended Formulation:<br/>
                    <span style="color: #2d6a4f; font-weight: 700;">N:${fert.n}, P:${fert.p}, K:${fert.k}, Mg:${fert.mg}</span>
                  </div>
                </div>

                <!-- Bottom Section: Monthly Trend Chart & Stress Level Donut Chart -->
                <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; display: flex; gap: 14px; align-items: center;">
                  <!-- Monthly Trend Chart -->
                  <div style="flex: 1; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px;">
                    <div style="font-size: 9px; font-weight: 700; color: #64748b; margin-bottom: 6px;">Optimum Nutrient Analysis %</div>
                    <div style="display: flex; gap: 10px; font-size: 8px; font-weight: 700; margin-bottom: 8px;">
                      <span style="color: #0284c7;">■ May</span>
                      <span style="color: #0d9488;">■ June</span>
                      <span style="color: #ea580c;">■ July</span>
                    </div>
                    <div style="font-size: 9px; display: flex; flex-direction: column; gap: 6px;">
                      <div>
                        <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">N</div>
                        <div style="height: 5px; background: #0284c7; width: 75%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #0d9488; width: 78%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #ea580c; width: 72%; border-radius: 2px;"></div>
                      </div>
                      <div>
                        <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">P</div>
                        <div style="height: 5px; background: #0284c7; width: 80%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #0d9488; width: 82%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #ea580c; width: 85%; border-radius: 2px;"></div>
                      </div>
                      <div>
                        <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">K</div>
                        <div style="height: 5px; background: #0284c7; width: 88%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #0d9488; width: 90%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #ea580c; width: 95%; border-radius: 2px;"></div>
                      </div>
                      <div>
                        <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">Mg</div>
                        <div style="height: 5px; background: #0284c7; width: 85%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #0d9488; width: 88%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #ea580c; width: 92%; border-radius: 2px;"></div>
                      </div>
                    </div>
                  </div>

                  <!-- Stress Level Donut Chart -->
                  <div style="flex: 1; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 9px; display: flex; flex-direction: column; gap: 8px;">
                      <div style="font-weight: 700; color: #64748b;">Stress-level</div>
                      <div>
                        <div style="font-weight: 700; color: #ef4444;">Stressed</div>
                        <div style="color: #64748b;">10.0%</div>
                      </div>
                      <div>
                        <div style="font-weight: 700; color: #eab308;">Moderate</div>
                        <div style="color: #64748b;">30.0%</div>
                      </div>
                      <div>
                        <div style="font-weight: 700; color: #22c55e;">Healthy</div>
                        <div style="color: #64748b;">60.0%</div>
                      </div>
                    </div>

                    <svg width="110" height="110" viewBox="0 0 42 42">
                      <circle cx="21" cy="21" r="15.91549430918954" fill="#ffffff"></circle>
                      <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#e2e8f0" stroke-width="6"></circle>
                      <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#ef4444" stroke-width="6" stroke-dasharray="10 90" stroke-dashoffset="25"></circle>
                      <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#eab308" stroke-width="6" stroke-dasharray="30 70" stroke-dashoffset="15"></circle>
                      <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#22c55e" stroke-width="6" stroke-dasharray="60 40" stroke-dashoffset="-15"></circle>
                    </svg>
                  </div>
                </div>
            </div>
            `;
            printArea.innerHTML = htmlContent;
        }


        // Save previewed report as PDF
        function downloadPdfFromPreview() {
            let contentHtml = document.getElementById('report-preview-body').innerHTML;
            let tempArea = document.createElement('div');
            tempArea.innerHTML = contentHtml;
            
            let opt = {
                margin:       0,
                filename:     `palmnex_agronomic_report_${selectedBlock.toLowerCase().replace(' ', '')}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            
            html2pdf().set(opt).from(tempArea).save();
        }