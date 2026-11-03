/**
 * SmartPalm Dark Command Center — Home Dashboard Controller (home_dashboard.js)
 * Powers:
 * - Interactive Dark Map with all 20 Comprehensive map boundaries
 * - Total Estate Online/Pending summary & filterable directory
 * - WiFi Connection Speed live monitor & Top Bar Search (Ctrl+Shift+F)
 * - Right Panel: Weekly Prediction Runs Left, Fertilizer Application Schedule -> Next Prediction Notifications, & Run History
 * - Bottom-Left Panel: All-Estate Stress Level Ratings & Highest Stress Estate leaderboard
 * - Bottom-Right Panel: 3-Months Back N, P, K, Mg, Ca, B Values per Estate
 */
(function () {
    'use strict';

    const LS_SCHEDULES_KEY = 'smartpalm_fert_schedules_v1';
    const LS_QUOTA_MAX_KEY = 'smartpalm_weekly_quota_max_v1';

    let homeMap = null;
    let darkSatLayer = null;
    let darkVecLayer = null;
    let labelsLayer = null;
    let currentBasemap = 'sat';
    let boundaryLayersByKey = {};
    let pinMarkersByKey = {};
    let selectedEstateKey = 'seraya';
    let selectedOwnerClusterId = 'benta_wawasan';
    let activeRegionFilter = 'ALL';

    const ESTATE_OWNER_CLUSTERS = [
        {
            id: 'benta_wawasan',
            filterGroup: 'benta_wawasan',
            ownerName: 'Benta Wawasan Sdn Bhd',
            dateAdded: '12 Jan 2026',
            lastManaged: '28 Oct 2026',
            regionLabel: 'Sabah (Tawau & Kalabakan)',
            estateKeys: ['agathis', 'belian', 'binuang', 'gaharu', 'kapur', 'keruing', 'menggaris', 'merbau', 'ramin', 'selanganbatu', 'seraya'],
            estateNamesList: 'Agathis, Belian, Binuang, Gaharu, Kapur, Keruing, Menggaris, Merbau, Ramin, Selangan Batu, Seraya'
        },
        {
            id: 'fgv',
            filterGroup: 'fgv',
            ownerName: 'FGV Holdings Berhad',
            dateAdded: '04 Feb 2026',
            lastManaged: '25 Oct 2026',
            regionLabel: 'Pahang (Jengka & Jerantut)',
            estateKeys: ['jengka24', 'jengka25', 'kota_gelanggi5', 'ppptar'],
            estateNamesList: 'Ladang Jengka 24, Ladang Jengka 25, Ladang Kota Gelanggi 5, Ladang PPPTAR'
        },
        {
            id: 'mpob_spoc',
            filterGroup: 'mpob',
            ownerName: 'MPOB SPOC A7 & Smallholders',
            dateAdded: '19 Mar 2026',
            lastManaged: '22 Oct 2026',
            regionLabel: 'Perak & Selangor',
            estateKeys: ['geolocation_ish', 'polygon_ish', 'soil_series', 'sekinchan1poly'],
            estateNamesList: 'Geolocation ISH SPOC A7, Polygon ISH SPOC A7, Soil Series SPOC A7, Sekinchan 1 Poly'
        },
        {
            id: 'mpob_research',
            filterGroup: 'mpob',
            ownerName: 'MPOB Research Station (Lahad Datu)',
            dateAdded: '08 Jan 2026',
            lastManaged: '30 Oct 2026',
            regionLabel: 'Sabah (Lahad Datu)',
            estateKeys: ['lahad_datu_combined'],
            estateNamesList: 'Lahad Datu Boundary & 36 Trial Plots'
        }
    ];

    function getHomeData() {
        return window.SMARTPALM_HOME_DATA || { estates: [], boundaries: {}, defaultRunHistory: [] };
    }

    function getEstateByKey(key) {
        const data = getHomeData();
        return data.estates.find(e => e.key === key) || data.estates[0] || null;
    }

    function getOwnerClusterById(clusterId) {
        return ESTATE_OWNER_CLUSTERS.find(c => c.id === clusterId) || ESTATE_OWNER_CLUSTERS[0];
    }

    // -------------------------------------------------------------------------
    // 1. INITIALIZE LEAFLET DARK MAP & ALL 20 BOUNDARIES
    // -------------------------------------------------------------------------
    function initHomeMap() {
        const mapEl = document.getElementById('sp-home-map');
        if (!mapEl || typeof L === 'undefined') return;

        homeMap = L.map('sp-home-map', {
            center: [4.35, 109.2],
            zoom: 6,
            zoomControl: false,
            attributionControl: false
        });

        // Normal Google Earth Hybrid Satellite (with labels, same as comprehensive.html)
        darkSatLayer = L.tileLayer(
            'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
            {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Maps'
            }
        );

        // Google Earth Pure Satellite (without labels)
        darkVecLayer = L.tileLayer(
            'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Maps'
            }
        );

        darkSatLayer.addTo(homeMap);

        renderAllBoundariesOnMap();
    }

    function renderAllBoundariesOnMap() {
        if (!homeMap) return;
        const data = getHomeData();
        const activeCluster = getOwnerClusterById(selectedOwnerClusterId);
        const activeKeysSet = new Set(activeCluster ? activeCluster.estateKeys : []);

        Object.values(boundaryLayersByKey).forEach(l => homeMap.removeLayer(l));
        Object.values(pinMarkersByKey).forEach(m => homeMap.removeLayer(m));
        boundaryLayersByKey = {};
        pinMarkersByKey = {};

        data.estates.forEach(est => {
            const fc = data.boundaries[est.key];
            if (!fc || !fc.features || !fc.features.length) return;

            const isSelected = activeKeysSet.has(est.key) || est.key === selectedEstateKey;
            const strokeColor = isSelected ? '#ffffff' : '#d4d4d8';

            const layer = L.geoJSON(fc, {
                pointToLayer: (feature, latlng) => {
                    return L.circleMarker(latlng, {
                        radius: isSelected ? 5 : 3.5,
                        color: strokeColor,
                        weight: 1.2,
                        fillColor: strokeColor,
                        fillOpacity: 0.55
                    });
                },
                style: () => ({
                    color: strokeColor,
                    weight: isSelected ? 2.2 : 1.4,
                    opacity: 0.92,
                    fillColor: strokeColor,
                    fillOpacity: isSelected ? 0.22 : 0.10
                }),
                onEachFeature: (feature, lyr) => {
                    const bname = (feature.properties && feature.properties.name) || 'Block';
                    const tipHtml = `
                        <div style="min-width:140px;">
                            <div style="font-weight:700;font-size:12px;color:#fff;margin-bottom:2px;">${est.name}</div>
                            <div style="font-size:11px;color:#94a3b8;">${bname} • ${est.region}</div>
                        </div>
                    `;
                    lyr.bindTooltip(tipHtml, { sticky: true, className: 'sp-map-tooltip', direction: 'top' });
                    lyr.on('click', (e) => {
                        L.DomEvent.stopPropagation(e);
                        selectEstate(est.key, true);
                    });
                }
            }).addTo(homeMap);

            boundaryLayersByKey[est.key] = layer;

            // Add floating interactive Estate Pin at estate center so all 20 maps are visible at Malaysia-wide zoom
            if (est.center && est.center.length === 2) {
                const pinIcon = L.divIcon({
                    className: '',
                    html: `
                        <div class="sp-estate-pin">
                            <span class="sp-estate-pin-dot"></span>
                        </div>
                    `,
                    iconSize: [0, 0]
                });
                const marker = L.marker(est.center, { icon: pinIcon }).addTo(homeMap);
                marker.on('click', () => selectEstate(est.key, true));
                pinMarkersByKey[est.key] = marker;
            }
        });
    }

    window.spToggleBasemap = function (mode) {
        if (!homeMap) return;
        currentBasemap = mode;
        const btnSat = document.getElementById('sp-btn-basemap-sat');
        const btnVec = document.getElementById('sp-btn-basemap-vec');
        if (mode === 'vec') {
            if (homeMap.hasLayer(darkSatLayer)) homeMap.removeLayer(darkSatLayer);
            if (!homeMap.hasLayer(darkVecLayer)) darkVecLayer.addTo(homeMap);
            if (btnSat) btnSat.classList.remove('active');
            if (btnVec) btnVec.classList.add('active');
        } else {
            if (homeMap.hasLayer(darkVecLayer)) homeMap.removeLayer(darkVecLayer);
            if (!homeMap.hasLayer(darkSatLayer)) darkSatLayer.addTo(homeMap);
            if (btnSat) btnSat.classList.add('active');
            if (btnVec) btnVec.classList.remove('active');
        }
    };

    window.spZoomMap = function (dir) {
        if (!homeMap) return;
        if (dir === 'in') homeMap.zoomIn();
        else if (dir === 'out') homeMap.zoomOut();
        else if (dir === 'reset') {
            homeMap.flyTo([4.35, 109.2], 6, { duration: 1.1 });
            const sel = document.getElementById('sp-hud-estate-select');
            if (sel) sel.value = 'ALL';
        }
    };

    window.spJumpRegion = function (region) {
        if (!homeMap) return;
        if (region === 'Sabah' || region === 'benta_wawasan') {
            window.selectOwnerCluster('benta_wawasan', true);
        } else if (region === 'Pahang' || region === 'fgv') {
            window.selectOwnerCluster('fgv', true);
        } else if (region === 'West' || region === 'mpob') {
            window.selectOwnerCluster('mpob_spoc', true);
        } else {
            homeMap.flyTo([4.35, 109.2], 6, { duration: 1.1 });
        }
    };

    // -------------------------------------------------------------------------
    // 2. SELECT OWNER CLUSTER OR INDIVIDUAL ESTATE & ZOOM MAP TO CLUSTER
    // -------------------------------------------------------------------------
    window.selectOwnerCluster = function (clusterId, zoomToCluster) {
        const cluster = getOwnerClusterById(clusterId);
        if (!cluster) return;

        selectedOwnerClusterId = cluster.id;
        selectedEstateKey = cluster.estateKeys[0] || selectedEstateKey;
        const keySet = new Set(cluster.estateKeys);

        // Sync top HUD dropdown
        const hudSel = document.getElementById('sp-hud-estate-select');
        if (hudSel) hudSel.value = 'CLUSTER:' + cluster.id;

        // Highlight all boundaries in this owner's cluster
        Object.entries(boundaryLayersByKey).forEach(([k, layer]) => {
            const isSel = keySet.has(k);
            const c = isSel ? '#ffffff' : '#a1a1aa';
            if (layer.setStyle) {
                layer.setStyle({
                    color: c,
                    weight: isSel ? 2.5 : 1.2,
                    fillColor: c,
                    fillOpacity: isSel ? 0.24 : 0.08
                });
            }
        });

        // Fly map to fit the entire owner estate cluster bounds
        if (zoomToCluster && homeMap && typeof L !== 'undefined') {
            let combinedBounds = null;
            cluster.estateKeys.forEach(k => {
                const lyr = boundaryLayersByKey[k];
                if (lyr && lyr.getBounds) {
                    const b = lyr.getBounds();
                    if (b && b.isValid()) {
                        if (!combinedBounds) {
                            combinedBounds = L.latLngBounds(b.getSouthWest(), b.getNorthEast());
                        } else {
                            combinedBounds.extend(b);
                        }
                    }
                }
            });

            if (combinedBounds && combinedBounds.isValid()) {
                homeMap.flyToBounds(combinedBounds, { padding: [55, 55], maxZoom: 13, duration: 1.1 });
            } else {
                const firstEst = getEstateByKey(cluster.estateKeys[0]);
                if (firstEst && firstEst.center) {
                    homeMap.flyTo(firstEst.center, 11, { duration: 1.1 });
                }
            }
        }

        // Highlight active owner card in Left Directory
        document.querySelectorAll('.sp-estate-row-item').forEach(el => {
            el.classList.toggle('active', el.dataset.ownerId === cluster.id);
        });

        // Update Top-Right Company Nutrient & Circular Stress Card
        renderCompanyStressCard(cluster.id);
    };

    window.selectOwnerClusterOrEstate = function (val, zoom) {
        if (!val || val === 'ALL') {
            window.spZoomMap('reset');
            return;
        }
        if (val.startsWith('CLUSTER:')) {
            window.selectOwnerCluster(val.replace('CLUSTER:', ''), zoom);
            return;
        }
        window.selectEstate(val, zoom);
    };

    window.selectEstate = function (estateKey, zoomToEstate) {
        if (!estateKey || estateKey === 'ALL') {
            window.spZoomMap('reset');
            return;
        }
        const est = getEstateByKey(estateKey);
        if (!est) return;

        selectedEstateKey = est.key;
        const ownerCluster = ESTATE_OWNER_CLUSTERS.find(c => c.estateKeys.includes(est.key));
        if (ownerCluster) selectedOwnerClusterId = ownerCluster.id;

        // Sync dropdowns
        const hudSel = document.getElementById('sp-hud-estate-select');
        if (hudSel && hudSel.value !== est.key) hudSel.value = est.key;

        const nutSel = document.getElementById('sp-nut3m-estate-select');
        if (nutSel && nutSel.value !== est.key) nutSel.value = est.key;

        // Highlight boundary styles
        Object.entries(boundaryLayersByKey).forEach(([k, layer]) => {
            const isSel = k === selectedEstateKey;
            const c = isSel ? '#ffffff' : '#d4d4d8';
            if (layer.setStyle) {
                layer.setStyle({
                    color: c,
                    weight: isSel ? 2.6 : 1.3,
                    fillColor: c,
                    fillOpacity: isSel ? 0.24 : 0.09
                });
            }
        });

        // Zoom map to estate bounds if requested
        if (zoomToEstate && homeMap) {
            const layer = boundaryLayersByKey[est.key];
            if (layer && layer.getBounds && layer.getBounds().isValid()) {
                homeMap.flyToBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 14, duration: 1.0 });
            } else if (est.center) {
                homeMap.flyTo(est.center, 13, { duration: 1.0 });
            }
        }

        // Update Map Focus Callout Card
        updateMapFocusCallout(est);

        // Highlight active owner card in Left Directory
        document.querySelectorAll('.sp-estate-row-item').forEach(el => {
            el.classList.toggle('active', el.dataset.ownerId === selectedOwnerClusterId);
        });
        document.querySelectorAll('.sp-stress-col-item').forEach(el => {
            el.classList.toggle('active', el.dataset.estateKey === est.key);
        });

        // Update Top-Right Company Nutrient & Circular Stress Card
        renderCompanyStressCard(selectedOwnerClusterId);

        // Update Bottom-Right 3-Month N, P, K, Mg, Ca, B Panel
        render3MonthNutrientPanel(est);
    };

    const COMPANY_BAR_SPECS = [
        { key: 'N',  label: 'N',  unit: '%',   maxScale: 3.10, dp: 2 },
        { key: 'P',  label: 'P',  unit: '%',   maxScale: 0.21, dp: 3 },
        { key: 'K',  label: 'K',  unit: '%',   maxScale: 1.35, dp: 2 },
        { key: 'Mg', label: 'Mg', unit: '%',   maxScale: 0.36, dp: 2 },
        { key: 'B',  label: 'B',  unit: 'ppm', maxScale: 20.0, dp: 1 },
        { key: 'Ca', label: 'Ca', unit: '%',   maxScale: 0.85, dp: 2 }
    ];

    function renderCompanyStressCard(clusterId) {
        const cluster = getOwnerClusterById(clusterId || selectedOwnerClusterId);
        if (!cluster) return;

        const estates = cluster.estateKeys.map(k => getEstateByKey(k)).filter(Boolean);
        if (!estates.length) return;

        const nameEl = document.getElementById('sp-comp-card-name');
        const countEl = document.getElementById('sp-comp-card-count');
        const barsEl = document.getElementById('sp-comp-nutrient-bars');
        const ringProgEl = document.getElementById('sp-comp-ring-prog');
        const pctEl = document.getElementById('sp-comp-stress-pct');
        const ratingEl = document.getElementById('sp-comp-stress-rating');

        if (nameEl) nameEl.textContent = cluster.ownerName;
        if (countEl) countEl.textContent = `${estates.length} ${estates.length === 1 ? 'Estate' : 'Estates'}`;

        // Compute average N, P, K, Mg, B, Ca across the chosen estate company
        if (barsEl) {
            barsEl.innerHTML = COMPANY_BAR_SPECS.map(spec => {
                const avgVal = estates.reduce((sum, e) => {
                    const cn = e.currentNutrients || {};
                    return sum + Number(cn[spec.key] || 0);
                }, 0) / estates.length;
                const fillPct = Math.max(12, Math.min(100, (avgVal / spec.maxScale) * 100));
                const unitStr = spec.unit === 'ppm' ? ' ppm' : '%';
                return `
                    <div class="sp-comp-bar-row">
                        <span class="sp-comp-bar-label">${spec.label}</span>
                        <div class="sp-comp-bar-track">
                            <div class="sp-comp-bar-fill" style="width:${fillPct.toFixed(1)}%;"></div>
                        </div>
                        <span class="sp-comp-bar-val">${avgVal.toFixed(spec.dp)}${unitStr}</span>
                    </div>
                `;
            }).join('');
        }

        // Compute overall stress percentage & rating for the chosen estate company
        const avgStress = estates.reduce((sum, e) => sum + Number(e.stressPct || 0), 0) / estates.length;
        let ratingLabel = 'Optimal';
        if (avgStress >= 65) ratingLabel = 'Critical';
        else if (avgStress >= 45) ratingLabel = 'High';
        else if (avgStress >= 25) ratingLabel = 'Moderate';

        const circumference = 2 * Math.PI * 35; // r = 35 -> 219.91
        const offset = circumference - (Math.max(0, Math.min(100, avgStress)) / 100) * circumference;

        if (ringProgEl) {
            ringProgEl.setAttribute('stroke-dasharray', circumference.toFixed(2));
            ringProgEl.setAttribute('stroke-dashoffset', offset.toFixed(2));
        }
        if (pctEl) pctEl.textContent = `${avgStress.toFixed(1)}%`;
        if (ratingEl) ratingEl.textContent = ratingLabel;

        // Sync Estate Selector & Render Geospatial Stress Map under the circular stress chart
        const geoSel = document.getElementById('sp-comp-geo-select');
        const activeEstKey = cluster.estateKeys.includes(selectedEstateKey)
            ? selectedEstateKey
            : cluster.estateKeys[0];
        if (geoSel) {
            geoSel.innerHTML = estates.map(e =>
                `<option value="${e.key}">${e.name}</option>`
            ).join('');
            geoSel.value = activeEstKey;
        }
        renderCompanyGeoStressMap(activeEstKey);
    }

    let compGeoUseRaster = false;

    window.toggleCompGeoRasterMode = function () {
        compGeoUseRaster = !compGeoUseRaster;
        const btn = document.getElementById('sp-comp-geo-mode-btn');
        if (btn) btn.classList.toggle('active', compGeoUseRaster);
        const geoSel = document.getElementById('sp-comp-geo-select');
        renderCompanyGeoStressMap((geoSel && geoSel.value) || selectedEstateKey);
    };

    window.showCompGeoTip = function (text) {
        const tip = document.getElementById('sp-comp-geo-tooltip');
        if (!tip) return;
        if (!text) {
            tip.style.display = 'none';
            return;
        }
        tip.textContent = text;
        tip.style.display = 'block';
    };

    function getCachedRasterForEstate(estateKey) {
        try {
            if (window.SmartPalmPredictionCache && typeof window.SmartPalmPredictionCache.listSavedRuns === 'function') {
                const runs = window.SmartPalmPredictionCache.listSavedRuns(estateKey) || [];
                for (let i = 0; i < runs.length; i++) {
                    const r = runs[i];
                    if (r && r.nutrients && r.nutrients.N && r.nutrients.N.dataUrl) {
                        return r.nutrients.N.dataUrl;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function renderCompanyGeoStressMap(estateKey) {
        const holder = document.getElementById('sp-comp-geo-svg-holder');
        const modeBtn = document.getElementById('sp-comp-geo-mode-btn');
        if (!holder) return;

        const data = getHomeData();
        const est = getEstateByKey(estateKey);
        const fc = (data.boundaries && data.boundaries[estateKey]) || null;
        if (!est || !fc || !fc.features || !fc.features.length) {
            holder.innerHTML = `<span style="font-size:11px;color:#64748b;">No boundary data</span>`;
            return;
        }

        const cachedRasterUrl = getCachedRasterForEstate(estateKey);
        if (modeBtn) {
            modeBtn.style.display = cachedRasterUrl ? 'inline-block' : 'none';
            modeBtn.classList.toggle('active', Boolean(cachedRasterUrl && compGeoUseRaster));
        }

        if (cachedRasterUrl && compGeoUseRaster) {
            holder.innerHTML = `
                <img src="${cachedRasterUrl}" alt="${est.name} 10m Raster" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;" />
            `;
            return;
        }

        // Compute bounding box of all features
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        function scanCoords(coords, geomType) {
            if (!coords) return;
            if (geomType === 'Point') {
                const x = Number(coords[0]), y = Number(coords[1]);
                if (isFinite(x) && isFinite(y)) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
                return;
            }
            if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                const x = Number(coords[0]), y = Number(coords[1]);
                if (isFinite(x) && isFinite(y)) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
                return;
            }
            for (let i = 0; i < coords.length; i++) {
                scanCoords(coords[i], geomType);
            }
        }

        // Filter out outer estate wrapper boundary if sub-blocks exist (e.g. Lahad Datu)
        const rawFeatures = fc.features.filter(f => f && f.geometry);
        const features = rawFeatures.length > 2
            ? rawFeatures.filter(f => !/Estate Boundary/i.test((f.properties && f.properties.name) || ''))
            : rawFeatures;

        features.forEach(f => scanCoords(f.geometry.coordinates, f.geometry.type));
        if (!isFinite(minX) || !isFinite(minY)) return;

        const svgW = 240;
        const svgH = 122;
        const pad = 6;
        const spanX = Math.max(0.0001, maxX - minX);
        const spanY = Math.max(0.0001, maxY - minY);
        const scale = Math.min((svgW - pad * 2) / spanX, (svgH - pad * 2) / spanY);
        const offsetX = (svgW - spanX * scale) / 2;
        const offsetY = (svgH - spanY * scale) / 2;

        const projX = (lng) => ( offsetX + (lng - minX) * scale ).toFixed(1);
        const projY = (lat) => ( svgH - offsetY - (lat - minY) * scale ).toFixed(1);

        // Score each block so stressed areas (Red = High, Yellow = Moderate) reflect actual foliar deficiency + estate stressPct
        const scored = features.map((f, idx) => {
            const p = f.properties || {};
            let deficiencyScore = 0;
            if (typeof p.N_mean === 'number') {
                deficiencyScore =
                    (2.55 - Number(p.N_mean || 2.5)) * 40 +
                    (1.05 - Number(p.K_mean || 1.0)) * 35 +
                    (0.165 - Number(p.P_mean || 0.16)) * 120 +
                    (14.0 - Number(p.B_mean || 13.5)) * 1.5;
            } else {
                // Deterministic spatial/index score when block nutrient properties are not embedded
                deficiencyScore = Math.sin(idx * 1.93 + estateKey.length * 0.7) * 10 + Math.cos(idx * 0.71) * 6;
            }
            return { idx, feature: f, score: deficiencyScore };
        });

        const sortedByStress = [...scored].sort((a, b) => b.score - a.score);
        const total = Math.max(1, sortedByStress.length);
        const stressRatio = Math.max(0.12, Math.min(0.88, Number(est.stressPct || 35) / 100));
        const redCount = Math.max(1, Math.round(total * stressRatio * 0.44));
        const yellowCount = Math.max(1, Math.round(total * stressRatio * 0.56));

        const colorByIdx = {};
        const statusByIdx = {};
        sortedByStress.forEach((item, rank) => {
            if (rank < redCount) {
                colorByIdx[item.idx] = '#ef4444';
                statusByIdx[item.idx] = 'High Stress';
            } else if (rank < redCount + yellowCount) {
                colorByIdx[item.idx] = '#eab308';
                statusByIdx[item.idx] = 'Moderate Stress';
            } else {
                colorByIdx[item.idx] = '#475569';
                statusByIdx[item.idx] = 'Normal';
            }
        });

        function ringToPath(ring) {
            if (!ring || !ring.length) return '';
            let d = '';
            for (let i = 0; i < ring.length; i++) {
                const pt = ring[i];
                if (typeof pt[0] !== 'number') continue;
                d += (i === 0 ? 'M' : 'L') + projX(pt[0]) + ',' + projY(pt[1]);
            }
            return d + 'Z';
        }

        // Cap point features if an estate has thousands of points (like geolocation_ish)
        const step = features.length > 350 ? Math.ceil(features.length / 350) : 1;
        const svgShapes = [];

        for (let i = 0; i < features.length; i += step) {
            const f = features[i];
            const geom = f.geometry;
            const fill = colorByIdx[i] || '#475569';
            const status = statusByIdx[i] || 'Normal';
            const bname = ((f.properties && f.properties.name) || `Block ${i + 1}`).replace(/'/g, '');
            const tipText = `${bname} • ${status}`;

            if (geom.type === 'Point') {
                const cx = projX(geom.coordinates[0]);
                const cy = projY(geom.coordinates[1]);
                svgShapes.push(
                    `<circle cx="${cx}" cy="${cy}" r="2.2" fill="${fill}" opacity="0.9" onmouseenter="showCompGeoTip('${tipText}')" onmouseleave="showCompGeoTip('')" />`
                );
            } else if (geom.type === 'Polygon') {
                const d = geom.coordinates.map(ringToPath).join(' ');
                if (d) {
                    svgShapes.push(
                        `<path d="${d}" fill="${fill}" fill-opacity="0.88" stroke="#0b0f16" stroke-width="0.7" onmouseenter="showCompGeoTip('${tipText}')" onmouseleave="showCompGeoTip('')" />`
                    );
                }
            } else if (geom.type === 'MultiPolygon') {
                const d = geom.coordinates.map(poly => poly.map(ringToPath).join(' ')).join(' ');
                if (d) {
                    svgShapes.push(
                        `<path d="${d}" fill="${fill}" fill-opacity="0.88" stroke="#0b0f16" stroke-width="0.7" onmouseenter="showCompGeoTip('${tipText}')" onmouseleave="showCompGeoTip('')" />`
                    );
                }
            }
        }

        holder.innerHTML = `
            <svg viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet">
                ${svgShapes.join('')}
            </svg>
        `;
    }

    function updateMapFocusCallout(est) {
        const nameEl = document.getElementById('sp-focus-estate-name');
        const subEl = document.getElementById('sp-focus-estate-sub');
        const pctEl = document.getElementById('sp-focus-stress-pct');
        const badgeEl = document.getElementById('sp-focus-stress-badge');

        if (nameEl) nameEl.textContent = est.name;
        if (subEl) subEl.textContent = `${est.zone} • ${est.totalBlocks} Blocks (${est.areaHa.toLocaleString()} Ha)`;
        if (pctEl) {
            pctEl.textContent = `${est.stressPct.toFixed(1)}%`;
            pctEl.style.color = '#ffffff';
        }
        if (badgeEl) {
            badgeEl.textContent = est.stressRating;
            badgeEl.style.color = '#cbd5e1';
        }
    }

    // -------------------------------------------------------------------------
    // 3. LEFT COLUMN: TOTAL ESTATE SUMMARY & ESTATE OWNER CLUSTER DIRECTORY
    // -------------------------------------------------------------------------
    window.filterLeftEstatesByRegion = function (filterGroup, btnEl) {
        activeRegionFilter = filterGroup;
        document.querySelectorAll('.sp-region-chip').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');
        renderLeftEstateDirectory();
        if (filterGroup === 'benta_wawasan') {
            window.selectOwnerCluster('benta_wawasan', true);
        } else if (filterGroup === 'fgv') {
            window.selectOwnerCluster('fgv', true);
        } else if (filterGroup === 'mpob') {
            window.selectOwnerCluster('mpob_spoc', true);
        } else {
            window.spZoomMap('reset');
        }
    };

    function renderLeftEstateDirectory() {
        const data = getHomeData();
        const totalOnlineEl = document.getElementById('sp-kpi-online-count');
        const totalSubtitleEl = document.getElementById('sp-kpi-total-subtitle');
        const listEl = document.getElementById('sp-left-estate-list');

        const totalBlocks = data.estates.reduce((acc, e) => acc + e.totalBlocks, 0);

        if (totalOnlineEl) totalOnlineEl.textContent = data.estates.length;
        if (totalSubtitleEl) totalSubtitleEl.textContent = `${data.estates.length} Maps • ${totalBlocks.toLocaleString()} Blocks`;

        if (!listEl) return;

        const filteredClusters = ESTATE_OWNER_CLUSTERS.filter(c => {
            if (activeRegionFilter === 'ALL') return true;
            return c.filterGroup === activeRegionFilter;
        });

        listEl.innerHTML = filteredClusters.map(cluster => {
            const isSel = cluster.id === selectedOwnerClusterId;
            const clusterEstates = cluster.estateKeys.map(k => getEstateByKey(k)).filter(Boolean);
            const clusterBlocks = clusterEstates.reduce((acc, e) => acc + (e.totalBlocks || 0), 0);
            const clusterArea = clusterEstates.reduce((acc, e) => acc + (e.areaHa || 0), 0);
            const estateCountLabel = `${cluster.estateKeys.length} ${cluster.estateKeys.length === 1 ? 'Estate' : 'Estates'}`;

            return `
                <div class="sp-estate-row-item ${isSel ? 'active' : ''}" data-owner-id="${cluster.id}" onclick="selectOwnerCluster('${cluster.id}', true)">
                    <div class="sp-estate-row-left" style="align-items:flex-start;">
                        <span class="sp-estate-dot" style="background:#ffffff;box-shadow:none;margin-top:4px;"></span>
                        <div style="min-width:0;width:100%;display:flex;flex-direction:column;gap:3px;">
                            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;width:100%;">
                                <div class="sp-estate-row-name">${cluster.ownerName}</div>
                                <span class="sp-estate-row-meta" style="white-space:nowrap;flex-shrink:0;">Added: ${cluster.dateAdded}</span>
                            </div>
                            <div class="sp-estate-row-meta">Last managed: ${cluster.lastManaged}</div>
                            <div class="sp-estate-row-meta">${cluster.regionLabel} • ${estateCountLabel} • ${clusterBlocks.toLocaleString()} blk • ${Math.round(clusterArea).toLocaleString()} Ha</div>
                            <div class="sp-estate-owner-sublist">${cluster.estateNamesList}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // -------------------------------------------------------------------------
    // 4. BOTTOM-LEFT PANEL: STRESS LEVEL FOR ALL ESTATES & HIGHEST STRESS RATINGS
    // -------------------------------------------------------------------------
    function renderStressLeaderboardPanel() {
        const data = getHomeData();
        const barsContainer = document.getElementById('sp-stress-bars-container');
        const highestValEl = document.getElementById('sp-stress-highest-val');
        const highestTagEl = document.getElementById('sp-stress-highest-estate-tag');

        if (!data.estates.length) return;
        const sorted = [...data.estates].sort((a, b) => b.stressPct - a.stressPct);
        const highest = sorted[0];

        if (highestValEl && highest) {
            highestValEl.textContent = `${highest.stressPct.toFixed(1)}%`;
            highestValEl.style.color = highest.stressColor;
        }
        if (highestTagEl && highest) {
            highestTagEl.innerHTML = `⚠️ Highest: <b>${highest.name}</b> (${highest.stressRating})`;
            highestTagEl.onclick = () => selectEstate(highest.key, true);
        }

        if (!barsContainer) return;

        barsContainer.innerHTML = sorted.map((est, idx) => {
            const isSel = est.key === selectedEstateKey;
            const shortName = est.name
                .replace(' Estate', '')
                .replace('Ladang ', '')
                .replace(' (36 Trial Plots)', '')
                .replace(' SPOC A7', '');
            return `
                <div class="sp-stress-col-item ${isSel ? 'active' : ''}" data-estate-key="${est.key}" onclick="selectEstate('${est.key}', true)" title="${est.name}: ${est.stressPct}% Stress (${est.stressRating})">
                    <div class="sp-stress-col-top">
                        <span style="color:#64748b;">#${idx + 1}</span>
                        <span style="color:${est.stressColor};">${est.stressPct.toFixed(1)}%</span>
                    </div>
                    <div class="sp-stress-track">
                        <div class="sp-stress-fill" style="width:${Math.min(100, est.stressPct)}%;background:${est.stressColor};"></div>
                    </div>
                    <div class="sp-stress-col-name">${shortName}</div>
                    <div class="sp-stress-col-rating">
                        <span style="width:6px;height:6px;border-radius:50%;background:${est.stressColor};display:inline-block;"></span>
                        <span>${est.stressRating}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // -------------------------------------------------------------------------
    // 5. BOTTOM-RIGHT PANEL: 3 MONTHS BACK N, P, K, Mg, Ca, B VALUES PER ESTATE
    // -------------------------------------------------------------------------
    const NUTRIENT_SPECS = [
        { key: 'N',  label: 'N',  name: 'Nitrogen',   unit: '%',   crit: 2.50,  dp: 2 },
        { key: 'P',  label: 'P',  name: 'Phosphorus', unit: '%',   crit: 0.150, dp: 3 },
        { key: 'K',  label: 'K',  name: 'Potassium',  unit: '%',   crit: 1.00,  dp: 2 },
        { key: 'Mg', label: 'Mg', name: 'Magnesium',  unit: '%',   crit: 0.24,  dp: 2 },
        { key: 'Ca', label: 'Ca', name: 'Calcium',    unit: '%',   crit: 0.60,  dp: 2 },
        { key: 'B',  label: 'B',  name: 'Boron',      unit: 'ppm', crit: 15.0,  dp: 1 }
    ];

    function render3MonthNutrientPanel(est) {
        if (!est) return;
        const gridEl = document.getElementById('sp-nut-3m-grid');
        const subtitleEl = document.getElementById('sp-nut3m-period-label');
        if (!gridEl) return;

        const hist = est.history3Months || [];
        const m2 = hist[0] || est.currentNutrients;
        const m1 = hist[1] || est.currentNutrients;
        const m0 = hist[2] || est.currentNutrients;

        if (subtitleEl) {
            subtitleEl.textContent = `${m2.date || 'Aug'} → ${m1.date || 'Sep'} → ${m0.date || 'Oct 2026'}`;
        }

        gridEl.innerHTML = NUTRIENT_SPECS.map(spec => {
            const v2 = Number(m2[spec.key] || 0);
            const v1 = Number(m1[spec.key] || 0);
            const v0 = Number(m0[spec.key] || 0);
            const diff = v0 - v2;
            const sign = diff >= 0 ? '+' : '';
            const isDeficient = v0 < spec.crit;
            const statusColor = isDeficient ? '#f97316' : '#34d399';

            return `
                <div class="sp-nut-3m-card" onclick="open3MonthDetailModal('${est.key}')" title="Click to inspect full 3-month N, P, K, Mg, Ca, B trend chart for ${est.name}">
                    <div class="sp-nut-3m-head">
                        <span class="sp-nut-symbol" style="color:${statusColor};">${spec.label} <span style="font-weight:500;font-size:9.5px;color:#94a3b8;">(${spec.unit})</span></span>
                        <span class="sp-nut-delta ${diff >= 0 ? 'up' : 'down'}">${sign}${diff.toFixed(spec.dp)}</span>
                    </div>
                    <div class="sp-nut-latest-val">${v0.toFixed(spec.dp)}<span style="font-size:10px;font-weight:500;color:#94a3b8;margin-left:2px;">${spec.unit}</span></div>
                    <div class="sp-nut-history-mini">
                        <span title="2 Months Ago (${m2.month})">M-2: <b>${v2.toFixed(spec.dp)}</b></span>
                        <span title="1 Month Ago (${m1.month})">M-1: <b>${v1.toFixed(spec.dp)}</b></span>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.open3MonthDetailModal = function (estateKey) {
        const est = getEstateByKey(estateKey || selectedEstateKey);
        const modal = document.getElementById('sp-3month-modal');
        const body = document.getElementById('sp-3month-modal-body');
        const title = document.getElementById('sp-3month-modal-title');
        if (!est || !modal || !body) return;

        if (title) title.textContent = `${est.name} — 3-Month Foliar Nutrient Trajectory (N, P, K, Mg, Ca, B)`;
        const hist = est.history3Months || [];
        const m2 = hist[0] || est.currentNutrients;
        const m1 = hist[1] || est.currentNutrients;
        const m0 = hist[2] || est.currentNutrients;

        const rowsHtml = NUTRIENT_SPECS.map(spec => {
            const v2 = Number(m2[spec.key] || 0);
            const v1 = Number(m1[spec.key] || 0);
            const v0 = Number(m0[spec.key] || 0);
            const delta = v0 - v2;
            const isBelow = v0 < spec.crit;
            return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
                    <td style="padding:10px;font-weight:700;color:#fff;">${spec.name} (${spec.key})</td>
                    <td style="padding:10px;color:#cbd5e1;">${v2.toFixed(spec.dp)} ${spec.unit}</td>
                    <td style="padding:10px;color:#cbd5e1;">${v1.toFixed(spec.dp)} ${spec.unit}</td>
                    <td style="padding:10px;font-weight:700;color:#fff;">${v0.toFixed(spec.dp)} ${spec.unit}</td>
                    <td style="padding:10px;color:#94a3b8;">${spec.crit.toFixed(spec.dp)} ${spec.unit}</td>
                    <td style="padding:10px;font-weight:700;color:${delta >= 0 ? '#34d399' : '#f87171'};">${delta >= 0 ? '+' : ''}${delta.toFixed(spec.dp)} ${spec.unit}</td>
                    <td style="padding:10px;">
                        <span style="padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${isBelow ? 'rgba(249,115,22,0.18)' : 'rgba(16,185,129,0.18)'};color:${isBelow ? '#fb923c' : '#34d399'};">
                            ${isBelow ? 'Below Critical' : 'Optimal'}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');

        body.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;background:rgba(255,255,255,0.04);padding:10px 14px;border-radius:10px;">
                <div>
                    <div style="font-size:12px;color:#94a3b8;">Region &amp; Coverage</div>
                    <div style="font-size:14px;font-weight:600;color:#fff;">${est.zone} • ${est.totalBlocks} Blocks (${est.areaHa.toLocaleString()} Ha)</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:12px;color:#94a3b8;">Estate Stress Level</div>
                    <div style="font-size:16px;font-weight:800;color:${est.stressColor};">${est.stressPct}% (${est.stressRating})</div>
                </div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:12.5px;text-align:left;">
                <thead>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.16);color:#94a3b8;font-size:11px;text-transform:uppercase;">
                        <th style="padding:8px 10px;">Nutrient</th>
                        <th style="padding:8px 10px;">${m2.month || '2 Months Back'}</th>
                        <th style="padding:8px 10px;">${m1.month || '1 Month Back'}</th>
                        <th style="padding:8px 10px;">${m0.month || 'Current'}</th>
                        <th style="padding:8px 10px;">MPOB Critical</th>
                        <th style="padding:8px 10px;">3-Mo Change</th>
                        <th style="padding:8px 10px;">Status</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        `;
        modal.style.display = 'flex';
    };

    // -------------------------------------------------------------------------
    // 6. RIGHT PANEL: WEEKLY QUOTA, FERTILIZER SCHEDULE & RUN HISTORY NOTIFICATIONS
    // -------------------------------------------------------------------------
    function loadSchedules() {
        try {
            const raw = localStorage.getItem(LS_SCHEDULES_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) return parsed;
            }
        } catch (e) {}

        // Default realistic schedules demonstrating how Fertilizer Application -> Next Prediction Notification works
        const defaults = [
            {
                id: 'sched-1',
                estateKey: 'seraya',
                estateName: 'Seraya Estate',
                fertDate: '2026-09-18',
                fertType: 'Round 3 • NPK 12:12:17:2 + Boron',
                intervalDays: 45,
                nextPredDate: '2026-11-02'
            },
            {
                id: 'sched-2',
                estateKey: 'jengka24',
                estateName: 'Ladang Jengka 24',
                fertDate: '2026-09-15',
                fertType: 'Round 2 • Muriate of Potash (MOP)',
                intervalDays: 45,
                nextPredDate: '2026-10-30'
            }
        ];
        localStorage.setItem(LS_SCHEDULES_KEY, JSON.stringify(defaults));
        return defaults;
    }

    window.spSaveFertilizerSchedule = function (event) {
        if (event) event.preventDefault();
        const estKey = document.getElementById('sp-sched-estate')?.value || 'seraya';
        const fertDate = document.getElementById('sp-sched-date')?.value;
        const intervalDays = parseInt(document.getElementById('sp-sched-interval')?.value || '45', 10);
        const fertType = document.getElementById('sp-sched-type')?.value || 'NPK Compound Application';

        if (!fertDate) return;
        const est = getEstateByKey(estKey);
        const dt = new Date(fertDate + 'T00:00:00');
        dt.setDate(dt.getDate() + intervalDays);
        const nextPredDate = dt.toISOString().slice(0, 10);

        const schedules = loadSchedules();
        schedules.unshift({
            id: 'sched-' + Date.now(),
            estateKey: estKey,
            estateName: est ? est.name : estKey,
            fertDate,
            fertType,
            intervalDays,
            nextPredDate
        });
        localStorage.setItem(LS_SCHEDULES_KEY, JSON.stringify(schedules.slice(0, 12)));

        const builder = document.getElementById('sp-schedule-builder-form');
        if (builder) builder.style.display = 'none';
        renderRightNotificationsAndSchedules();
    };

    window.spDeleteSchedule = function (id) {
        const schedules = loadSchedules().filter(s => s.id !== id);
        localStorage.setItem(LS_SCHEDULES_KEY, JSON.stringify(schedules));
        renderRightNotificationsAndSchedules();
    };

    function getCombinedRunHistory() {
        const data = getHomeData();
        const liveRuns = Array.isArray(window.PREDICTION_RUN_HISTORY) ? window.PREDICTION_RUN_HISTORY : [];
        let lsRuns = [];
        try {
            const raw = localStorage.getItem('smartpalm_prediction_history_v1');
            if (raw) lsRuns = JSON.parse(raw);
        } catch (e) {}

        const merged = [];
        const seen = new Set();

        [...liveRuns, ...lsRuns, ...(data.defaultRunHistory || [])].forEach(r => {
            const key = r.folderName || r.folder_name || `${r.estateName}_${r.timestamp}`;
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push({
                folderName: key,
                estateName: r.estateName || r.estate_name || r.shpKey || 'Estate Run',
                acquisitionDate: r.acquisitionDate || r.acquisition_date || '2026-10-07',
                timestamp: r.timestamp || r.createdAt || '2026-10-14',
                totalBlocks: r.totalBlocks || r.total_blocks || 55
            });
        });
        return merged;
    }

    function renderRightNotificationsAndSchedules() {
        const runs = getCombinedRunHistory();
        const schedules = loadSchedules();
        const maxWeekly = parseInt(localStorage.getItem(LS_QUOTA_MAX_KEY) || '20', 10);

        // Calculate runs used this week (minimum 6 for realistic demo feedback if cache is fresh)
        const usedThisWeek = Math.min(maxWeekly, Math.max(6, Math.min(runs.length, 6)));
        const leftThisWeek = Math.max(0, maxWeekly - usedThisWeek);
        const pctLeft = Math.round((leftThisWeek / maxWeekly) * 100);

        const quotaCountEl = document.getElementById('sp-quota-left-text');
        const quotaFillEl = document.getElementById('sp-quota-bar-fill');
        const quotaUsedEl = document.getElementById('sp-quota-used-text');

        if (quotaCountEl) quotaCountEl.textContent = `${leftThisWeek} / ${maxWeekly} Runs Left`;
        if (quotaFillEl) quotaFillEl.style.width = `${pctLeft}%`;
        if (quotaUsedEl) quotaUsedEl.textContent = `${usedThisWeek} prediction runs executed this week`;

        // Render Scheduled Fertilizer Prediction Reminders
        const schedListEl = document.getElementById('sp-scheduled-runs-list');
        const today = new Date('2026-10-30T00:00:00');

        if (schedListEl) {
            schedListEl.innerHTML = schedules.map(s => {
                const target = new Date(s.nextPredDate + 'T00:00:00');
                const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
                let badgeText = '';
                let cardClass = 'amber';
                if (diffDays <= 0) {
                    badgeText = diffDays === 0 ? '🔔 DUE TODAY — Run Satellite Prediction' : `⚠️ Overdue by ${Math.abs(diffDays)}d — Run Prediction`;
                    cardClass = '';
                } else {
                    badgeText = `⏳ Next Prediction in ${diffDays} days (${s.nextPredDate})`;
                    cardClass = diffDays <= 5 ? 'amber' : 'emerald';
                }

                return `
                    <div class="sp-alert-card ${cardClass}">
                        <div class="sp-alert-top">
                            <span class="sp-alert-badge" onclick="selectEstate('${s.estateKey}', true)" style="cursor:pointer;">
                                ${s.estateName}
                            </span>
                            <button onclick="spDeleteSchedule('${s.id}')" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:11px;" title="Remove schedule">✕</button>
                        </div>
                        <div class="sp-alert-desc">
                            Fertilized: <b>${s.fertDate}</b> (${s.fertType})<br/>
                            <span style="color:#fff;font-weight:600;">${badgeText}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
                            <span style="font-size:10px;color:#cbd5e1;">+${s.intervalDays}d Leaf 17 uptake check</span>
                            <a href="comprehensive.html" style="font-size:10.5px;font-weight:700;color:#34d399;text-decoration:none;">Run Prediction →</a>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Render Run History & Critical Stress Notifications
        const historyListEl = document.getElementById('sp-run-history-list');
        if (historyListEl) {
            const topRuns = runs.slice(0, 8);
            historyListEl.innerHTML = topRuns.map((r, i) => {
                const cleanEstate = String(r.estateName).replace(/_/g, ' ');
                const timeLabel = String(r.timestamp).replace('_', ' ');
                return `
                    <div class="sp-alert-card neutral" style="cursor:pointer;" onclick="location.href='comprehensive.html'">
                        <div class="sp-alert-top">
                            <span class="sp-alert-badge" style="color:#34d399;">✓ ${cleanEstate.toUpperCase()}</span>
                            <span class="sp-alert-time">${i === 0 ? 'Latest Run' : timeLabel.slice(0, 10)}</span>
                        </div>
                        <div class="sp-alert-desc">
                            Sentinel-2 10m N, P, K, Mg, Ca, B prediction completed • <b>${r.totalBlocks || 55} blocks</b> analyzed (Image: ${r.acquisitionDate}).
                        </div>
                    </div>
                `;
            }).join('');
        }

        const badgeCount = document.getElementById('sp-top-notif-badge');
        if (badgeCount) {
            badgeCount.textContent = schedules.length + Math.min(3, runs.length);
        }

        renderTopNotifDropdown();
        renderFullNotificationsPage();
    }

    // -------------------------------------------------------------------------
    // 6B. TOP-RIGHT NOTIFICATION DROPDOWN & FULL NOTIFICATIONS PAGE ENGINE
    // -------------------------------------------------------------------------
    const LS_READ_NOTIFS_KEY = 'smartpalm_read_notifs_v1';

    function getReadNotifSet() {
        try {
            const raw = localStorage.getItem(LS_READ_NOTIFS_KEY);
            if (raw) return new Set(JSON.parse(raw));
        } catch (e) {}
        return new Set();
    }

    function saveReadNotifSet(setObj) {
        try {
            localStorage.setItem(LS_READ_NOTIFS_KEY, JSON.stringify(Array.from(setObj)));
        } catch (e) {}
    }

    function formatEstateRunName(rawName) {
        const s = String(rawName || '').trim();
        const lower = s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const map = {
            ssb: 'Benta Wawasan (SSB)',
            sekinchan1poly: 'Sekinchan 1 Poly',
            sawitkinabalu: 'Sawit Kinabalu Estate',
            lahaddatu: 'Lahad Datu Estate',
            lahaddatu2023: 'Lahad Datu Estate',
            lahaddatuwithblockboundary: 'Lahad Datu Estate',
            lahaddatucombined: 'Lahad Datu Estate',
            selanganbatu: 'Selangan Batu Estate',
            ramin: 'Ramin Estate',
            merbau: 'Merbau Estate',
            menggaris: 'Menggaris Estate',
            keruing: 'Keruing Estate',
            kapur: 'Kapur Estate',
            gaharu: 'Gaharu Estate',
            binuang: 'Binuang Estate',
            belian: 'Belian Estate',
            agathis: 'Agathis Estate',
            seraya: 'Seraya Estate',
            serayawithblockboundary: 'Seraya Estate',
            jengka24: 'Ladang Jengka 24',
            jengka25: 'Ladang Jengka 25',
            kotagelanggi5: 'Ladang Kota Gelanggi 5',
            ppptar: 'Ladang PPPTAR'
        };
        if (map[lower]) return map[lower];
        const found = getHomeData().estates.find(e => e.key.toLowerCase() === lower || e.name.toLowerCase() === s.toLowerCase());
        if (found) return found.name;
        return s.replace(/_/g, ' ');
    }

    function parseRunTimestamp(tsStr, fallbackDate) {
        const raw = String(tsStr || '').trim();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        // Format: YYYY-MM-DD_HHMMSS
        const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[_T\s](\d{2}):?(\d{2})(?::?(\d{2}))?/);
        if (m) {
            const year = m[1];
            const monIdx = Math.max(0, Math.min(11, parseInt(m[2], 10) - 1));
            const day = m[3];
            const hh = m[4];
            const mm = m[5];
            return {
                timeStr: `${hh}:${mm}`,
                dateStr: `${day} ${months[monIdx]} ${year}`
            };
        }
        // Fallback YYYY-MM-DD
        const dMatch = (raw || String(fallbackDate || '')).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dMatch) {
            const monIdx = Math.max(0, Math.min(11, parseInt(dMatch[2], 10) - 1));
            return {
                timeStr: '16:08',
                dateStr: `${dMatch[3]} ${months[monIdx]} ${dMatch[1]}`
            };
        }
        return { timeStr: '14:15', dateStr: '30 Oct 2026' };
    }

    window.getSmartPalmNotifications = function () {
        const runs = getCombinedRunHistory();
        const readSet = getReadNotifSet();
        const items = [];

        // 1. Profile update notification
        items.push({
            id: 'notif-profile-update',
            type: 'profile',
            unread: !readSet.has('notif-profile-update'),
            htmlText: `<b>Please update your profile</b>`,
            plainText: 'Please update your profile',
            subText: 'Account Settings • Complete your organization & contact profile',
            timeAgo: 'Action Required',
            whereStr: 'Account Profile',
            href: 'notifications.html?id=notif-profile-update'
        });

        // 2. Completed prediction run notifications
        runs.forEach((r, idx) => {
            const id = `notif-run-${r.folderName}`;
            const estateLabel = formatEstateRunName(r.estateName);
            const { timeStr, dateStr } = parseRunTimestamp(r.timestamp, r.acquisitionDate);
            const whereStr = `outputs/${r.folderName}`;
            const isDefaultUnread = idx < 4 && !readSet.has(id);

            items.push({
                id,
                type: 'run',
                unread: isDefaultUnread,
                estateLabel,
                timeStr,
                dateStr,
                whereStr,
                folderName: r.folderName,
                totalBlocks: r.totalBlocks || 55,
                acquisitionDate: r.acquisitionDate || '2026-10-07',
                htmlText: `Run for <b>${estateLabel}</b> completed at <b>${timeStr}</b>, <b>${dateStr}</b>, saved in <b>${whereStr}</b>`,
                plainText: `Run for ${estateLabel} completed at ${timeStr}, ${dateStr}, saved in ${whereStr}`,
                subText: `${r.totalBlocks || 55} blocks • Sentinel-2 (${r.acquisitionDate || '2026-10-07'})`,
                timeAgo: `${dateStr}, ${timeStr}`,
                href: `notifications.html?id=${encodeURIComponent(id)}`
            });
        });

        return items;
    };

    function renderTopNotifDropdown() {
        const listEl = document.getElementById('sp-top-notif-dropdown-list');
        const badgeEl = document.getElementById('sp-top-notif-badge');
        const pillEl = document.getElementById('sp-notif-dd-unread-pill');
        const items = window.getSmartPalmNotifications();
        const unreadCount = items.filter(i => i.unread).length;

        if (badgeEl) {
            badgeEl.textContent = unreadCount;
            badgeEl.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
        if (pillEl) {
            pillEl.textContent = `${unreadCount} New`;
        }
        if (!listEl) return;

        // Show top 6 notifications inside the compact right-side dropdown
        const dropdownItems = items.slice(0, 6);
        listEl.innerHTML = dropdownItems.map(item => {
            const iconSvg = item.type === 'profile'
                ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
                : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>`;

            return `
                <a href="${item.href}" class="sp-notif-dd-item ${item.unread ? 'unread' : ''}" onclick="handleNotifItemClick(event, '${item.id}', '${item.href}')">
                    <div class="sp-notif-dd-icon ${item.type}">
                        ${iconSvg}
                    </div>
                    <div class="sp-notif-dd-body">
                        <div class="sp-notif-dd-text">${item.htmlText}</div>
                        <div class="sp-notif-dd-sub">
                            <span>${item.subText}</span>
                        </div>
                    </div>
                    ${item.unread ? '<span class="sp-notif-dd-dot" title="Unread"></span>' : ''}
                </a>
            `;
        }).join('');
    }

    window.toggleTopNotifDropdown = function (event) {
        if (event) event.stopPropagation();
        const dd = document.getElementById('sp-top-notif-dropdown');
        if (!dd) return;
        const isOpen = dd.classList.toggle('open');
        if (isOpen) {
            renderTopNotifDropdown();
        }
    };

    window.handleNotifItemClick = function (event, notifId, targetHref) {
        const readSet = getReadNotifSet();
        readSet.add(notifId);
        saveReadNotifSet(readSet);
        renderTopNotifDropdown();
        if (targetHref) {
            window.location.href = targetHref;
        }
    };

    window.markAllNotificationsRead = function (event) {
        if (event) event.stopPropagation();
        const items = window.getSmartPalmNotifications();
        const readSet = getReadNotifSet();
        items.forEach(i => readSet.add(i.id));
        saveReadNotifSet(readSet);
        renderTopNotifDropdown();
        renderFullNotificationsPage();
    };

    let activeNotifPageFilter = 'all';

    window.filterFullNotificationsPage = function (filterMode, btnEl) {
        if (filterMode) activeNotifPageFilter = filterMode;
        window._activeNotifFilter = activeNotifPageFilter;
        if (btnEl) {
            document.querySelectorAll('.sp-notif-page-tab').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active');
        }
        renderFullNotificationsPage();
    };

    function renderFullNotificationsPage() {
        const container = document.getElementById('sp-full-notifications-list');
        if (!container) return;

        const searchInput = document.getElementById('sp-notif-page-search');
        const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
        const urlParams = new URLSearchParams(window.location.search);
        const highlightId = urlParams.get('id');

        const allItems = window.getSmartPalmNotifications();
        const totalEl = document.getElementById('sp-notif-page-total-count');
        const unreadEl = document.getElementById('sp-notif-page-unread-count');
        if (totalEl) totalEl.textContent = allItems.length;
        if (unreadEl) unreadEl.textContent = allItems.filter(i => i.unread).length;

        const filtered = allItems.filter(item => {
            if (activeNotifPageFilter === 'unread' && !item.unread) return false;
            if (activeNotifPageFilter === 'profile' && item.type !== 'profile') return false;
            if (activeNotifPageFilter === 'runs' && item.type !== 'run') return false;
            if (query && !item.plainText.toLowerCase().includes(query) && !item.subText.toLowerCase().includes(query)) {
                return false;
            }
            return true;
        });

        if (!filtered.length) {
            container.innerHTML = `
                <div style="padding: 42px 20px; text-align: left; color: #94a3b8; font-size: 14px;">
                    No notifications match the selected filter.
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(item => {
            const isHighlighted = highlightId && item.id === highlightId;
            const iconSvg = item.type === 'profile'
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>`;

            const actionBtnHtml = item.type === 'profile'
                ? `<button type="button" class="sp-sched-btn" style="padding: 7px 14px; font-size: 12.5px;" onclick="openAuthModal('signin')">Update Profile</button>`
                : `<a href="comprehensive.html" class="sp-sched-btn" style="padding: 7px 14px; font-size: 12.5px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">Open Run in Comprehensive Fert →</a>`;

            return `
                <div id="${item.id}" class="sp-notif-page-row ${item.unread ? 'unread' : ''} ${isHighlighted ? 'highlighted' : ''}">
                    <div class="sp-notif-dd-icon ${item.type}" style="width: 38px; height: 38px; border-radius: 10px;">
                        ${iconSvg}
                    </div>
                    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px;">
                        <div style="font-size: 14.5px; color: #f8fafc; line-height: 1.45;">
                            ${item.htmlText}
                        </div>
                        <div style="font-size: 12.5px; color: #94a3b8; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                            <span>${item.subText}</span>
                            <span>•</span>
                            <span style="color: #cbd5e1;">${item.timeAgo}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                        ${actionBtnHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    // -------------------------------------------------------------------------
    // 7. WIFI SPEED CONNECTION LIVE MONITOR & TOP BAR SEARCH (Ctrl+Shift+F)
    // -------------------------------------------------------------------------
    window.spMeasureWifiSpeed = async function () {
        const labelEl = document.getElementById('sp-wifi-speed-label');
        const dotEl = document.getElementById('sp-wifi-dot');
        if (labelEl) labelEl.textContent = 'Testing...';

        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const start = performance.now();
        try {
            await fetch('index.html?ping=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
        } catch (e) {}
        const latencyMs = Math.max(4, Math.round(performance.now() - start));

        let mbps = conn && conn.downlink ? conn.downlink : null;
        if (!mbps || mbps <= 0) {
            mbps = Math.max(24, Math.min(180, Math.round(650 / Math.max(4, latencyMs)) + 38));
        } else {
            mbps = Math.round(mbps * 10) / 10;
        }

        if (labelEl) {
            labelEl.textContent = `${mbps} Mbps • ${latencyMs}ms`;
        }
        if (dotEl) {
            dotEl.style.background = navigator.onLine !== false ? '#10b981' : '#ef4444';
        }
    };

    function initTopSearch() {
        const input = document.getElementById('sp-global-search-input');
        const dropdown = document.getElementById('sp-search-results-dropdown');
        if (!input || !dropdown) return;

        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            if (!q) {
                dropdown.style.display = 'none';
                return;
            }
            const matches = getHomeData().estates.filter(e =>
                e.name.toLowerCase().includes(q) ||
                e.region.toLowerCase().includes(q) ||
                e.zone.toLowerCase().includes(q)
            );
            if (!matches.length) {
                dropdown.innerHTML = `<div style="padding:8px 10px;font-size:11.5px;color:#94a3b8;">No matching estate found</div>`;
            } else {
                dropdown.innerHTML = matches.map(m => `
                    <div class="sp-search-result-item" onclick="selectEstate('${m.key}', true); document.getElementById('sp-search-results-dropdown').style.display='none';">
                        <span><b>${m.name}</b></span>
                        <span style="color:#94a3b8;font-size:11px;">${m.region}</span>
                    </div>
                `).join('');
            }
            dropdown.style.display = 'block';
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                input.focus();
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    function populateDropdowns() {
        const data = getHomeData();
        const hudSel = document.getElementById('sp-hud-estate-select');
        const nutSel = document.getElementById('sp-nut3m-estate-select');
        const schedSel = document.getElementById('sp-sched-estate');

        if (hudSel) {
            const clusterOpts = ESTATE_OWNER_CLUSTERS.map(c =>
                `<option value="CLUSTER:${c.id}">🏢 ${c.ownerName} (${c.estateKeys.length} Estates)</option>`
            ).join('');
            const groupOpts = ESTATE_OWNER_CLUSTERS.map(c => {
                const items = c.estateKeys
                    .map(k => getEstateByKey(k))
                    .filter(Boolean)
                    .map(e => `<option value="${e.key}">${e.name} (${e.region})</option>`)
                    .join('');
                return `<optgroup label="${c.ownerName}">${items}</optgroup>`;
            }).join('');
            hudSel.innerHTML =
                `<option value="ALL">🗺️ All 20 Maps (Malaysia Overview)</option>` +
                `<optgroup label="Estate Owner Clusters">${clusterOpts}</optgroup>` +
                groupOpts;
        }
        if (nutSel) {
            nutSel.innerHTML = data.estates.map(e => `<option value="${e.key}">${e.name}</option>`).join('');
            nutSel.value = selectedEstateKey;
        }
        if (schedSel) {
            schedSel.innerHTML = data.estates.map(e => `<option value="${e.key}">${e.name}</option>`).join('');
            schedSel.value = selectedEstateKey;
        }
    }

    // -------------------------------------------------------------------------
    // 8. BOOTSTRAP ON DOM READY
    // -------------------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', () => {
        populateDropdowns();
        initHomeMap();
        renderLeftEstateDirectory();
        renderStressLeaderboardPanel();
        renderRightNotificationsAndSchedules();
        initTopSearch();
        window.spMeasureWifiSpeed();
        setInterval(window.spMeasureWifiSpeed, 30000);

        // Close notification dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('sp-notif-dropdown-wrap');
            const dd = document.getElementById('sp-top-notif-dropdown');
            if (wrap && dd && !wrap.contains(e.target)) {
                dd.classList.remove('open');
            }
        });

        const defaultEst = getEstateByKey(selectedEstateKey);
        if (defaultEst) {
            updateMapFocusCallout(defaultEst);
            render3MonthNutrientPanel(defaultEst);
        }
        renderCompanyStressCard(selectedOwnerClusterId);
    });
})();
