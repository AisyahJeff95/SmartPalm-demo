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
        