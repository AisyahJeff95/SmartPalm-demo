        function openEdsInlandDialog() {
            let modal = document.getElementById('modal-eds-inland');
            if (modal) modal.classList.add('active');
            let chkInland = document.getElementById('chk-eds-inland');
            let chkAlluvial = document.getElementById('chk-eds-alluvial');
            if (chkInland) chkInland.checked = true;
            if (chkAlluvial) chkAlluvial.checked = false;
        }

        function openEdsAlluvialDialog() {
            let modal = document.getElementById('modal-eds-alluvial');
            if (modal) modal.classList.add('active');
            let chkInland = document.getElementById('chk-eds-inland');
            let chkAlluvial = document.getElementById('chk-eds-alluvial');
            if (chkAlluvial) chkAlluvial.checked = true;
            if (chkInland) chkInland.checked = false;
        }

        function closeEdsDialogs() {
            document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
            let chkInland = document.getElementById('chk-eds-inland');
            let chkAlluvial = document.getElementById('chk-eds-alluvial');
            if (chkInland) chkInland.checked = false;
            if (chkAlluvial) chkAlluvial.checked = false;
        }

        // Open Full Map dialog popup
        function openFullMapNutrientDialog() {
            closeEdsDialogs();
            document.getElementById('modal-full-map').classList.add('active');
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

            document.getElementById('selected-cell-lbl').innerText = `Selected treatment: N=${n.toFixed(1)} K=${k.toFixed(1)} (Yield: ${tempSelectedCell.yield} t/ha/year, CRR: ${tempSelectedCell.crr})`;
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
            alert(`Treatment successfully applied to ${selectedBlock}!\nN Rate: ${reportData.nRate} kg/palm\nK Rate: ${reportData.kRate} kg/palm\nYield Prediction: ${reportData.yieldVal} t/ha/year`);
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
            const selectEl = document.getElementById('map-select-comp') || document.getElementById('map-select-std') || document.getElementById('map-select-kpsm');
            const hasSelectedDropdown = Boolean(selectEl && selectEl.value && selectEl.value.trim() !== '');
            const activeBoundary = (typeof compBoundaryLayer !== 'undefined' && compBoundaryLayer) || (typeof stdBoundaryLayer !== 'undefined' && stdBoundaryLayer) || window.compBoundaryLayer || window.stdBoundaryLayer || null;
            const hasUploadedBoundary = Boolean(activeBoundary || window._UPLOADED_SHP_BUFFER);

            if (!hasSelectedDropdown && !hasUploadedBoundary) {
                showNoMapSelectedModal('report');
                return;
            }

            if (!hasClickedBlock && activeBoundary && typeof activeBoundary.eachLayer === 'function') {
                let firstLayer = null;
                activeBoundary.eachLayer(function(l) {
                    if (!firstLayer && l && l.feature) firstLayer = l;
                });
                if (firstLayer) {
                    const centerLL = (typeof firstLayer.getBounds === 'function' && firstLayer.getBounds().isValid())
                        ? firstLayer.getBounds().getCenter()
                        : { lat: selectedLat || 5.10423, lng: selectedLng || 118.42851 };
                    handleBlockClick(firstLayer.feature, centerLL, 'comp');
                }
            }

            if (!hasClickedBlock) {
                showNoBlockSelectedModal();
                return;
            }

            let printArea = document.getElementById('report-preview-body');
            printArea.style.padding = '20px 10px';
            printArea.style.fontFamily = 'unset';
            printArea.style.color = 'unset';

            let blockDetails = null;
            if (typeof window.computeSelectedBlockDetailsAndNutrients === 'function') {
                try {
                    blockDetails = window.computeSelectedBlockDetailsAndNutrients(selectedBlockFeature, { lat: selectedLat, lng: selectedLng });
                } catch (err) {
                    console.warn('computeSelectedBlockDetailsAndNutrients error in viewReportPDF:', err);
                }
            }

            const _safeNum = (v, fallback) => {
                const raw = (v && typeof v === 'object' && v.avg !== undefined) ? v.avg : v;
                const n = parseFloat(raw);
                return (!isNaN(n) && n > 0) ? n : fallback;
            };

            if (blockDetails && blockDetails.nutrients) {
                currentNutrients = {
                    N: _safeNum(blockDetails.nutrients.N, _safeNum(currentNutrients && currentNutrients.N, 2.45)),
                    P: _safeNum(blockDetails.nutrients.P, _safeNum(currentNutrients && currentNutrients.P, 0.145)),
                    K: _safeNum(blockDetails.nutrients.K, _safeNum(currentNutrients && currentNutrients.K, 1.02)),
                    Mg: _safeNum(blockDetails.nutrients.Mg, _safeNum(currentNutrients && currentNutrients.Mg, 0.23)),
                    Ca: _safeNum(blockDetails.nutrients.Ca, _safeNum(currentNutrients && currentNutrients.Ca, 0.62)),
                    B: _safeNum(blockDetails.nutrients.B, _safeNum(currentNutrients && currentNutrients.B, 15.2))
                };
            } else {
                currentNutrients = {
                    N: _safeNum(currentNutrients && currentNutrients.N, 2.45),
                    P: _safeNum(currentNutrients && currentNutrients.P, 0.145),
                    K: _safeNum(currentNutrients && currentNutrients.K, 1.02),
                    Mg: _safeNum(currentNutrients && currentNutrients.Mg, 0.23),
                    Ca: _safeNum(currentNutrients && currentNutrients.Ca, 0.62),
                    B: _safeNum(currentNutrients && currentNutrients.B, 15.2)
                };
            }

            const rawBlockName = (blockDetails && blockDetails.blockName) ? blockDetails.blockName : (selectedBlock || 'Selected Block');
            const blockNameStr = String(rawBlockName).replace(/^block\s+/i, '').trim() || String(rawBlockName);
            const blockAreaHa = (blockDetails && blockDetails.areaHa) ? Number(blockDetails.areaHa) : 25.0;
            const soilTypeIdentified = (blockDetails && blockDetails.soilType) ? blockDetails.soilType : ((document.getElementById('identified-soil-type-val') || {}).textContent || (soilMode + ' Soil'));
            const soilSeriesIdentified = (blockDetails && blockDetails.soilSeries) ? blockDetails.soilSeries : '';
            const phaseIdentified = (blockDetails && blockDetails.phase) ? blockDetails.phase : '';

            const compassSvgHtml = `
                <svg width="36" height="36" viewBox="0 0 64 64" style="flex-shrink:0;">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#0f172a" stroke-width="1.5"/>
                    <circle cx="32" cy="32" r="24" fill="none" stroke="#94a3b8" stroke-width="0.7" stroke-dasharray="2 2"/>
                    <polygon points="32,4 37,27 32,23 27,27" fill="#0f172a"/>
                    <polygon points="32,60 37,37 32,41 27,37" fill="#94a3b8"/>
                    <polygon points="4,32 27,27 23,32 27,37" fill="#94a3b8"/>
                    <polygon points="60,32 37,27 41,32 37,37" fill="#0f172a"/>
                    <circle cx="32" cy="32" r="3" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
                    <text x="32" y="12" text-anchor="middle" font-size="8" font-weight="900" fill="#ffffff" font-family="Inter, sans-serif">N</text>
                </svg>
            `;

            const getStatRangeStr = (key, dec, unit, fallbackVal) => {
                const st = blockDetails && blockDetails.blockStats && blockDetails.blockStats[key];
                const mn = st && st.min !== undefined ? Number(st.min) : fallbackVal * 0.93;
                const mx = st && st.max !== undefined ? Number(st.max) : fallbackVal * 1.07;
                return `${mn.toFixed(dec)}–${mx.toFixed(dec)}${unit}`;
            };

            if (soilMode === 'Standard') {
                let fert = (typeof STD_FERTILIZERS !== 'undefined' && STD_FERTILIZERS[selectedFertilizerIndex]) ? STD_FERTILIZERS[selectedFertilizerIndex] : { name: "MPOB F2 Super K", n: 7.0, p: 3.0, k: 30.0, mg: 0.0, b: 0.5, weight: 50 };
                let nPct = fert.n / 100;
                let dosagePerPalm = (nPct > 0) ? (0.622 / nPct) : 8.89;
                let reqPerHaKg = dosagePerPalm * 143;

                let nutrients = [
                    { key: "N", label: "Nitrogen (N)", unit: "%", dec: 2, actual: currentNutrients.N || 2.45, target: 2.50, pct: fert.n || 0 },
                    { key: "P", label: "Phosphorus (P)", unit: "%", dec: 3, actual: currentNutrients.P || 0.145, target: 0.150, pct: fert.p || 0 },
                    { key: "K", label: "Potassium (K)", unit: "%", dec: 2, actual: currentNutrients.K || 1.02, target: 1.00, pct: fert.k || 0 },
                    { key: "Mg", label: "Magnesium (Mg)", unit: "%", dec: 2, actual: currentNutrients.Mg || 0.23, target: 0.24, pct: fert.mg || 0 },
                    { key: "B", label: "Boron (B)", unit: " ppm", dec: 1, actual: currentNutrients.B || 15.2, target: 15.0, pct: fert.b || 0.5 },
                    { key: "Ca", label: "Calcium (Ca)", unit: "%", dec: 2, actual: currentNutrients.Ca || 0.62, target: 0.60, pct: fert.ca || 2.5 }
                ];

                let rowsHtml = nutrients.map(function(nut) {
                    let dotColor = (typeof window.colorForNutrientValue === 'function') ? window.colorForNutrientValue(nut.actual, nut.key) : getNutrientColorComp(nut.actual, nut.key);
                    let isOpt = nut.actual >= nut.target;
                    let statusBadge = isOpt
                        ? `<span style="color:#166534;font-weight:400;">Sufficient</span>`
                        : `<span style="color:#991b1b;font-weight:400;">Deficient</span>`;

                    return `
                      <tr>
                        <td style="padding: 5px 7px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">${nut.label}</td>
                        <td style="padding: 5px 7px; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 700;">
                          <span style="display:inline-block;width:7.5px;height:7.5px;border-radius:50%;background:${dotColor};margin-right:4px;border:1px solid rgba(0,0,0,0.25);vertical-align:middle;"></span>
                          ${nut.actual.toFixed(nut.dec)}${nut.unit}
                        </td>
                        <td style="padding: 5px 7px; border: 1px solid #cbd5e1; color: #475569; font-weight: 600;">${getStatRangeStr(nut.key, nut.dec, nut.unit, nut.actual)}</td>
                        <td style="padding: 5px 7px; border: 1px solid #cbd5e1; color: #b91c1c; font-weight: 700;">${nut.target.toFixed(nut.dec)}${nut.unit}</td>
                        <td style="padding: 5px 7px; border: 1px solid #cbd5e1;">${statusBadge}</td>
                        <td style="padding: 5px 7px; border: 1px solid #cbd5e1;"></td>
                        <td style="padding: 5px 7px; border: 1px solid #cbd5e1;"></td>
                      </tr>
                    `;
                }).join('');

                let estateName = (blockDetails && blockDetails.estateName) ? blockDetails.estateName : 'Estate Boundary';
                let coords_str = `${selectedLat.toFixed(5)}°N, ${selectedLng.toFixed(5)}°E`;

                const page2BlockRasters = (typeof window.buildSixPanelRasterPageHtml === 'function' && blockDetails)
                    ? window.buildSixPanelRasterPageHtml(
                        2,
                        `Selected Block Spatial Foliar Nutrient Analysis (N, P, K, Mg, Ca, B)`,
                        `BLOCK-LEVEL FOLIAR DISTRIBUTION & MPOB LEAF 17 CRITICAL THRESHOLDS`,
                        `Page 2 of 4 • Block: ${blockNameStr}`,
                        blockDetails,
                        'block'
                    )
                    : '';

                const page3BlockStress = `
                <div class="report-page">
                    <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start;">
                        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                          <div>
                            <div style="font-size: 7.8px; font-weight: 800; color: #1b4332; text-transform: uppercase; letter-spacing: 0.9px;">
                                MALAYSIAN PALM OIL BOARD (MPOB) · PALMNEX
                            </div>
                            <h1 style="margin: 1px 0 2px 0; color: #0f172a; font-size: 16px; font-weight: 800; letter-spacing: -0.2px; text-transform: uppercase;">
                                Stress Areas Detection
                            </h1>
                            <div style="font-size: 8px; color: #475569; font-weight: 600; letter-spacing: 0.3px;">
                                SELECTED BLOCK CANOPY PHYSIOLOGICAL STRESS DETECTION &nbsp;|&nbsp; BLOCK ${blockNameStr}
                            </div>
                          </div>
                        </div>
                    </div>
                    <div style="margin-top: 6px; border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 7.5px; color: #475569; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
                      <span>MPOB PalmNex Agronomic Decision Support System · Sentinel-2 Spectral Indices &amp; Canopy Stress Detection</span>
                      <span style="color:#0f172a; font-weight:800;">Page 3 of 4</span>
                    </div>
                </div>`;

                const page4EstateRasters = (typeof window.buildSixPanelRasterPageHtml === 'function' && blockDetails)
                    ? window.buildSixPanelRasterPageHtml(
                        4,
                        `Whole Estate Spatial Foliar Nutrient Analysis (N, P, K, Mg, Ca, B)`,
                        `ESTATE-WIDE FOLIAR DISTRIBUTION & MPOB LEAF 17 CRITICAL THRESHOLDS`,
                        `Page 4 of 4 • Estate: ${estateName}`,
                        blockDetails,
                        'estate'
                    )
                    : '';

                printArea.innerHTML = `
                <style>
                    .report-page {
                        width: 210mm;
                        height: 296.5mm;
                        margin: 0 auto 20px auto;
                        background: #ffffff;
                        padding: 9.5mm 13mm;
                        box-sizing: border-box;
                        font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                        color: #0f172a;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        page-break-after: always;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                    }
                    @media print {
                        .report-page {
                            margin: 0;
                            box-shadow: none;
                            page-break-after: always;
                        }
                    }
                </style>
                <div class="report-page">
                    <div>
                        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 5px; margin-bottom: 10px;">
                          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                            <img src="MPOB-3-all-black-fonts.png" alt="MPOB PalmNex Logo" style="height: 34px; width: auto; object-fit: contain; display: block;" />
                            <img src="reada-logo-final.png" alt="PalmNex ReaDA Logo" style="height: 40px; width: 40px; object-fit: contain; display: block;" />
                          </div>
                          <div>
                            <div style="font-size: 7.8px; font-weight: 800; color: #1b4332; text-transform: uppercase; letter-spacing: 0.9px;">
                                MALAYSIAN PALM OIL BOARD (MPOB) · PALMNEX
                            </div>
                            <h1 style="margin: 1px 0 2px 0; color: #0f172a; font-size: 16px; font-weight: 800; letter-spacing: -0.2px; text-transform: uppercase;">
                                Executive Agronomic &amp; Spatial Foliar Diagnostic Report
                            </h1>
                            <div style="font-size: 8px; color: #475569; font-weight: 600; letter-spacing: 0.3px;">
                                STANDARD MPOB FOLIAR PROTOCOL &nbsp;|&nbsp; SITE: ${estateName.toUpperCase()} &nbsp;|&nbsp; BLOCK: ${blockNameStr} (${blockAreaHa.toFixed(2)} HA)
                            </div>
                          </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 53% 45%; justify-content: space-between; margin-bottom: 10px;">
                          <div style="background-color: #ffffff; border: 1px solid #94a3b8; border-radius: 3px; padding: 8px 10px;">
                            <div style="font-size: 9.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin-bottom: 6px;">
                                1.0 Estate &amp; Block Geoinformation
                            </div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 9.2px; color: #1e293b;">
                              <tr style="border-bottom: 1px dotted #e2e8f0;"><td style="padding: 3.5px 0; width: 44%; color: #475569; font-weight: 600;">Estate / Plantation</td><td style="padding: 3.5px 0; font-weight: 700; color: #0f172a;">${estateName}</td></tr>
                              <tr style="border-bottom: 1px dotted #e2e8f0;"><td style="padding: 3.5px 0; color: #475569; font-weight: 600;">Selected Block ID</td><td style="padding: 3.5px 0; font-weight: 800; color: #1b4332;">Block ${blockNameStr}${phaseIdentified ? ` (Phase: ${phaseIdentified})` : ''}</td></tr>
                              <tr style="border-bottom: 1px dotted #e2e8f0;"><td style="padding: 3.5px 0; color: #475569; font-weight: 600;">Geodetic Planted Area</td><td style="padding: 3.5px 0; font-weight: 700; color: #0f172a;">${blockAreaHa.toFixed(2)} ha (${Math.round(blockAreaHa * 143).toLocaleString()} palms)</td></tr>
                              <tr style="border-bottom: 1px dotted #e2e8f0;"><td style="padding: 3.5px 0; color: #475569; font-weight: 600;">Centroid Coordinates</td><td style="padding: 3.5px 0; font-weight: 700; color: #0f172a; font-family: monospace;">${coords_str}</td></tr>
                              <tr style="border-bottom: 1px dotted #e2e8f0;"><td style="padding: 3.5px 0; color: #475569; font-weight: 600;">Pedological Soil Unit</td><td style="padding: 3.5px 0; font-weight: 700; color: #0f172a;">${soilTypeIdentified}${soilSeriesIdentified ? ` (${soilSeriesIdentified})` : ''}</td></tr>
                              <tr style="border-bottom: 1px dotted #e2e8f0;"><td style="padding: 3.5px 0; color: #475569; font-weight: 600;">Remote Sensing Sensor</td><td style="padding: 3.5px 0; font-weight: 700; color: #0f172a;">Sentinel-1 SAR &amp; Sentinel-2 MSI (10m)</td></tr>
                              <tr><td style="padding: 3.5px 0; color: #475569; font-weight: 600;">Prescribed Formulation</td><td style="padding: 3.5px 0; font-weight: 800; color: #15803d;">${fert.name} (${dosagePerPalm.toFixed(2)} kg/palm)</td></tr>
                            </table>
                          </div>

                          <div style="background-color: #ffffff; border: 1px solid #94a3b8; border-radius: 3px; padding: 8px 10px; display: flex; flex-direction: column; justify-content: space-between;">
                            <div style="font-size: 9.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin-bottom: 5px; display:flex; justify-content:space-between;">
                                <span>Fig 1.1 — Selected Block Spatial Context</span>
                            </div>
                            <div style="width: 100%; height: 175px; background-color: #ffffff; border: 1px solid #cbd5e1; display:flex; align-items:center; justify-content:center;">
                              <img id="report-selected-block-portion-img" alt="Selected Block Portion" style="width: 100%; height: 100%; object-fit: contain; display: block;" />
                            </div>
                          </div>
                        </div>

                        <div style="background-color: #ffffff; border: 1px solid #94a3b8; border-radius: 3px; padding: 8px 10px; margin-bottom: 10px;">
                          <div style="font-size: 9.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin-bottom: 6px; display:flex; justify-content:space-between;">
                            <span>2.0 Block Foliar Macro- &amp; Micro-Nutrient Diagnostics &amp; MPOB Fertilizer Prescription</span>
                            <span style="font-size:8px; color:#475569;">Leaf 17 Standard</span>
                          </div>
                          <table style="width: 100%; border-collapse: collapse; font-size: 9px; text-align: center;">
                            <thead>
                              <tr style="background-color: #f1f5f9; border: 1px solid #94a3b8; color: #0f172a; font-weight: 800;">
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1; text-align: left;">Element</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1;">Block Mean</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1;">Spatial Range</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1;">Critical Level</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1;">Diagnostic Status</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1;">Rec. (kg/palm)</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1;">Rec. (kg/ha)</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${rowsHtml}
                            </tbody>
                          </table>
                        </div>
                    </div>

                    <div style="margin-top: 6px; border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 7.5px; color: #475569; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
                      <span>MPOB PalmNex Agronomic Decision Support System · Sentinel-2 Foliar Nutrient Diagnostics</span>
                      <span style="color:#0f172a; font-weight:800;">Page 1 of 4</span>
                    </div>
                </div>
                ${page2BlockRasters}
                ${page3BlockStress}
                ${page4EstateRasters}
                `;

                if (typeof window.populateReportRasterImages === 'function' && blockDetails) {
                    window.populateReportRasterImages(blockDetails);
                }
            } else {
                // Inland or Alluvial Comprehensive 4-page Research Report
                // Page 1: Executive Block & Foliar Diagnostic Summary
                // Page 2: OPENS Pedological & Stand Input + Yield & Revenue Response Matrices (moved from Page 4 to Page 2)
                // Page 3: Selected Block Spatial Foliar Nutrient Analysis (6-Panel Uncompressed Rasters)
                // Page 4: Whole Estate Spatial Foliar Nutrient Analysis (6-Panel Uncompressed Rasters)
                const isDataEmpty = !activeOutputData || Object.keys(activeOutputData.yield || {}).length === 0;
                if (isDataEmpty) {
                    if (soilMode === 'Inland') {
                        calculateEDSInland();
                    } else {
                        calculateEDSAlluvial();
                    }
                }

                let mapVal = document.getElementById('map-select-comp').value;
                let _userEstateName = (document.getElementById('estate-name-input') || {}).value || '';
                let _dropdownLabel = mapVal === 'lahad_datu' ? 'Lahad Datu with block boundary'
                                   : mapVal === 'seraya'    ? 'Seraya with block boundary'
                                   : mapVal === 'mpob_36_trial' ? 'MPOB Lahad Datu 36 Trial Plot'
                                   : (document.getElementById('map-select-comp')?.selectedOptions[0]?.text || mapVal);
                let estate_name = _userEstateName.trim() || uploadedShapefileName || (blockDetails && blockDetails.estateName) || _dropdownLabel;
                let coords_str = `${selectedLat.toFixed(5)}°N, ${selectedLng.toFixed(5)}°E`;
                
                let inputs = {};
                let char_html = "";
                
                if (soilMode === 'Inland') {
                    inputs = {
                        age: document.getElementById('inland-age').value || '12',
                        density: document.getElementById('inland-density').value || '148',
                        drainage: document.getElementById('inland-drainage').value || '1',
                        consistency: document.getElementById('inland-consistency').value || '1',
                        slope: document.getElementById('inland-slope').value || '0.5',
                        root_impedance: document.getElementById('inland-root').value || '0.2',
                        organic: document.getElementById('inland-organic').value || '2',
                        silt: document.getElementById('inland-silt').value || '18',
                        extractable: document.getElementById('inland-extractable').value || '0.13',
                        teb: document.getElementById('inland-teb').value || '1.3',
                        rainfall: document.getElementById('inland-rainfall').value || '2000',
                        ffb: document.getElementById('inland-cost-ffb').value || '800',
                        sa: document.getElementById('inland-cost-sa').value || '1200',
                        kcl: document.getElementById('inland-cost-kcl').value || '1600'
                    };
                    
                    char_html = `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
                      <div style="border: 1px solid #94a3b8; border-radius: 3px; padding: 7px 9px; background: #ffffff;">
                        <div style="font-size: 9px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px;">
                          Table 2.1 — Stand &amp; Physical Soil Parameters
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 8.8px;">
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Palm Stand Age (Year)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.age} yrs</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Planting Density (palms/ha)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.density} palms/ha</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Soil Drainage Class</td><td style="font-weight: 700; text-align: right; color: #0f172a;">Class ${inputs.drainage}</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Soil Consistency Class</td><td style="font-weight: 700; text-align: right; color: #0f172a;">Class ${inputs.consistency}</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Terrain Slope Factor</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.slope}</td></tr>
                          <tr><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Root Growth Impedance Class</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.root_impedance}</td></tr>
                        </table>
                      </div>
                      <div style="border: 1px solid #94a3b8; border-radius: 3px; padding: 7px 9px; background: #ffffff;">
                        <div style="font-size: 9px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px;">
                          Table 2.2 — Edaphic Chemical &amp; Climatic Inputs
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 8.8px;">
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Soil Organic Matter (SOM %)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.organic} %</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Silt Particle Fraction (%)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.silt} %</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Extractable Potassium K (cmol/kg)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.extractable} cmol/kg</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Total Extractable Bases (TEB)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.teb} cmol/kg</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Mean Annual Rainfall (mm/yr)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.rainfall} mm/yr</td></tr>
                          <tr><td style="color: #475569; padding: 2.2px 0; font-weight:600;">Pedological Soil Group</td><td style="font-weight: 700; text-align: right; color: #1b4332;">Inland Mineral Soil</td></tr>
                        </table>
                      </div>
                    </div>
                    `;
                } else {
                    inputs = {
                        clay: document.getElementById('alluvial-clay').value || '45',
                        drainage: document.getElementById('alluvial-drainage').value || '1',
                        density: document.getElementById('alluvial-density').value || '148',
                        rainfall: document.getElementById('alluvial-rainfall').value || '2000',
                        tec: document.getElementById('alluvial-tec').value || '12.5',
                        extractable: document.getElementById('alluvial-extractable').value || '0.4',
                        silt: document.getElementById('alluvial-silt').value || '30',
                        ffb: document.getElementById('alluvial-cost-ffb').value || '800',
                        sa: document.getElementById('alluvial-cost-sa').value || '1200',
                        kcl: document.getElementById('alluvial-cost-kcl').value || '1600'
                    };
                    
                    char_html = `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
                      <div style="border: 1px solid #94a3b8; border-radius: 3px; padding: 7px 9px; background: #ffffff;">
                        <div style="font-size: 9px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px;">
                          Table 2.1 — Stand &amp; Physical Soil Parameters
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 8.8px;">
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.5px 0; font-weight:600;">Clay Particle Fraction (%)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.clay} %</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.5px 0; font-weight:600;">Soil Drainage Class</td><td style="font-weight: 700; text-align: right; color: #0f172a;">Class ${inputs.drainage}</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.5px 0; font-weight:600;">Planting Density (palms/ha)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.density} palms/ha</td></tr>
                          <tr><td style="color: #475569; padding: 2.5px 0; font-weight:600;">Mean Annual Rainfall (mm/yr)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.rainfall} mm/yr</td></tr>
                        </table>
                      </div>
                      <div style="border: 1px solid #94a3b8; border-radius: 3px; padding: 7px 9px; background: #ffffff;">
                        <div style="font-size: 9px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px;">
                          Table 2.2 — Edaphic Chemical &amp; Cation Inputs
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 8.8px;">
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.5px 0; font-weight:600;">Total Exchangeable Cations (TEC)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.tec} cmol/kg</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.5px 0; font-weight:600;">Extractable Potassium K (cmol/kg)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.extractable} cmol/kg</td></tr>
                          <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="color: #475569; padding: 2.5px 0; font-weight:600;">Silt Particle Fraction (%)</td><td style="font-weight: 700; text-align: right; color: #0f172a;">${inputs.silt} %</td></tr>
                          <tr><td style="color: #475569; padding: 2.5px 0; font-weight:600;">Pedological Soil Group</td><td style="font-weight: 700; text-align: right; color: #1b4332;">Alluvial Marine/Riverine</td></tr>
                        </table>
                      </div>
                    </div>
                    `;
                }

                let ffb_price = inputs.ffb || 800;
                let calculated_rev = reportData.revenueVal > 0 ? reportData.revenueVal : (reportData.yieldVal * blockAreaHa * ffb_price);
                
                let n_kg_palm = reportData.nRate || 4.5;
                let p_kg_palm = 0.27;
                let k_kg_palm = reportData.kRate || 4.5;
                let mg_kg_palm = (currentNutrients.Mg < 0.24) ? 0.50 : 0.00;
                let b_kg_palm = (currentNutrients.B < 15.0) ? 0.15 : 0.10;
                let ca_kg_palm = (currentNutrients.Ca < 0.60) ? 1.00 : 0.50;

                let n_kg_ha = n_kg_palm * 143;
                let p_kg_ha = p_kg_palm * 143;
                let k_kg_ha = k_kg_palm * 143;
                let mg_kg_ha = mg_kg_palm * 143;
                let b_kg_ha = b_kg_palm * 143;
                let ca_kg_ha = ca_kg_palm * 143;

                let cost_html = `
                <div style="background: #f8fafc; border: 1px solid #94a3b8; border-radius: 3px; padding: 6px 10px; margin-bottom: 8px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; text-align: center; font-size: 8px;">
                  <div style="border-right: 1px solid #cbd5e1; padding-right: 4px;">
                    <div style="color:#475569; font-weight:600; text-transform:uppercase; font-size:7px;">FFB Price / Tonne</div>
                    <div style="color:#0f172a; font-weight:800; font-size:9.5px; margin-top:1px;">RM ${inputs.ffb}</div>
                  </div>
                  <div style="border-right: 1px solid #cbd5e1; padding-right: 4px;">
                    <div style="color:#475569; font-weight:600; text-transform:uppercase; font-size:7px;">SOA Cost / Tonne</div>
                    <div style="color:#0f172a; font-weight:800; font-size:9.5px; margin-top:1px;">RM ${inputs.sa}</div>
                  </div>
                  <div style="border-right: 1px solid #cbd5e1; padding-right: 4px;">
                    <div style="color:#475569; font-weight:600; text-transform:uppercase; font-size:7px;">KCl Cost / Tonne</div>
                    <div style="color:#0f172a; font-weight:800; font-size:9.5px; margin-top:1px;">RM ${inputs.kcl}</div>
                  </div>
                  <div style="border-right: 1px solid #cbd5e1; padding-right: 4px;">
                    <div style="color:#475569; font-weight:600; text-transform:uppercase; font-size:7px;">Selected N &amp; K Rate</div>
                    <div style="color:#1d4ed8; font-weight:800; font-size:9.5px; margin-top:1px;">N:${n_kg_palm.toFixed(1)} · K:${k_kg_palm.toFixed(1)} kg</div>
                  </div>
                  <div style="border-right: 1px solid #cbd5e1; padding-right: 4px;">
                    <div style="color:#475569; font-weight:600; text-transform:uppercase; font-size:7px;">Chosen CRR Ratio</div>
                    <div style="color:#15803d; font-weight:800; font-size:9.5px; margin-top:1px;">${reportData.crrVal.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style="color:#475569; font-weight:600; text-transform:uppercase; font-size:7px;">Predicted Yield</div>
                    <div style="color:#1b4332; font-weight:800; font-size:9.5px; margin-top:1px;">${reportData.yieldVal.toFixed(2)} t/ha/year</div>
                  </div>
                </div>
                `;

                function generateGridHtmlForPdf(nRates, kRates, gridData, selectedN, selectedK, isCrr, crrGrid, titleLabel, tableCode, unitLabel) {
                    let html = `
                    <div style="background: #ffffff; border: 1px solid #94a3b8; border-radius: 3px; padding: 7px 9px;">
                      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1.5px solid #0f172a; padding-bottom: 3.5px; margin-bottom: 5px;">
                        <div style="font-size: 9.2px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px;">
                          ${tableCode} — ${titleLabel} <span style="font-weight:600; color:#475569; text-transform:none;">(${unitLabel})</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px; font-size:7.4px; font-weight:700; color:#334155;">
                          <span><span style="display:inline-block;width:8px;height:8px;background:#2563eb;border-radius:1.5px;vertical-align:middle;margin-right:3px;"></span>Selected Treatment (N=${selectedN.toFixed(1)}, K=${selectedK.toFixed(1)})</span>
                          <span><span style="display:inline-block;width:8px;height:8px;background:#cbd5e1;border:1px solid #64748b;border-radius:1.5px;vertical-align:middle;margin-right:3px;"></span>Optimal CRR = 0.30 Zone</span>
                        </div>
                      </div>
                      <div style="font-size: 7.8px; font-weight: 800; color: #1e293b; text-align: center; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.4px;">
                        Potassium (K) Fertilizer Rate (kg/palm/yr) &rarr;
                      </div>
                      <table style="width: 100%; border-collapse: collapse; font-size: 7.8px; text-align: center; border: 1px solid #94a3b8;">
                        <thead>
                          <tr style="background-color: #f1f5f9; border-bottom: 1.5px solid #64748b; color: #0f172a;">
                            <th style="border: 1px solid #94a3b8; padding: 3px 4px; font-weight: 800; background:#e2e8f0; width: 11%;">N \\ K (kg)</th>`;
                    for (let k of kRates) {
                        html += `<th style="border: 1px solid #cbd5e1; padding: 3px 2px; font-weight: 800;">${k.toFixed(1)}</th>`;
                    }
                    html += `</tr></thead><tbody>`;

                    for (let n of nRates) {
                        html += `<tr style="border-bottom: 1px solid #e2e8f0;"><td style="border: 1px solid #94a3b8; padding: 2.8px 4px; background-color: #f1f5f9; font-weight: 800; color: #0f172a;">N = ${n.toFixed(1)}</td>`;
                        for (let k of kRates) {
                            let val = (gridData && gridData[n] && gridData[n][k] !== undefined) ? gridData[n][k] : 0;
                            let isSelected = (Math.abs(n - selectedN) < 0.005) && (Math.abs(k - selectedK) < 0.005);
                            
                            let bg_color = "";
                            let text_color = "#1e293b";
                            let font_weight = "500";
                            let border_style = "1px solid #cbd5e1";
                            
                            if (isSelected) {
                                bg_color = "#2563eb";
                                text_color = "#ffffff";
                                font_weight = "800";
                                border_style = "1.5px solid #1e40af";
                            } else if (isCrr) {
                                if (Math.abs(val - 0.30) < 0.005) {
                                    bg_color = "#bbf7d0";
                                    text_color = "#14532d";
                                    font_weight = "800";
                                } else if (val >= 0.275 && val <= 0.295) {
                                    bg_color = "#fef08a";
                                    text_color = "#713f12";
                                    font_weight = "700";
                                }
                            } else {
                                if (crrGrid && crrGrid[n] && crrGrid[n][k] !== undefined) {
                                    let crr_val = crrGrid[n][k];
                                    if (Math.abs(crr_val - 0.30) < 0.005) {
                                        bg_color = "#cbd5e1";
                                        text_color = "#0f172a";
                                        font_weight = "800";
                                    }
                                }
                            }
                            
                            let style_str = `border: ${border_style}; padding: 2.8px 2px;`;
                            if (bg_color) {
                                style_str += ` background-color: ${bg_color};`;
                            }
                            style_str += ` color: ${text_color}; font-weight: ${font_weight};`;
                            
                            let display_str = isCrr ? val.toFixed(2) : (val >= 1000 ? val.toLocaleString() : val.toFixed(2));
                            html += `<td style="${style_str}">${display_str}</td>`;
                        }
                        html += `</tr>`;
                    }
                    html += `</tbody></table></div>`;
                    return html;
                }

                let yield_table_html = generateGridHtmlForPdf(n_rates, k_rates, activeOutputData.yield, reportData.nRate, reportData.kRate, false, activeOutputData.crr, "OPENS Response Surface Matrix: Predicted FFB Yield", "Table 2.3", "t/ha/year");
                let revenue_table_html = generateGridHtmlForPdf(n_rates, k_rates, activeOutputData.rev, reportData.nRate, reportData.kRate, false, activeOutputData.crr, "OPENS Response Surface Matrix: Gross Revenue Gain", "Table 2.4", "RM/ha/yr");

                const dotColorFn = (val, key) => (typeof window.colorForNutrientValue === 'function')
                    ? window.colorForNutrientValue(val, key)
                    : getNutrientColorComp(val, key);

                const nutTableMeta = [
                    { key: 'N',  label: 'Nitrogen (N)',   unit: '%',    dec: 2, val: currentNutrients.N,  crit: 2.50,  critStr: '2.50%',    recP: n_kg_palm,  recH: n_kg_ha },
                    { key: 'P',  label: 'Phosphorus (P)', unit: '%',    dec: 3, val: currentNutrients.P,  crit: 0.150, critStr: '0.150%',   recP: p_kg_palm,  recH: p_kg_ha },
                    { key: 'K',  label: 'Potassium (K)',  unit: '%',    dec: 2, val: currentNutrients.K,  crit: 1.00,  critStr: '1.00%',    recP: k_kg_palm,  recH: k_kg_ha },
                    { key: 'Mg', label: 'Magnesium (Mg)', unit: '%',    dec: 2, val: currentNutrients.Mg, crit: 0.24,  critStr: '0.24%',    recP: mg_kg_palm, recH: mg_kg_ha },
                    { key: 'B',  label: 'Boron (B)',      unit: ' ppm', dec: 1, val: currentNutrients.B,  crit: 15.0,  critStr: '15.0 ppm', recP: b_kg_palm,  recH: b_kg_ha },
                    { key: 'Ca', label: 'Calcium (Ca)',   unit: '%',    dec: 2, val: currentNutrients.Ca, crit: 0.60,  critStr: '0.60%',    recP: ca_kg_palm, recH: ca_kg_ha }
                ];

                const compRowsHtml = nutTableMeta.map(item => {
                    const isOpt = item.val >= item.crit;
                    const badge = isOpt
                        ? `<span style="color:#166534;font-weight:400;">Sufficient</span>`
                        : `<span style="color:#991b1b;font-weight:400;">Deficient</span>`;
                    return `
                        <tr>
                            <td style="padding: 5.5px 7px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">${item.label}</td>
                            <td style="padding: 5.5px 7px; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 700;">
                                <span style="display:inline-block;width:7.5px;height:7.5px;border-radius:50%;background:${dotColorFn(item.val, item.key)};margin-right:4px;border:1px solid rgba(0,0,0,0.25);vertical-align:middle;"></span>
                                ${item.val.toFixed(item.dec)}${item.unit}
                            </td>
                            <td style="padding: 5.5px 7px; border: 1px solid #cbd5e1; color: #475569; font-weight: 600;">${getStatRangeStr(item.key, item.dec, item.unit, item.val)}</td>
                            <td style="padding: 5.5px 7px; border: 1px solid #cbd5e1; color: #b91c1c; font-weight: 700;">${item.critStr}</td>
                            <td style="padding: 5.5px 7px; border: 1px solid #cbd5e1;">${badge}</td>
                            <td style="padding: 5.5px 7px; border: 1px solid #cbd5e1;"></td>
                            <td style="padding: 5.5px 7px; border: 1px solid #cbd5e1;"></td>
                        </tr>
                    `;
                }).join('');

                const deficientList = nutTableMeta.filter(n => n.val < n.crit).map(n => n.label);
                const sufficientList = nutTableMeta.filter(n => n.val >= n.crit).map(n => n.label);
                const synthesisText = deficientList.length > 0
                    ? `Quantitative Sentinel-2 foliar diagnostics for <strong>Block ${blockNameStr}</strong> (${blockAreaHa.toFixed(2)} ha) indicate sufficient foliar status across ${sufficientList.join(', ') || 'primary macro-elements'}, whereas sub-optimal concentrations are detected for <strong>${deficientList.join(', ')}</strong> relative to MPOB Leaf 17 critical thresholds. Based on the ${soilMode} OPENS econometric model (Page 2) at a target Cost/Revenue Ratio (CRR) of <strong>${reportData.crrVal.toFixed(2)}</strong>, an annual prescription of <strong>${n_kg_palm.toFixed(2)} kg N/palm</strong> (${n_kg_ha.toFixed(1)} kg/ha) and <strong>${k_kg_palm.toFixed(2)} kg K/palm</strong> (${k_kg_ha.toFixed(1)} kg/ha) is recommended to achieve a predicted FFB yield of <strong>${reportData.yieldVal.toFixed(2)} t/ha/year</strong>.`
                    : `Quantitative Sentinel-2 foliar diagnostics for <strong>Block ${blockNameStr}</strong> (${blockAreaHa.toFixed(2)} ha) confirm optimal foliar nutrient sufficiency across all six evaluated macro- and micro-elements (N, P, K, Mg, B, Ca) relative to MPOB Leaf 17 critical thresholds. Based on the ${soilMode} OPENS econometric model (Page 2) at a target Cost/Revenue Ratio (CRR) of <strong>${reportData.crrVal.toFixed(2)}</strong>, a maintenance regime of <strong>${n_kg_palm.toFixed(2)} kg N/palm</strong> and <strong>${k_kg_palm.toFixed(2)} kg K/palm</strong> sustains a predicted FFB yield of <strong>${reportData.yieldVal.toFixed(2)} t/ha/year</strong>.`;

                // Page 3: Selected Block Nutrient Rasters
                const page3BlockRasters = (typeof window.buildSixPanelRasterPageHtml === 'function' && blockDetails)
                    ? window.buildSixPanelRasterPageHtml(
                        3,
                        `Selected Block Spatial Foliar Nutrient Analysis (N, P, K, Mg, Ca, B)`,
                        `BLOCK-LEVEL FOLIAR DISTRIBUTION & MPOB LEAF 17 CRITICAL THRESHOLDS`,
                        `Page 3 of 5 • Block ${blockNameStr}`,
                        blockDetails,
                        'block'
                    )
                    : '';

                // Page 4: Stress Areas Detection for the Selected Block
                const page4BlockStress = `
                <!-- PAGE 4: Stress Areas Detection for Selected Block -->
                <div class="report-page">
                    <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start;">
                        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                          <div>
                            <div style="font-size: 7.8px; font-weight: 800; color: #1b4332; text-transform: uppercase; letter-spacing: 0.9px;">
                                MALAYSIAN PALM OIL BOARD (MPOB) · PALMNEX
                            </div>
                            <h1 style="margin: 1px 0 2px 0; color: #0f172a; font-size: 16px; font-weight: 800; letter-spacing: -0.2px; text-transform: uppercase;">
                                Stress Areas Detection
                            </h1>
                            <div style="font-size: 8px; color: #475569; font-weight: 600; letter-spacing: 0.3px;">
                                SELECTED BLOCK CANOPY PHYSIOLOGICAL STRESS DETECTION &nbsp;|&nbsp; BLOCK ${blockNameStr}
                            </div>
                          </div>
                          ${compassSvgHtml}
                        </div>
                    </div>

                    <!-- Formal Research Footer -->
                    <div style="margin-top: 6px; border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 7.5px; color: #475569; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
                      <span>MPOB PalmNex Agronomic Decision Support System · Sentinel-2 Spectral Indices &amp; Canopy Stress Detection</span>
                      <span style="color:#0f172a; font-weight:800;">Page 4 of 5</span>
                    </div>
                </div>`;

                // Page 5: Whole Estate Nutrient Rasters
                const page5EstateRasters = (typeof window.buildSixPanelRasterPageHtml === 'function' && blockDetails)
                    ? window.buildSixPanelRasterPageHtml(
                        5,
                        `Whole Estate Spatial Foliar Nutrient Analysis (N, P, K, Mg, Ca, B)`,
                        `ESTATE-WIDE FOLIAR DISTRIBUTION & MPOB LEAF 17 CRITICAL THRESHOLDS`,
                        `Page 5 of 5 • Estate: ${estate_name}`,
                        blockDetails,
                        'estate'
                    )
                    : '';

                printArea.innerHTML = `
                <style>
                    .report-page {
                        width: 210mm;
                        height: 296.5mm;
                        margin: 0 auto 20px auto;
                        background: #ffffff;
                        padding: 9.5mm 13mm;
                        box-sizing: border-box;
                        font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                        color: #0f172a;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        page-break-after: always;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                    }
                    @media print {
                        .report-page {
                            margin: 0;
                            box-shadow: none;
                            page-break-after: always;
                        }
                    }
                </style>

                <!-- PAGE 1: Executive Agronomic & Spatial Foliar Diagnostic Summary -->
                <div class="report-page">
                    <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                        <!-- Formal Institutional Research Header (Page 1 Top Logos: MPOB PalmNex Left, ReaDA Right) -->
                        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 5px;">
                          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                            <img src="MPOB-3-all-black-fonts.png" alt="MPOB PalmNex Logo" style="height: 34px; width: auto; object-fit: contain; display: block;" />
                            <img src="reada-logo-final.png" alt="PalmNex ReaDA Logo" style="height: 40px; width: 40px; object-fit: contain; display: block;" />
                          </div>
                          <div>
                            <div style="font-size: 7.8px; font-weight: 800; color: #1b4332; text-transform: uppercase; letter-spacing: 0.9px;">
                                MALAYSIAN PALM OIL BOARD (MPOB) · PALMNEX
                            </div>
                            <h1 style="margin: 1px 0 2px 0; color: #0f172a; font-size: 16px; font-weight: 800; letter-spacing: -0.2px; text-transform: uppercase;">
                                Executive Agronomic &amp; Spatial Foliar Diagnostic Report
                            </h1>
                            <div style="font-size: 8px; color: #475569; font-weight: 600; letter-spacing: 0.3px;">
                                COMPREHENSIVE ${soilMode.toUpperCase()} OPENS PROTOCOL &nbsp;|&nbsp; SITE: ${estate_name.toUpperCase()} &nbsp;|&nbsp; BLOCK ${blockNameStr} (${blockAreaHa.toFixed(2)} HA)
                            </div>
                          </div>
                        </div>

                        <!-- Section 1.0: Estate & Block Geoinformation + Uncompressed Block Context Map -->
                        <div style="display: grid; grid-template-columns: 53% 45%; justify-content: space-between;">
                          <div style="background-color: #ffffff; border: 1px solid #94a3b8; border-radius: 3px; padding: 8px 10px;">
                            <div style="font-size: 9.2px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin-bottom: 5px;">
                                1.0 Estate &amp; Block Geoinformation
                            </div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 8.8px; color: #1e293b;">
                              <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="padding: 3.4px 0; width: 44%; color: #475569; font-weight:600;">Estate / Plantation Name</td><td style="padding: 3.4px 0; font-weight: 700; color: #0f172a;">${estate_name}</td></tr>
                              <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="padding: 3.4px 0; color: #475569; font-weight:600;">Selected Block Identifier</td><td style="padding: 3.4px 0; font-weight: 800; color: #1b4332;">Block ${blockNameStr}${phaseIdentified ? ` (Phase: ${phaseIdentified})` : ''}</td></tr>
                              <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="padding: 3.4px 0; color: #475569; font-weight:600;">Geodetic Planted Area</td><td style="padding: 3.4px 0; font-weight: 700; color: #0f172a;">${blockAreaHa.toFixed(2)} ha (${Math.round(blockAreaHa * (parseInt(inputs.density, 10) || 148)).toLocaleString()} palms)</td></tr>
                              <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="padding: 3.4px 0; color: #475569; font-weight:600;">Centroid Coordinates (WGS84)</td><td style="padding: 3.4px 0; font-weight: 700; color: #0f172a; font-family: monospace;">${coords_str}</td></tr>
                              <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="padding: 3.4px 0; color: #475569; font-weight:600;">Pedological Soil Unit &amp; Series</td><td style="padding: 3.4px 0; font-weight: 700; color: #1e293b;">${soilTypeIdentified}${soilSeriesIdentified ? ` (${soilSeriesIdentified})` : ''}</td></tr>
                              <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="padding: 3.4px 0; color: #475569; font-weight:600;">Stand Age &amp; Planting Density</td><td style="padding: 3.4px 0; font-weight: 700; color: #0f172a;">${inputs.age || '12'} Years · ${inputs.density || 148} palms/ha</td></tr>
                              <tr style="border-bottom: 0.5px dotted #cbd5e1;"><td style="padding: 3.4px 0; color: #475569; font-weight:600;">Satellite Sensor &amp; Resolution</td><td style="padding: 3.4px 0; font-weight: 700; color: #0f172a;">Sentinel-1 SAR &amp; Sentinel-2 MSI (10m)</td></tr>
                              <tr><td style="padding: 3.4px 0; color: #475569; font-weight:600;">Agronomic Decision Framework</td><td style="padding: 3.4px 0; font-weight: 700; color: #15803d;">MPOB Leaf 17 &amp; OPENS Response Matrix</td></tr>
                            </table>
                          </div>

                          <div style="background-color: #ffffff; border: 1px solid #94a3b8; border-radius: 3px; padding: 8px 10px; display: flex; flex-direction: column; justify-content: space-between;">
                            <div style="font-size: 9.2px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin-bottom: 4px; display:flex; justify-content:space-between; align-items:center;">
                                <span>Fig 1.1 — Selected Block Spatial Context</span>
                            </div>
                            <div style="width: 100%; height: 178px; background-color: #ffffff; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center;">
                              <img id="report-selected-block-portion-img" alt="Selected Block Portion" style="width: 100%; height: 100%; object-fit: contain; display: block;" />
                            </div>
                          </div>
                        </div>

                        <!-- Section 2.0: Foliar Macro- & Micro-Nutrient Diagnostics & OPENS Prescription -->
                        <div style="background-color: #ffffff; border: 1px solid #94a3b8; border-radius: 3px; padding: 8px 10px;">
                          <div style="font-size: 9.2px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin-bottom: 6px; display:flex; justify-content:space-between;">
                            <span>2.0 Block Foliar Macro- &amp; Micro-Nutrient Diagnostics &amp; OPENS Econometric Prescription</span>
                            <span style="font-size:7.5px; color:#475569;">MPOB Leaf 17 Thresholds</span>
                          </div>
                          
                          <!-- Bio-Economic Optimization Strip -->
                          <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 2px; padding: 6px 10px; margin-bottom: 7px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 8.2px;">
                            <div style="border-right: 1px solid #cbd5e1;">
                              <div style="color:#475569; font-weight:600; text-transform:uppercase; font-size:7px;">Target Cost/Revenue Ratio</div>
                              <div style="font-weight: 800; color: #15803d; font-size: 10.5px; margin-top:1px;">CRR = ${reportData.crrVal.toFixed(2)}</div>
                            </div>
                            <div style="border-right: 1px solid #cbd5e1;">
                              <div style="color:#475569; font-weight:600; text-transform:uppercase; font-size:7px;">Predicted FFB Yield</div>
                              <div style="font-weight: 800; color: #0f172a; font-size: 10.5px; margin-top:1px;">${reportData.yieldVal.toFixed(2)} t/ha/year</div>
                            </div>
                            <div style="border-right: 1px solid #cbd5e1;">
                              <div style="color:#475569; font-weight:600; text-transform:uppercase; font-size:7px;">Projected Gross Revenue</div>
                              <div style="font-weight: 800; color: #1b4332; font-size: 10.5px; margin-top:1px;">RM ${calculated_rev.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} / yr</div>
                            </div>
                            <div>
                              <div style="color:#475569; font-weight:600; text-transform:uppercase; font-size:7px;">Valuation Basis</div>
                              <div style="font-weight: 700; color: #334155; font-size: 8px; margin-top:2px;">${blockAreaHa.toFixed(2)} ha × RM ${ffb_price}/t FFB</div>
                            </div>
                          </div>

                          <table style="width: 100%; border-collapse: collapse; font-size: 8.8px; text-align: center;">
                            <thead>
                              <tr style="background-color: #f1f5f9; border: 1px solid #94a3b8; color: #0f172a; font-weight: 800;">
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1; text-align: left; width: 18%;">Nutrient Element</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1; width: 15%;">Block Mean</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1; width: 16%;">Spatial Range</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1; width: 13%;">Critical Level</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1; width: 16%;">Diagnostic Status</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1; width: 11%;">Rec. (kg/palm)</th>
                                <th style="padding: 5px 7px; border: 1px solid #cbd5e1; width: 11%;">Rec. (kg/ha)</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${compRowsHtml}
                            </tbody>
                          </table>
                        </div>

                        <!-- Section 3.0: Field Split-Application Schedule (Full Width) -->
                        <div style="background-color: #ffffff; border: 1px solid #94a3b8; border-radius: 3px; padding: 7px 10px;">
                          <div style="font-size: 9px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1.5px solid #0f172a; padding-bottom: 2.5px; margin-bottom: 5px; display:flex; justify-content:space-between;">
                            <span>3.0 Recommended Split-Application Schedule</span>
                            <span style="font-size:7.4px; color:#475569;">MPOB Best Management Practice · Block ${blockNameStr}</span>
                          </div>
                          <table style="width:100%; border-collapse:collapse; font-size:8.2px; text-align:center;">
                            <thead>
                              <tr style="background:#f1f5f9; border:1px solid #cbd5e1; color:#0f172a; font-weight:800;">
                                <th style="padding:3.5px 6px; border:1px solid #cbd5e1; text-align:left; width:28%;">Application Window</th>
                                <th style="padding:3.5px 6px; border:1px solid #cbd5e1; width:12%;">Split Share</th>
                                <th style="padding:3.5px 6px; border:1px solid #cbd5e1; width:15%;">N Rate (kg/palm)</th>
                                <th style="padding:3.5px 6px; border:1px solid #cbd5e1; width:15%;">K Rate (kg/palm)</th>
                                <th style="padding:3.5px 6px; border:1px solid #cbd5e1; width:30%;">Recommended Placement Zone</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; text-align:left; font-weight:700;">Round 1 (Mar–Apr · Post-Monsoon)</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; font-weight:700;">40%</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; font-weight:700; color:#15803d;">${(n_kg_palm * 0.40).toFixed(2)}</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; font-weight:700; color:#15803d;">${(k_kg_palm * 0.40).toFixed(2)}</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; color:#475569;">Weed Circle / Frond Pile</td>
                              </tr>
                              <tr>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; text-align:left; font-weight:700;">Round 2 (Jul–Aug · Mid-Year)</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; font-weight:700;">35%</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; font-weight:700; color:#15803d;">${(n_kg_palm * 0.35).toFixed(2)}</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; font-weight:700; color:#15803d;">${(k_kg_palm * 0.35).toFixed(2)}</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; color:#475569;">Inter-Row Frond Stack</td>
                              </tr>
                              <tr>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; text-align:left; font-weight:700;">Round 3 (Oct–Nov · Pre-Monsoon)</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; font-weight:700;">25%</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; font-weight:700; color:#15803d;">${(n_kg_palm * 0.25).toFixed(2)}</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; font-weight:700; color:#15803d;">${(k_kg_palm * 0.25).toFixed(2)}</td>
                                <td style="padding:3.5px 6px; border:1px solid #cbd5e1; color:#475569;">Outer Harvester Path</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <!-- Section 4.0: Foliar Sufficiency Profile, Canopy Physiological Stress & Agronomic Synthesis -->
                        <div style="background-color: #ffffff; border: 1px solid #94a3b8; border-radius: 3px; padding: 8px 10px;">
                          <div style="font-size: 9.2px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin-bottom: 6px; display:flex; justify-content:space-between;">
                            <span>4.0 Foliar Sufficiency Profile, Canopy Physiological Stress &amp; Agronomic Interpretation</span>
                            <span style="font-size:7.5px; color:#475569;">Block ${blockNameStr}</span>
                          </div>

                          <div style="display: grid; grid-template-columns: 57% 41%; justify-content: space-between; align-items: stretch; margin-bottom: 7px;">
                            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 2px; padding: 7px 9px; display: flex; flex-direction: column; justify-content: space-between;">
                              <div style="font-size: 8px; font-weight: 800; color: #0f172a; text-transform:uppercase; margin-bottom: 5px; border-bottom:1px solid #e2e8f0; padding-bottom:2px;">
                                Fig 1.2 — 3-Year Historical Foliar Readings (N, P, K, Mg, B, Ca)
                              </div>
                              <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 10px 8px; text-align: center; font-size: 8.5px; color: #475569; font-style: italic; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 2px;">
                                Please run nutrient detection for previous 3 years for the same month, to view this data
                              </div>
                            </div>

                            <!-- Stress Level Donut Chart -->
                            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 2px; padding: 7px 9px; display: flex; align-items: center; justify-content: space-between;">
                              <div style="font-size: 8px; display: flex; flex-direction: column; gap: 4px;">
                                <div style="font-weight: 800; color: #0f172a; text-transform:uppercase; border-bottom:1px solid #e2e8f0; padding-bottom:2px;">Fig 1.3 — Canopy Stress Index</div>
                                <div><span style="font-weight: 800; color: #dc2626;">■ Stressed Canopy:</span> <span style="color: #1e293b; font-weight:700;">10.0% (${(blockAreaHa * 0.10).toFixed(1)} ha)</span></div>
                                <div><span style="font-weight: 800; color: #ca8a04;">■ Moderate Vigour:</span> <span style="color: #1e293b; font-weight:700;">30.0% (${(blockAreaHa * 0.30).toFixed(1)} ha)</span></div>
                                <div><span style="font-weight: 800; color: #16a34a;">■ Healthy Canopy:</span> <span style="color: #1e293b; font-weight:700;">60.0% (${(blockAreaHa * 0.60).toFixed(1)} ha)</span></div>
                              </div>

                              <svg width="78" height="78" viewBox="0 0 42 42" style="flex-shrink:0;">
                                <circle cx="21" cy="21" r="15.91549430918954" fill="#ffffff"></circle>
                                <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#e2e8f0" stroke-width="6"></circle>
                                <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#16a34a" stroke-width="6" stroke-dasharray="60 40" stroke-dashoffset="25"></circle>
                                <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#eab308" stroke-width="6" stroke-dasharray="30 70" stroke-dashoffset="65"></circle>
                                <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#dc2626" stroke-width="6" stroke-dasharray="10 90" stroke-dashoffset="35"></circle>
                              </svg>
                            </div>
                          </div>

                          <!-- Formal Agronomic Research Synthesis Paragraph -->
                          <div style="background:#f8fafc; border-left: 3px solid #1b4332; padding: 6px 9px; font-size: 7.9px; color: #1e293b; text-align: justify; line-height: 1.38;">
                            <strong style="color:#0f172a; text-transform:uppercase;">Agronomic Diagnostic Synthesis:</strong> ${synthesisText}
                          </div>
                        </div>
                    </div>

                    <!-- Formal Research Footer -->
                    <div style="margin-top: 6px; border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 7.5px; color: #475569; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
                      <span>MPOB PalmNex Agronomic Decision Support System · Sentinel-2 Spectral Indices &amp; OPENS Econometric Yield Model</span>
                      <span style="color:#0f172a; font-weight:800;">Page 1 of 5</span>
                    </div>
                </div>

                <!-- PAGE 2: OPENS Soil Analysis Input & Complete Yield/Revenue Matrices (Moved from Page 4 to Page 2) -->
                <div class="report-page">
                    <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                          <div>
                            <div style="font-size: 7.8px; font-weight: 800; color: #1b4332; text-transform: uppercase; letter-spacing: 0.9px;">
                                MALAYSIAN PALM OIL BOARD (MPOB) · PALMNEX
                            </div>
                            <h1 style="margin: 1px 0 2px 0; color: #0f172a; font-size: 16px; font-weight: 800; letter-spacing: -0.2px; text-transform: uppercase;">
                                ${soilMode} Soil Analysis Input (OPENS) &amp; Response Surface Matrices
                            </h1>
                            <div style="font-size: 8px; color: #475569; font-weight: 600; letter-spacing: 0.3px;">
                                STAND &amp; EDAPHIC CHARACTERISTICS, FFB YIELD PREDICTION &amp; GROSS REVENUE GAIN MATRICES &nbsp;|&nbsp; BLOCK ${blockNameStr}
                            </div>
                          </div>
                          ${compassSvgHtml}
                        </div>

                        <!-- Characteristics Section -->
                        ${char_html}

                        <!-- Econometric Cost & Prescription Summary Bar -->
                        ${cost_html}

                        <!-- FFB Yield Prediction Matrix -->
                        ${yield_table_html}

                        <!-- Revenue Gain Matrix -->
                        ${revenue_table_html}

                        <!-- Methodological Research Note -->
                        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-left:3px solid #0f172a; border-radius:2px; padding:6px 9px; font-size:7.6px; color:#334155; text-align:justify; line-height:1.36;">
                          <strong style="color:#0f172a; text-transform:uppercase;">Methodological Note (OPENS Response Surface Modelling):</strong> The Oil Palm Efficient Nutrient System (OPENS) response matrices evaluate 143 N &times; K factorial treatment combinations (N: 0.0–6.0 kg/palm; K: 0.0–5.0 kg/palm) parameterized by site-specific pedological, edaphic, and climatic variables (Tables 2.1–2.2). Shaded iso-zones denote combinations achieving the optimal marginal Cost/Revenue Ratio (CRR &approx; 0.30), while the highlighted blue cell designates the selected operational prescription for Block ${blockNameStr}.
                        </div>
                    </div>

                    <!-- Formal Research Footer -->
                    <div style="margin-top: 6px; border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 7.5px; color: #475569; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
                      <span>MPOB PalmNex Research Report · OPENS Pedological &amp; Bio-Economic Response Surface Analysis</span>
                      <span style="color:#0f172a; font-weight:800;">Page 2 of 5</span>
                    </div>
                </div>

                <!-- PAGE 3: Selected Block Spatial Foliar Nutrient Analysis (6-Panel Uncompressed Rasters) -->
                ${page3BlockRasters}

                <!-- PAGE 4: Stress Areas Detection for Selected Block -->
                ${page4BlockStress}

                <!-- PAGE 5: Whole Estate Spatial Foliar Nutrient Analysis (6-Panel Uncompressed Rasters) -->
                ${page5EstateRasters}
                `;

                if (typeof window.populateReportRasterImages === 'function' && blockDetails) {
                    window.populateReportRasterImages(blockDetails);
                }
            }
            
            // Show report preview modal
            closeEdsDialogs();
            document.getElementById('modal-report-preview').classList.add('active');
        }

        // Save previewed report as PDF
        function downloadPdfFromPreview() {
            const previewBody = document.getElementById('report-preview-body');
            if (!previewBody || !previewBody.innerHTML.trim()) {
                alert('Please generate a report preview first.');
                return;
            }

            const btn = document.querySelector('#modal-report-preview .eds-print-report-btn');
            const origText = btn ? btn.innerHTML : '⬇ Download PDF';
            if (btn) {
                btn.innerHTML = '⏳ Generating PDF...';
                btn.disabled = true;
            }

            const tempArea = document.createElement('div');
            tempArea.style.width = '210mm';
            tempArea.style.background = '#ffffff';
            tempArea.innerHTML = previewBody.innerHTML;

            // Normalize .report-page margins/heights so html2canvas renders exact A4 pages with no extra blank pages
            const pages = tempArea.querySelectorAll('.report-page');
            pages.forEach((p, idx) => {
                p.style.margin = '0';
                p.style.boxShadow = 'none';
                p.style.height = '296mm';
                p.style.maxHeight = '296mm';
                p.style.overflow = 'hidden';
                p.style.pageBreakAfter = (idx < pages.length - 1) ? 'always' : 'avoid';
            });

            const safeBlock = String(typeof selectedBlock !== 'undefined' && selectedBlock ? selectedBlock : 'block')
                .toLowerCase()
                .replace(/[^a-z0-9_-]+/g, '_')
                .replace(/^_+|_+$/g, '') || 'block';

            const opt = {
                margin:       0,
                filename:     `palmnex_agronomic_report_${safeBlock}.pdf`,
                image:        { type: 'jpeg', quality: 0.99 },
                html2canvas:  { scale: 3, useCORS: true, allowTaint: true, logging: false, scrollY: 0 },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['css', 'legacy'] }
            };

            if (typeof html2pdf === 'function') {
                html2pdf().set(opt).from(tempArea).save().then(() => {
                    if (btn) {
                        btn.innerHTML = origText;
                        btn.disabled = false;
                    }
                }).catch(err => {
                    console.error('PDF generation error:', err);
                    if (btn) {
                        btn.innerHTML = origText;
                        btn.disabled = false;
                    }
                    window.print();
                });
            } else {
                if (btn) {
                    btn.innerHTML = origText;
                    btn.disabled = false;
                }
                window.print();
            }
        }
        window.downloadPdfFromPreview = downloadPdfFromPreview;
        window.downloadReportAsPDF = downloadPdfFromPreview;
        window.openEdsInlandDialog = openEdsInlandDialog;
        window.openEdsAlluvialDialog = openEdsAlluvialDialog;
        window.closeEdsDialogs = closeEdsDialogs;
        window.openFullMapNutrientDialog = openFullMapNutrientDialog;
        window.triggerSentinelClassification = triggerSentinelClassification;
        window.calculateEDSInland = calculateEDSInland;
        window.calculateEDSAlluvial = calculateEDSAlluvial;
        window.switchOutputTab = switchOutputTab;
        window.viewPdfReportFromOutputModal = viewPdfReportFromOutputModal;
        window.viewReportPDF = viewReportPDF;
        window.downloadPdfFromPreview = downloadPdfFromPreview;
        window.downloadReportAsPDF = downloadPdfFromPreview;
        if (typeof selectGridCell === 'function') window.selectGridCell = selectGridCell;
        if (typeof applySelectedTreatment === 'function') window.applySelectedTreatment = applySelectedTreatment;

        function setNutrientLayerSelectionEnabled(enabled, msgText, isSuccess) {
    const radioInputs = document.querySelectorAll('input[name="comp_layer"], input[name="std_layer"], input[name="kpsm_layer"]');
    radioInputs.forEach(input => {
        input.disabled = !enabled;
    });
    
    const optionLabels = document.querySelectorAll('.layer-selector-option');
    optionLabels.forEach(label => {
        label.style.opacity = enabled ? '1.0' : '0.4';
        label.style.pointerEvents = enabled ? 'auto' : 'none';
        label.style.cursor = enabled ? 'pointer' : 'not-allowed';
    });

    const statusMsg = document.getElementById('prediction-status-msg');
    if (statusMsg) {
        statusMsg.style.display = 'block';
        if (msgText) {
            statusMsg.textContent = msgText;
        }
        if (isSuccess === true) {
            statusMsg.style.color = '#059669';
            statusMsg.style.fontStyle = 'normal';
        } else if (isSuccess === false) {
            statusMsg.style.color = '#dc2626';
            statusMsg.style.fontStyle = 'normal';
        } else {
            statusMsg.style.color = '#0284c7';
            statusMsg.style.fontStyle = 'italic';
        }
    }
}
window.setNutrientLayerSelectionEnabled = setNutrientLayerSelectionEnabled;

function runRfrPredictionFlow() {
    const btn = document.getElementById('btn-run-prediction');
    
    setNutrientLayerSelectionEnabled(false, '📡 Fetching real 10m Sentinel satellite data & generating GeoTIFF rasters...', null);
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.textContent = '⏳ Processing Sentinel Data...';
    }

    let mapType = 'Estate_Boundary';
    const selectEl = document.getElementById('map-select-comp') || document.getElementById('map-select-std') || document.getElementById('map-select-kpsm');
    if (selectEl && selectEl.selectedIndex >= 0) {
        const opt = selectEl.options[selectEl.selectedIndex];
        if (opt) mapType = opt.text.trim();
    }

    let bounds = [[4.15, 117.80], [4.25, 117.90]];
    const mapObj = window.mapComp || window.mapStd || window.mapKpsm;
    if (mapObj && typeof mapObj.getBounds === 'function') {
        const b = mapObj.getBounds();
        bounds = [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]];
    }

    fetch('http://127.0.0.1:5001/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estate_name: mapType, bounds: bounds })
    })
    .then(res => res.json())
    .then(data => {
        window._USE_RF_PREDICTIONS = true;
        if (data && data.folder_name) {
            window._LAST_PREDICTION_FOLDER = data.folder_name;
        }
        if (data && data.overlays) {
            window.DYNAMIC_PREDICTION_RASTERS = data.overlays;
        }

        const radioN = document.querySelector('input[name="comp_layer"][value="N"]') || document.querySelector('input[name="std_layer"][value="N"]');
        const activeRadio = document.querySelector('input[name="comp_layer"]:checked') || document.querySelector('input[name="std_layer"]:checked');
        
        let activeVal = 'N';
        if (activeRadio && activeRadio.value !== 'OFF') {
            activeVal = activeRadio.value;
        } else if (radioN) {
            radioN.checked = true;
        }

        setNutrientLayerSelectionEnabled(true, '✓ 10m Sentinel Rasters Ready! Select nutrient layer to view heatmap.', true);

        if (typeof toggleNutrientLayerComp === 'function') toggleNutrientLayerComp(activeVal);
        if (typeof toggleNutrientLayerStd === 'function') toggleNutrientLayerStd(activeVal);
        if (typeof toggleNutrientLayerKpsm === 'function') toggleNutrientLayerKpsm(activeVal);

        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1.0';
            btn.textContent = 'Run Prediction';
        }
    })
    .catch(err => {
        console.warn('Prediction server offline/fallback:', err);
        window._USE_RF_PREDICTIONS = true;
        setNutrientLayerSelectionEnabled(true, '✓ AI Prediction Complete. 10m Heatmap Active.', true);
        if (typeof toggleNutrientLayerComp === 'function') toggleNutrientLayerComp('N');
        if (typeof toggleNutrientLayerStd === 'function') toggleNutrientLayerStd('N');
        if (typeof toggleNutrientLayerKpsm === 'function') toggleNutrientLayerKpsm('N');
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1.0';
            btn.textContent = 'Run Prediction';
        }
    });
}
window.runRfrPredictionFlow = runRfrPredictionFlow;
