/* =============================================================================
 * Full Map Nutrient Detection — side-by-side raster viewer
 * -----------------------------------------------------------------------------
 * Opened by the "View Full Map of Nutrient Detection" button.
 * Shows N, P, K, Mg, Ca, B colour rasters for the currently selected map in a
 * popup grid, each with a label, boundary outline, legend and Mean/Min/Max.
 *
 * Raster source priority mirrors toggleNutrientLayerComp():
 *   1. Prebuilt Sekinchan 1 Poly   (RASTER_OVERLAYS_SEKINCHAN)
 *   2. Latest "Run Prediction"     (window.DYNAMIC_PREDICTION_RASTERS)
 *   3. Lahad Datu static rasters   (RASTER_OVERLAYS)
 *   4. Ladang PPPTAR rasters       (RASTER_OVERLAYS_PPPTAR)
 * ========================================================================== */
(function () {
    'use strict';

    // Same colour classes as training_v3/predict_nutrients.py and the map legends
    const CLASS_COLORS = ['#ff0000', '#ff9900', '#ffff00', '#00dc00', '#0066ff', '#995522'];
    const NUTRIENT_PANELS = [
        { key: 'N',  name: 'Nitrogen',   unit: '%',   breaks: [2.10, 2.30, 2.50, 2.70, 2.90],      dp: 2 },
        { key: 'P',  name: 'Phosphorus', unit: '%',   breaks: [0.120, 0.135, 0.150, 0.165, 0.180], dp: 3 },
        { key: 'K',  name: 'Potassium',  unit: '%',   breaks: [0.70, 0.85, 1.00, 1.15, 1.30],      dp: 2 },
        { key: 'Mg', name: 'Magnesium',  unit: '%',   breaks: [0.20, 0.22, 0.24, 0.26, 0.28],      dp: 2 },
        { key: 'Ca', name: 'Calcium',    unit: '%',   breaks: [0.40, 0.50, 0.60, 0.75, 0.90],      dp: 2 },
        { key: 'B',  name: 'Boron',      unit: 'ppm', breaks: [10, 15, 20, 30, 40],                dp: 0 }
    ];

    // ---------------------------------------------------------------- styles
    function injectStyles() {
        if (document.getElementById('ngm-styles')) return;
        const css = `
        .ngm-overlay{position:fixed;inset:0;z-index:10000001;display:none;align-items:center;justify-content:center;
            padding:24px;box-sizing:border-box;background:rgba(8,15,30,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
        .ngm-overlay.ngm-open{display:flex;animation:ngmFade .18s ease-out;}
        .ngm-dialog{width:min(1280px,100%);max-height:100%;display:flex;flex-direction:column;background:#f8fafc;border-radius:16px;
            overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.45);animation:ngmPop .22s cubic-bezier(.2,.9,.3,1.2);}
        .ngm-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 20px;flex-shrink:0;
            background:linear-gradient(135deg,#047857 0%,#065f46 60%,#064e3b 100%);color:#fff;}
        .ngm-title-wrap{display:flex;align-items:center;gap:12px;min-width:0;}
        .ngm-icon{width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
        .ngm-title{font-family:'Outfit','Inter',sans-serif;font-weight:700;font-size:17px;letter-spacing:-.2px;margin:0;}
        .ngm-sub{font-family:'Inter',sans-serif;font-size:12px;color:rgba(255,255,255,.78);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .ngm-close{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);color:#fff;width:36px;height:36px;border-radius:9px;
            font-size:17px;cursor:pointer;flex-shrink:0;transition:background .2s,transform .2s;}
        .ngm-close:hover{background:rgba(255,255,255,.3);transform:rotate(90deg);}
        .ngm-body{overflow:auto;padding:18px;}
        .ngm-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;}
        @media (max-width:1100px){.ngm-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
        @media (max-width:640px){.ngm-grid{grid-template-columns:1fr;}.ngm-overlay{padding:8px;}}
        .ngm-card{margin:0;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;
            box-shadow:0 1px 3px rgba(15,23,42,.06);transition:transform .18s,box-shadow .18s;animation:ngmRise .3s ease-out both;}
        .ngm-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(15,23,42,.12);}
        .ngm-card-head{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #f1f5f9;}
        .ngm-badge{min-width:40px;height:40px;padding:0 6px;box-sizing:border-box;border-radius:10px;display:flex;align-items:center;justify-content:center;
            font-family:'Outfit','Inter',sans-serif;font-weight:800;font-size:19px;color:#fff;background:linear-gradient(135deg,#059669,#047857);}
        .ngm-name{font-family:'Outfit','Inter',sans-serif;font-weight:700;font-size:14px;color:#0f172a;line-height:1.1;}
        .ngm-unit{font-family:'Inter',sans-serif;font-size:11px;color:#64748b;margin-top:2px;}
        .ngm-stats{margin-left:auto;text-align:right;font-family:'Inter',sans-serif;font-size:11px;color:#475569;line-height:1.35;}
        .ngm-stats b{color:#0f172a;font-weight:700;}
        .ngm-canvas-wrap{position:relative;display:flex;align-items:center;justify-content:center;padding:10px;min-height:180px;
            background-color:#eef2f7;background-image:linear-gradient(45deg,#e5eaf1 25%,transparent 25%),linear-gradient(-45deg,#e5eaf1 25%,transparent 25%),
            linear-gradient(45deg,transparent 75%,#e5eaf1 75%),linear-gradient(-45deg,transparent 75%,#e5eaf1 75%);
            background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;}
        .ngm-canvas-wrap canvas{max-width:100%;max-height:300px;width:auto;height:auto;image-rendering:pixelated;image-rendering:crisp-edges;}
        .ngm-missing{font-family:'Inter',sans-serif;font-size:12px;color:#94a3b8;}
        .ngm-legend{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 10px;padding:9px 12px 11px;border-top:1px solid #f1f5f9;}
        .ngm-legend span{display:flex;align-items:center;gap:6px;font-family:'Inter',sans-serif;font-size:10.5px;color:#334155;white-space:nowrap;}
        .ngm-legend i{width:12px;height:12px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.12);}
        .ngm-empty{padding:48px 24px;text-align:center;font-family:'Inter',sans-serif;color:#475569;}
        .ngm-empty div{font-size:40px;margin-bottom:10px;}
        .ngm-empty h3{font-family:'Outfit','Inter',sans-serif;margin:0 0 6px;color:#0f172a;font-size:17px;}
        .ngm-empty p{margin:0;font-size:13px;line-height:1.5;}
        @keyframes ngmFade{from{opacity:0}to{opacity:1}}
        @keyframes ngmPop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
        @keyframes ngmRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        `;
        const style = document.createElement('style');
        style.id = 'ngm-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ------------------------------------------------------------- modal DOM
    function ensureModal() {
        let modal = document.getElementById('nutrient-grid-modal');
        if (modal) return modal;
        injectStyles();
        modal = document.createElement('div');
        modal.id = 'nutrient-grid-modal';
        modal.className = 'ngm-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'ngm-title');
        modal.innerHTML = `
            <div class="ngm-dialog">
                <div class="ngm-header">
                    <div class="ngm-title-wrap">
                        <div class="ngm-icon">🗺️</div>
                        <div style="min-width:0;">
                            <h2 class="ngm-title" id="ngm-title">Full Map Nutrient Detection</h2>
                            <div class="ngm-sub" id="ngm-sub"></div>
                        </div>
                    </div>
                    <button type="button" class="ngm-close" id="ngm-close-btn" title="Close (Esc)" aria-label="Close">✕</button>
                </div>
                <div class="ngm-body"><div id="ngm-content"></div></div>
            </div>`;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => { if (e.target === modal) closeNutrientGridModal(); });
        modal.querySelector('#ngm-close-btn').addEventListener('click', closeNutrientGridModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('ngm-open')) closeNutrientGridModal();
        });
        return modal;
    }

    function closeNutrientGridModal() {
        const modal = document.getElementById('nutrient-grid-modal');
        if (modal) modal.classList.remove('ngm-open');
    }

    // ------------------------------------------------------- data resolution
    function getActiveMap() {
        const sel = document.getElementById('map-select-comp') || document.getElementById('map-select-std');
        if (!sel || !sel.value) return { key: '', name: '' };
        const opt = sel.options[sel.selectedIndex];
        return { key: sel.value, name: opt ? opt.text.trim() : sel.value };
    }

    function resolveRasterSource(mapKey) {
        if (mapKey.includes('sekinchan') && typeof RASTER_OVERLAYS_SEKINCHAN !== 'undefined') {
            const meta = (typeof SEKINCHAN_PREDICTION_META !== 'undefined') ? SEKINCHAN_PREDICTION_META : {};
            return {
                overlays: RASTER_OVERLAYS_SEKINCHAN,
                grids: (typeof RASTER_GRID_DATA_SEKINCHAN !== 'undefined') ? RASTER_GRID_DATA_SEKINCHAN : null,
                label: 'Prebuilt 10m prediction' + (meta.acquisition_date ? ` · Sentinel-2 ${meta.acquisition_date}` : '')
            };
        }
        if (window.DYNAMIC_PREDICTION_RASTERS && Object.keys(window.DYNAMIC_PREDICTION_RASTERS).length) {
            return { overlays: window.DYNAMIC_PREDICTION_RASTERS, grids: null, label: 'Latest Run Prediction · 10m Sentinel-2' };
        }
        if ((mapKey.includes('lahad_datu') || mapKey.includes('mpob_36_trial')) && typeof RASTER_OVERLAYS !== 'undefined') {
            return {
                overlays: RASTER_OVERLAYS,
                grids: (typeof RASTER_GRID_DATA !== 'undefined') ? RASTER_GRID_DATA : null,
                label: 'Sentinel-2 derived rasters'
            };
        }
        if (mapKey.includes('ppptar') && typeof RASTER_OVERLAYS_PPPTAR !== 'undefined') {
            return {
                overlays: RASTER_OVERLAYS_PPPTAR,
                grids: (typeof RASTER_GRID_DATA_PPPTAR !== 'undefined') ? RASTER_GRID_DATA_PPPTAR : null,
                label: 'Sentinel-2 derived rasters'
            };
        }
        return null;
    }

    function gridStats(grid) {
        if (!grid || !Array.isArray(grid.data)) return null;
        let sum = 0, n = 0, min = Infinity, max = -Infinity;
        for (const row of grid.data) {
            for (const v of row) {
                if (v === null || v === -9999 || !(v > 0)) continue;
                sum += v; n++;
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }
        return n ? { mean: sum / n, min, max } : null;
    }

    function getBoundaryRings() {
        const layer = window.compBoundaryLayer || (typeof compBoundaryLayer !== 'undefined' ? compBoundaryLayer : null)
                   || window.stdBoundaryLayer || (typeof stdBoundaryLayer !== 'undefined' ? stdBoundaryLayer : null);
        let gj = null;
        try { gj = (layer && typeof layer.toGeoJSON === 'function') ? layer.toGeoJSON() : null; } catch (e) { gj = null; }
        const rings = [];
        (function walk(g) {
            if (!g) return;
            if (g.type === 'FeatureCollection') g.features.forEach(walk);
            else if (g.type === 'Feature') walk(g.geometry);
            else if (g.type === 'GeometryCollection') g.geometries.forEach(walk);
            else if (g.type === 'Polygon') g.coordinates.forEach(r => rings.push(r));
            else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => rings.push(r)));
        })(gj);
        return rings;
    }

    // -------------------------------------------------------------- rendering
    function fmtBreak(v, dp) { return Number(v).toFixed(dp); }

    function legendHtml(panel) {
        const b = panel.breaks, dp = panel.dp;
        const labels = [
            `≤ ${fmtBreak(b[0], dp)}`,
            `${fmtBreak(b[0], dp)} – ${fmtBreak(b[1], dp)}`,
            `${fmtBreak(b[1], dp)} – ${fmtBreak(b[2], dp)}`,
            `${fmtBreak(b[2], dp)} – ${fmtBreak(b[3], dp)}`,
            `${fmtBreak(b[3], dp)} – ${fmtBreak(b[4], dp)}`,
            `> ${fmtBreak(b[4], dp)}`
        ];
        return labels.map((t, i) => `<span><i style="background:${CLASS_COLORS[i]}"></i>${t}</span>`).join('');
    }

    function drawRaster(canvas, overlay, rings) {
        const img = new Image();
        img.onload = () => {
            const W = img.naturalWidth, H = img.naturalHeight;
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0);

            const bnd = overlay.bounds; // [[south, west], [north, east]]
            if (!rings.length || !bnd || bnd.length !== 2) return;
            const s = bnd[0][0], w = bnd[0][1], n = bnd[1][0], e = bnd[1][1];
            if (!(e > w) || !(n > s)) return;

            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(2, Math.round(Math.max(W, H) / 220));
            ctx.strokeStyle = '#ff7800';
            ctx.shadowColor = 'rgba(0,0,0,0.35)';
            ctx.shadowBlur = ctx.lineWidth;
            rings.forEach(ring => {
                ctx.beginPath();
                ring.forEach((pt, i) => {
                    const x = (pt[0] - w) / (e - w) * W;
                    const y = (n - pt[1]) / (n - s) * H;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                ctx.closePath();
                ctx.stroke();
            });
        };
        img.src = overlay.dataUrl;
    }

    function renderEmpty(content, icon, title, message) {
        content.innerHTML = `<div class="ngm-empty"><div>${icon}</div><h3>${title}</h3><p>${message}</p></div>`;
    }

    function openFullMapNutrientDialog() {
        // Close any legacy dialogs that may be open
        document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));

        const modal = ensureModal();
        const content = modal.querySelector('#ngm-content');
        const sub = modal.querySelector('#ngm-sub');
        const map = getActiveMap();

        modal.classList.add('ngm-open');

        if (!map.key) {
            sub.textContent = 'No map selected';
            renderEmpty(content, '📍', 'Select a map boundary first',
                'Choose an estate from <b>Select Map</b> in the left panel, then open this view again.');
            return;
        }

        const src = resolveRasterSource(map.key);
        if (!src) {
            sub.textContent = map.name;
            renderEmpty(content, '🛰️', 'No nutrient rasters for this map yet',
                'Click <b>Run Prediction</b> to generate 10m Sentinel-2 nutrient rasters, then open this view again.');
            return;
        }

        sub.textContent = `${map.name} · ${src.label}`;
        const rings = getBoundaryRings();
        const grid = document.createElement('div');
        grid.className = 'ngm-grid';

        NUTRIENT_PANELS.forEach((panel, idx) => {
            const overlay = src.overlays[panel.key];
            const stats = src.grids ? gridStats(src.grids[panel.key]) : null;
            const card = document.createElement('figure');
            card.className = 'ngm-card';
            card.style.animationDelay = `${idx * 40}ms`;
            card.innerHTML = `
                <div class="ngm-card-head">
                    <span class="ngm-badge">${panel.key}</span>
                    <div>
                        <div class="ngm-name">${panel.name}</div>
                        <div class="ngm-unit">${panel.key} (${panel.unit})</div>
                    </div>
                    ${stats ? `<div class="ngm-stats">Mean <b>${stats.mean.toFixed(2)}</b><br>Min ${stats.min.toFixed(2)} · Max ${stats.max.toFixed(2)}</div>` : ''}
                </div>
                <div class="ngm-canvas-wrap">${overlay ? '<canvas></canvas>' : '<span class="ngm-missing">Layer not available</span>'}</div>
                <figcaption class="ngm-legend">${legendHtml(panel)}</figcaption>`;
            grid.appendChild(card);
            if (overlay && overlay.dataUrl) drawRaster(card.querySelector('canvas'), overlay, rings);
        });

        content.innerHTML = '';
        content.appendChild(grid);
    }

    window.openFullMapNutrientDialog = openFullMapNutrientDialog;
    window.closeNutrientGridModal = closeNutrientGridModal;
})();
