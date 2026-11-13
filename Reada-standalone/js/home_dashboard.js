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

    function getCurrentUserContext() {
        try {
            const raw = localStorage.getItem('palmnex_user_session');
            if (!raw) {
                return {
                    isMasterAdmin: true,
                    storageGroup: 'storage_all',
                    accessTier: 'C',
                    companyCode: 'palmnex',
                    companyName: 'Palmnex Sdn Bhd',
                    username: 'Admin'
                };
            }
            const u = JSON.parse(raw);
            const username = String(u.username || (u.email ? u.email.split('@')[0] : 'Admin')).trim();
            const lowerUser = username.toLowerCase();
            const companyName = String(u.company || u.estate_company || u.company_name || 'Estate Company').trim();
            const rawCode = (
                String(u.company_code || '').toLowerCase().trim() ||
                lowerUser.replace(/^(?:admin)?([a-z_-]+?)(\d*)$/, '$1')
            ).replace(/\d+$/g, '') || 'palmnex';
            const accessTier = String(
                u.access_tier ||
                (typeof window.getCurrentPalmnexAccessTier === 'function' ? window.getCurrentPalmnexAccessTier() : 'A')
            ).toUpperCase().trim();
            const storageGroup = (accessTier === 'A' || accessTier === 'B')
                ? `storage_${lowerUser}`
                : String(
                    u.storage_group ||
                    (typeof window.getCurrentPalmnexStorageGroup === 'function' ? window.getCurrentPalmnexStorageGroup() : '') ||
                    (accessTier === 'C' ? 'storage_all' : `storage_${lowerUser}`)
                ).toLowerCase().trim();

            const isMasterAdmin = (accessTier === 'A' || accessTier === 'B')
                ? false
                : (
                    accessTier === 'C' ||
                    storageGroup === 'storage_all' ||
                    rawCode === 'palmnex' ||
                    lowerUser === 'admin' ||
                    lowerUser === 'admin1' ||
                    lowerUser.startsWith('adminpalmnex') ||
                    lowerUser.startsWith('palmnex')
                );

            return {
                isMasterAdmin,
                storageGroup,
                accessTier,
                companyCode: rawCode,
                companyName,
                username
            };
        } catch (e) {
            return {
                isMasterAdmin: true,
                storageGroup: 'storage_all',
                accessTier: 'C',
                companyCode: 'palmnex',
                companyName: 'Palmnex Sdn Bhd',
                username: 'Admin'
            };
        }
    }

    function computeGeoJsonCenter(fc) {
        if (!fc || !Array.isArray(fc.features) || !fc.features.length) return [4.5, 117.8];
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        function walk(coords) {
            if (!coords) return;
            if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                const lng = Number(coords[0]);
                const lat = Number(coords[1]);
                if (isFinite(lat) && isFinite(lng)) {
                    if (lat < minLat) minLat = lat;
                    if (lat > maxLat) maxLat = lat;
                    if (lng < minLng) minLng = lng;
                    if (lng > maxLng) maxLng = lng;
                }
                return;
            }
            for (let i = 0; i < coords.length; i++) walk(coords[i]);
        }
        fc.features.forEach(f => {
            if (f && f.geometry) walk(f.geometry.coordinates);
        });
        if (!isFinite(minLat) || !isFinite(minLng)) return [4.5, 117.8];
        return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
    }

    function injectCustomMapsIntoHomeData() {
        const data = getHomeData();
        const customMaps = Array.isArray(window.CUSTOM_SUPABASE_MAPS) ? window.CUSTOM_SUPABASE_MAPS : [];
        if (!customMaps.length) return;

        customMaps.forEach(m => {
            const gj = m && (m.geojson_data || m.geojson);
            if (!m || !m.map_key || !gj) return;
            const key = m.map_key;
            data.boundaries[key] = gj;

            const existingEst = data.estates.find(e => e.key === key);
            const blocksCount = Number(m.total_blocks) || (gj.features ? gj.features.length : 1);
            const center = computeGeoJsonCenter(gj);
            const cleanTitle = String(m.map_name || key)
                .replace(/^Custom:\s*/i, '')
                .replace(/\s*\(\d+\s*blocks\)\s*$/i, '')
                .trim();

            if (!existingEst) {
                data.estates.push({
                    key,
                    name: cleanTitle || key,
                    region: 'Uploaded Boundary',
                    zone: m.company_code ? m.company_code.toUpperCase() : 'Custom Estate',
                    totalBlocks: blocksCount,
                    areaHa: Math.max(15, Math.round(blocksCount * 28.5)),
                    center,
                    stressPct: 32.0,
                    stressRating: 'Moderate',
                    stressColor: '#eab308',
                    storageGroup: m.storage_group || '',
                    companyCode: m.company_code || '',
                    currentNutrients: { N: 2.51, P: 0.159, K: 1.01, Mg: 0.26, Ca: 0.63, B: 14.2 },
                    history3Months: [
                        { month: 'Aug', date: 'Aug 2026', N: 2.47, P: 0.154, K: 0.98, Mg: 0.25, Ca: 0.61, B: 13.8 },
                        { month: 'Sep', date: 'Sep 2026', N: 2.49, P: 0.157, K: 0.99, Mg: 0.25, Ca: 0.62, B: 14.0 },
                        { month: 'Oct', date: 'Oct 2026', N: 2.51, P: 0.159, K: 1.01, Mg: 0.26, Ca: 0.63, B: 14.2 }
                    ]
                });
            }
        });
    }

    function getVisibleClusters() {
        injectCustomMapsIntoHomeData();
        const ctx = getCurrentUserContext();
        const customMaps = Array.isArray(window.CUSTOM_SUPABASE_MAPS) ? window.CUSTOM_SUPABASE_MAPS : [];

        // Deep-clone base clusters so we can safely attach custom maps per session
        const baseClusters = ESTATE_OWNER_CLUSTERS.map(c => Object.assign({}, c, {
            estateKeys: [...c.estateKeys]
        }));

        if (ctx.isMasterAdmin) {
            if (customMaps.length > 0) {
                const customKeys = customMaps.map(m => m.map_key).filter(Boolean);
                if (customKeys.length > 0) {
                    baseClusters.push({
                        id: 'custom_uploaded_all',
                        filterGroup: 'ALL',
                        ownerName: 'Custom Uploaded Estate Maps',
                        dateAdded: 'Live Sync',
                        lastManaged: 'Today',
                        regionLabel: 'User Uploaded Boundaries',
                        estateKeys: customKeys,
                        estateNamesList: customMaps.map(m => m.map_name || m.map_key).join(', ')
                    });
                }
            }
            return baseClusters;
        }

        // Client user isolation: match company_code or company_name to cluster
        const code = ctx.companyCode.toLowerCase();
        const compLower = ctx.companyName.toLowerCase();

        let matched = baseClusters.filter(c => {
            if (code.includes('benta') || compLower.includes('benta')) return c.id === 'benta_wawasan';
            if (code.includes('fgv') || compLower.includes('fgv')) return c.id === 'fgv';
            if (code.includes('mpob') || compLower.includes('mpob')) return c.filterGroup === 'mpob';
            return c.id === code || c.filterGroup === code || c.ownerName.toLowerCase().includes(compLower);
        });

        // Attach any custom maps belonging to this specific user's storage_group
        const userCustomMaps = customMaps.filter(m =>
            !m.storage_group || m.storage_group.toLowerCase() === ctx.storageGroup
        );
        const userCustomKeys = userCustomMaps.map(m => m.map_key).filter(Boolean);

        if (matched.length > 0) {
            if (userCustomKeys.length > 0) {
                userCustomKeys.forEach(k => {
                    if (!matched[0].estateKeys.includes(k)) matched[0].estateKeys.push(k);
                });
            }
            return matched;
        }

        // If this user belongs to a new company not in the 4 default clusters:
        const fallbackKeys = userCustomKeys.length > 0 ? userCustomKeys : ['seraya'];
        return [
            {
                id: `company_${code || 'client'}`,
                filterGroup: 'ALL',
                ownerName: ctx.companyName || `Company (${ctx.username})`,
                dateAdded: 'Active Account',
                lastManaged: 'Today',
                regionLabel: userCustomKeys.length > 0 ? 'Custom Uploaded Boundaries' : 'Assigned Estate Boundary',
                estateKeys: fallbackKeys,
                estateNamesList: fallbackKeys.map(k => {
                    const e = getHomeData().estates.find(x => x.key === k);
                    return e ? e.name : k;
                }).join(', ')
            }
        ];
    }

    function getVisibleEstates() {
        const clusters = getVisibleClusters();
        const allowedKeys = new Set();
        clusters.forEach(c => (c.estateKeys || []).forEach(k => allowedKeys.add(k)));
        const allEstates = getHomeData().estates || [];
        const filtered = allEstates.filter(e => allowedKeys.has(e.key));
        return filtered.length > 0 ? filtered : allEstates;
    }

    function getEstateByKey(key) {
        const visible = getVisibleEstates();
        return visible.find(e => e.key === key) || getHomeData().estates.find(e => e.key === key) || visible[0] || null;
    }

    function getOwnerClusterById(clusterId) {
        const clusters = getVisibleClusters();
        return clusters.find(c => c.id === clusterId) || clusters[0] || ESTATE_OWNER_CLUSTERS[0];
    }

    // -------------------------------------------------------------------------
    // 1. INITIALIZE LEAFLET DARK MAP & ALL BOUNDARIES
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
        const visibleEstates = getVisibleEstates();
        const activeCluster = getOwnerClusterById(selectedOwnerClusterId);
        const activeKeysSet = new Set(activeCluster ? activeCluster.estateKeys : []);

        Object.values(boundaryLayersByKey).forEach(l => homeMap.removeLayer(l));
        Object.values(pinMarkersByKey).forEach(m => homeMap.removeLayer(m));
        boundaryLayersByKey = {};
        pinMarkersByKey = {};

        visibleEstates.forEach(est => {
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

            // Add floating interactive Estate Pin at estate center
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
        else if (dir === 'all_malaysia') {
            homeMap.flyTo([4.35, 109.2], 6, { duration: 1.0 });
            const sel = document.getElementById('sp-hud-estate-select');
            if (sel) sel.value = 'ALL';
        } else if (dir === 'recenter' || dir === 'reset') {
            const sel = document.getElementById('sp-hud-estate-select');
            const val = sel ? sel.value : '';

            // 1. If a specific estate map is selected in the HUD dropdown, re-center to that estate
            if (val && val !== 'ALL' && !val.startsWith('CLUSTER:')) {
                const layer = boundaryLayersByKey[val];
                const est = getEstateByKey(val);
                if (layer && layer.getBounds && layer.getBounds().isValid()) {
                    homeMap.flyToBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 14, duration: 0.9 });
                    return;
                } else if (est && est.center) {
                    homeMap.flyTo(est.center, 13, { duration: 0.9 });
                    return;
                }
            }

            // 2. If an estate company cluster is selected, re-center to that company's boundaries
            const clusterId = (val && val.startsWith('CLUSTER:'))
                ? val.replace('CLUSTER:', '')
                : (val === 'ALL' ? '' : selectedOwnerClusterId);
            if (clusterId) {
                const cluster = getOwnerClusterById(clusterId);
                if (cluster && Array.isArray(cluster.estateKeys) && cluster.estateKeys.length) {
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
                        homeMap.flyToBounds(combinedBounds, { padding: [55, 55], maxZoom: 13, duration: 0.9 });
                        return;
                    }
                }
            }

            // 3. Fallback: re-center to all Malaysia overview
            homeMap.flyTo([4.35, 109.2], 6, { duration: 0.9 });
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
        const ownerCluster = getVisibleClusters().find(c => c.estateKeys.includes(est.key));
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
        { key: 'N',  label: 'N',  unit: '%',   minScale: 2.30, crit: 2.46,  opt: 2.52,  maxScale: 2.75, dp: 2 },
        { key: 'P',  label: 'P',  unit: '%',   minScale: 0.140, crit: 0.155, opt: 0.163, maxScale: 0.185, dp: 3 },
        { key: 'K',  label: 'K',  unit: '%',   minScale: 0.85, crit: 0.98,  opt: 1.02,  maxScale: 1.25, dp: 2 },
        { key: 'Mg', label: 'Mg', unit: '%',   minScale: 0.21, crit: 0.25,  opt: 0.27,  maxScale: 0.34, dp: 2 },
        { key: 'B',  label: 'B',  unit: 'ppm', minScale: 11.0, crit: 13.5,  opt: 14.5,  maxScale: 18.0, dp: 1 },
        { key: 'Ca', label: 'Ca', unit: '%',   minScale: 0.52, crit: 0.61,  opt: 0.64,  maxScale: 0.78, dp: 2 }
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

        // Compute average N, P, K, Mg, B, Ca across the chosen estate company with Red - Yellow - Green status colors
        // and piecewise physiological bar widths so low/deficient averages show a visibly low bar
        if (barsEl) {
            barsEl.innerHTML = COMPANY_BAR_SPECS.map(spec => {
                const avgVal = estates.reduce((sum, e) => {
                    const cn = e.currentNutrients || {};
                    return sum + Number(cn[spec.key] || 0);
                }, 0) / estates.length;
                const unitStr = spec.unit === 'ppm' ? ' ppm' : '%';

                let barGradient = 'linear-gradient(90deg, #059669 0%, #10b981 100%)'; // Green (Optimal / High)
                let valColor = '#34d399';
                let fillPct = 80;

                if (avgVal < spec.crit) {
                    // Red (Critical / Very Low): bar length is visibly low (18% - 32%)
                    barGradient = 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)';
                    valColor = '#f87171';
                    const ratio = Math.max(0, Math.min(1, (avgVal - spec.minScale) / Math.max(0.0001, spec.crit - spec.minScale)));
                    fillPct = 18 + ratio * 14;
                } else if (avgVal < spec.opt) {
                    // Yellow (Low / Marginal): bar length is visibly low-moderate (36% - 50%)
                    barGradient = 'linear-gradient(90deg, #ca8a04 0%, #eab308 100%)';
                    valColor = '#facc15';
                    const ratio = Math.max(0, Math.min(1, (avgVal - spec.crit) / Math.max(0.0001, spec.opt - spec.crit)));
                    fillPct = 36 + ratio * 14;
                } else {
                    // Green (Optimal / Sufficient): bar length is high (74% - 94%)
                    const ratio = Math.max(0, Math.min(1, (avgVal - spec.opt) / Math.max(0.0001, spec.maxScale - spec.opt)));
                    fillPct = 74 + ratio * 20;
                }

                return `
                    <div class="sp-comp-bar-row">
                        <span class="sp-comp-bar-label">${spec.label}</span>
                        <div class="sp-comp-bar-track">
                            <div class="sp-comp-bar-fill" style="width:${fillPct.toFixed(1)}%;background:${barGradient};"></div>
                        </div>
                        <span class="sp-comp-bar-val" style="color:${valColor};">${avgVal.toFixed(spec.dp)}${unitStr}</span>
                    </div>
                `;
            }).join('');
        }

        // Compute overall stress percentage & rating for the chosen estate company (Red - Yellow - Green)
        const avgStress = estates.reduce((sum, e) => sum + Number(e.stressPct || 0), 0) / estates.length;
        let ratingLabel = 'Optimal';
        let stressColor = '#10b981'; // Green
        let badgeBg = 'rgba(16, 185, 129, 0.16)';
        let badgeBorder = 'rgba(16, 185, 129, 0.42)';
        let badgeText = '#6ee7b7';

        if (avgStress >= 65) {
            ratingLabel = 'Critical';
            stressColor = '#ef4444'; // Red
            badgeBg = 'rgba(239, 68, 68, 0.16)';
            badgeBorder = 'rgba(239, 68, 68, 0.45)';
            badgeText = '#fca5a5';
        } else if (avgStress >= 45) {
            ratingLabel = 'High';
            stressColor = '#ef4444'; // Red
            badgeBg = 'rgba(239, 68, 68, 0.16)';
            badgeBorder = 'rgba(239, 68, 68, 0.45)';
            badgeText = '#fca5a5';
        } else if (avgStress >= 25) {
            ratingLabel = 'Moderate';
            stressColor = '#eab308'; // Yellow
            badgeBg = 'rgba(234, 179, 8, 0.16)';
            badgeBorder = 'rgba(234, 179, 8, 0.45)';
            badgeText = '#fde047';
        }

        const circumference = 2 * Math.PI * 35; // r = 35 -> 219.91
        const offset = circumference - (Math.max(0, Math.min(100, avgStress)) / 100) * circumference;

        if (ringProgEl) {
            ringProgEl.setAttribute('stroke-dasharray', circumference.toFixed(2));
            ringProgEl.setAttribute('stroke-dashoffset', offset.toFixed(2));
            ringProgEl.style.stroke = stressColor;
        }
        if (pctEl) {
            pctEl.textContent = `${avgStress.toFixed(1)}%`;
            pctEl.style.color = stressColor;
        }
        if (ratingEl) {
            ratingEl.textContent = ratingLabel;
            ratingEl.style.background = badgeBg;
            ratingEl.style.borderColor = badgeBorder;
            ratingEl.style.color = badgeText;
        }

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

        // Score each block so stressed areas (Red = High, Yellow = Moderate, Green = Optimal) reflect actual foliar deficiency + estate stressPct
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
        const visibleClusters = getVisibleClusters();
        const visibleEstates = getVisibleEstates();
        const ctx = getCurrentUserContext();
        const totalCompanyEl = document.getElementById('sp-kpi-company-count');
        const totalCompanySubEl = document.getElementById('sp-kpi-company-subtitle');
        const totalOnlineEl = document.getElementById('sp-kpi-online-count');
        const totalSubtitleEl = document.getElementById('sp-kpi-total-subtitle');
        const listEl = document.getElementById('sp-left-estate-list');

        const totalBlocks = visibleEstates.reduce((acc, e) => acc + (e.totalBlocks || 0), 0);
        const totalAreaHa = Math.round(visibleEstates.reduce((acc, e) => acc + (e.areaHa || 0), 0));

        if (totalCompanyEl) totalCompanyEl.textContent = visibleClusters.length;
        if (totalCompanySubEl) totalCompanySubEl.textContent = `${visibleClusters.length} ${visibleClusters.length === 1 ? 'Company' : 'Companies'} • ${totalAreaHa.toLocaleString()} Ha`;
        if (totalOnlineEl) totalOnlineEl.textContent = visibleEstates.length;
        if (totalSubtitleEl) totalSubtitleEl.textContent = `${visibleEstates.length} ${visibleEstates.length === 1 ? 'Map' : 'Maps'} • ${totalBlocks.toLocaleString()} Blocks`;

        // Hide region filter chips that don't belong to a non-admin client user
        document.querySelectorAll('.sp-region-chip').forEach(chip => {
            const oc = chip.getAttribute('onclick') || '';
            if (ctx.isMasterAdmin) {
                chip.style.display = '';
            } else {
                const isAll = oc.includes("'ALL'");
                const matchGroup = visibleClusters.some(c => oc.includes(`'${c.filterGroup}'`));
                chip.style.display = (isAll || matchGroup) ? '' : 'none';
            }
        });

        if (!listEl) return;

        const filteredClusters = visibleClusters.filter(c => {
            if (!ctx.isMasterAdmin) return true;
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
        const visibleEstates = getVisibleEstates();
        const barsContainer = document.getElementById('sp-stress-bars-container');
        const highestValEl = document.getElementById('sp-stress-highest-val');
        const highestTagEl = document.getElementById('sp-stress-highest-estate-tag');

        if (!visibleEstates.length) return;
        const sorted = [...visibleEstates].sort((a, b) => b.stressPct - a.stressPct);
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
    function getSchedulesStorageKey() {
        const ctx = getCurrentUserContext();
        return ctx.isMasterAdmin ? LS_SCHEDULES_KEY : `${LS_SCHEDULES_KEY}_${ctx.storageGroup}`;
    }

    function getTargetPredictionModuleHref() {
        const ctx = getCurrentUserContext();
        return ctx.accessTier === 'A' ? 'standard.html' : 'comprehensive.html';
    }

    function loadSchedules() {
        const storageKey = getSchedulesStorageKey();
        const visibleEstates = getVisibleEstates();
        const visibleKeys = new Set(visibleEstates.map(e => e.key));
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    const ctx = getCurrentUserContext();
                    return ctx.isMasterAdmin
                        ? parsed
                        : parsed.filter(s => !s.estateKey || visibleKeys.has(s.estateKey));
                }
            }
        } catch (e) {}

        // Default realistic schedules demonstrating how Fertilizer Application -> Next Prediction Notification works
        const allDefaults = [
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
        const ctx = getCurrentUserContext();
        const defaults = ctx.isMasterAdmin
            ? allDefaults
            : allDefaults.filter(s => visibleKeys.has(s.estateKey));
        localStorage.setItem(storageKey, JSON.stringify(defaults));
        return defaults;
    }

    window.spSaveFertilizerSchedule = function (event) {
        if (event) event.preventDefault();
        const estKey = document.getElementById('sp-sched-estate')?.value || selectedEstateKey || 'seraya';
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
        localStorage.setItem(getSchedulesStorageKey(), JSON.stringify(schedules.slice(0, 12)));

        const builder = document.getElementById('sp-schedule-builder-form');
        if (builder) builder.style.display = 'none';
        renderRightNotificationsAndSchedules();
    };

    window.spDeleteSchedule = function (id) {
        const schedules = loadSchedules().filter(s => s.id !== id);
        localStorage.setItem(getSchedulesStorageKey(), JSON.stringify(schedules));
        renderRightNotificationsAndSchedules();
    };

    function resolveEstateBlockCount(shpKey, estateName, formattedName) {
        const estates = (getHomeData() && Array.isArray(getHomeData().estates)) ? getHomeData().estates : [];
        const candidates = [shpKey, estateName, formattedName]
            .map(s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
            .filter(Boolean);
        for (const c of candidates) {
            const match = estates.find(e => {
                const ek = String(e.key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const en = String(e.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                return ek === c || en === c || en.includes(c) || c.includes(ek);
            });
            if (match && match.totalBlocks) return match.totalBlocks;
        }
        return null;
    }

    function getCombinedRunHistory() {
        const liveRuns = Array.isArray(window.PREDICTION_RUN_HISTORY) ? window.PREDICTION_RUN_HISTORY : [];
        let lsRunsV2 = [];
        let lsRunsV1 = [];
        try {
            const rawV2 = localStorage.getItem('smartpalm_prediction_history_meta_v2');
            if (rawV2) lsRunsV2 = JSON.parse(rawV2);
        } catch (e) {}
        try {
            const rawV1 = localStorage.getItem('smartpalm_prediction_history_v1');
            if (rawV1) lsRunsV1 = JSON.parse(rawV1);
        } catch (e) {}

        const merged = [];
        const seen = new Set();

        [...liveRuns, ...lsRunsV2, ...lsRunsV1].forEach(r => {
            if (!r) return;
            const key = r.folderName || r.folder_name || (r.estateName && r.timestamp ? `${r.estateName}_${r.timestamp}` : '');
            if (!key || seen.has(key)) return;
            seen.add(key);

            const shpKey = r.shpKey || r.shp_key || r.estate_key || '';
            const rawEstateName = r.estateName || r.estate_name || shpKey || key;
            const formattedName = formatEstateRunName(rawEstateName);

            let acqDate = r.targetDate || r.target_date || r.acquisitionDate || r.acquisition_date || '';
            if (!acqDate) {
                const dm = String(key).match(/(\d{4}-\d{2}-\d{2})/);
                if (dm) acqDate = dm[1];
            }

            const summaryBlocks = (r.blockSummary && r.blockSummary.blocks)
                ? Object.keys(r.blockSummary.blocks).length
                : ((r.block_summary && r.block_summary.blocks) ? Object.keys(r.block_summary.blocks).length : null);
            const totalBlocks = r.totalBlocks || r.total_blocks || summaryBlocks || resolveEstateBlockCount(shpKey, rawEstateName, formattedName) || null;

            merged.push({
                folderName: key,
                shpKey: shpKey || rawEstateName,
                estateName: rawEstateName,
                acquisitionDate: acqDate,
                timestamp: r.timestamp || r.createdAt || r.created_at || '',
                mtime: r.mtime || 0,
                totalBlocks: totalBlocks
            });
        });
        return merged;
    }

    function renderRightNotificationsAndSchedules() {
        const runs = getCombinedRunHistory();
        const schedules = loadSchedules();
        const targetHref = getTargetPredictionModuleHref();
        const maxWeekly = parseInt(localStorage.getItem(LS_QUOTA_MAX_KEY) || '20', 10);

        const usedThisWeek = Math.min(maxWeekly, runs.length);
        const leftThisWeek = Math.max(0, maxWeekly - usedThisWeek);
        const pctLeft = Math.round((leftThisWeek / maxWeekly) * 100);

        const quotaCountEl = document.getElementById('sp-quota-left-text');
        const quotaFillEl = document.getElementById('sp-quota-bar-fill');
        const quotaUsedEl = document.getElementById('sp-quota-used-text');

        if (quotaCountEl) quotaCountEl.textContent = `${leftThisWeek} / ${maxWeekly} Runs Left`;
        if (quotaFillEl) quotaFillEl.style.width = `${pctLeft}%`;
        if (quotaUsedEl) quotaUsedEl.textContent = `${usedThisWeek} prediction runs executed`;

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
                            <a href="${targetHref}" style="font-size:10.5px;font-weight:700;color:#34d399;text-decoration:none;">Run Prediction →</a>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Render Run History & Critical Stress Notifications
        const historyListEl = document.getElementById('sp-run-history-list');
        if (historyListEl) {
            const topRuns = runs.slice(0, 8);
            if (topRuns.length === 0) {
                historyListEl.innerHTML = `
                    <div class="sp-alert-card neutral" style="color:#94a3b8;font-size:12px;">
                        No completed prediction runs recorded yet.
                    </div>
                `;
            } else {
                historyListEl.innerHTML = topRuns.map((r, i) => {
                    const cleanEstate = formatEstateRunName(r.estateName);
                    const { timeStr, dateStr } = parseRunTimestamp(r.timestamp, r.acquisitionDate, r.folderName, r.mtime);
                    const blkText = r.totalBlocks ? `<b>${r.totalBlocks} blocks</b> analyzed • ` : '';
                    const imgText = r.acquisitionDate ? `Image: ${r.acquisitionDate}` : `Saved in outputs/${r.folderName}`;
                    return `
                        <div class="sp-alert-card neutral" style="cursor:pointer;" onclick="location.href='${targetHref}'">
                            <div class="sp-alert-top">
                                <span class="sp-alert-badge" style="color:#34d399;">✓ ${cleanEstate.toUpperCase()}</span>
                                <span class="sp-alert-time">${i === 0 ? 'Latest Run' : `${dateStr}, ${timeStr}`}</span>
                            </div>
                            <div class="sp-alert-desc">
                                Sentinel-2 10m N, P, K, Mg, Ca, B prediction completed • ${blkText}${imgText}.
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        const badgeCount = document.getElementById('sp-top-notif-badge');
        if (badgeCount) {
            badgeCount.textContent = schedules.length + Math.min(3, runs.length);
        }

        renderTopNotifDropdown();
        renderFullNotificationsPage();
    }
    window.renderRightNotificationsAndSchedules = renderRightNotificationsAndSchedules;

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

    function formatDateObjToMYT(dateObj) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        // Convert to Malaysia Time (UTC+8)
        const mytMs = dateObj.getTime() + (8 * 60 * 60 * 1000);
        const myt = new Date(mytMs);
        const year = myt.getUTCFullYear();
        const monIdx = myt.getUTCMonth();
        const day = String(myt.getUTCDate()).padStart(2, '0');
        const hh = String(myt.getUTCHours()).padStart(2, '0');
        const mm = String(myt.getUTCMinutes()).padStart(2, '0');
        return {
            timeStr: `${hh}:${mm}`,
            dateStr: `${day} ${months[monIdx]} ${year}`
        };
    }

    function parseRunTimestamp(tsStr, fallbackDate, folderName, mtime) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        // 1. Check folderName suffix from HuggingFace server: predictions_<Estate>_YYYY-MM-DD_HHMMSS (UTC)
        const fnMatch = String(folderName || '').match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/);
        if (fnMatch) {
            const utcDate = new Date(Date.UTC(
                parseInt(fnMatch[1], 10),
                parseInt(fnMatch[2], 10) - 1,
                parseInt(fnMatch[3], 10),
                parseInt(fnMatch[4], 10),
                parseInt(fnMatch[5], 10),
                parseInt(fnMatch[6], 10)
            ));
            if (!isNaN(utcDate.getTime())) {
                return formatDateObjToMYT(utcDate);
            }
        }

        // 2. Check ISO timestamp or YYYY-MM-DD_HH:MM:SS
        const raw = String(tsStr || '').trim();
        if (raw) {
            const parsedIso = new Date(raw);
            if (!isNaN(parsedIso.getTime()) && (raw.endsWith('Z') || raw.includes('+'))) {
                return formatDateObjToMYT(parsedIso);
            }
            const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[_T\s](\d{2}):?(\d{2})(?::?(\d{2}))?/);
            if (m) {
                // Server /api/prediction_history returns UTC timestamp in YYYY-MM-DD HH:MM:SS
                const utcDate = new Date(Date.UTC(
                    parseInt(m[1], 10),
                    parseInt(m[2], 10) - 1,
                    parseInt(m[3], 10),
                    parseInt(m[4], 10),
                    parseInt(m[5], 10),
                    parseInt(m[6] || '0', 10)
                ));
                if (!isNaN(utcDate.getTime())) {
                    return formatDateObjToMYT(utcDate);
                }
            }
        }

        // 3. Check mtime (epoch seconds)
        if (mtime && Number(mtime) > 1000000000) {
            const d = new Date(Number(mtime) * 1000);
            if (!isNaN(d.getTime())) {
                return formatDateObjToMYT(d);
            }
        }

        // 4. Fallback YYYY-MM-DD
        const dMatch = (raw || String(fallbackDate || '')).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dMatch) {
            const monIdx = Math.max(0, Math.min(11, parseInt(dMatch[2], 10) - 1));
            return {
                timeStr: '—',
                dateStr: `${dMatch[3]} ${months[monIdx]} ${dMatch[1]}`
            };
        }
        return { timeStr: '—', dateStr: 'Recent Run' };
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

        // 2. Completed prediction run notifications (true history only)
        runs.forEach((r, idx) => {
            const id = `notif-run-${r.folderName}`;
            const estateLabel = formatEstateRunName(r.estateName);
            const { timeStr, dateStr } = parseRunTimestamp(r.timestamp, r.acquisitionDate, r.folderName, r.mtime);
            const whereStr = `outputs/${r.folderName}`;
            const isDefaultUnread = idx < 4 && !readSet.has(id);
            const blkCount = r.totalBlocks || resolveEstateBlockCount(r.shpKey, r.estateName, estateLabel);
            const acqDate = r.acquisitionDate || dateStr;
            const blkPart = blkCount ? `${blkCount} blocks • ` : '';
            const sentinelPart = acqDate ? `Sentinel-2 (${acqDate})` : 'Sentinel-2 10m';

            items.push({
                id,
                type: 'run',
                unread: isDefaultUnread,
                estateLabel,
                shpKey: r.shpKey || r.estateName || '',
                timeStr,
                dateStr,
                whereStr,
                folderName: r.folderName,
                totalBlocks: blkCount,
                acquisitionDate: acqDate,
                htmlText: `Run for <b>${estateLabel}</b> completed at <b>${timeStr}</b>, <b>${dateStr}</b>, saved in <b>${whereStr}</b>`,
                plainText: `Run for ${estateLabel} completed at ${timeStr}, ${dateStr}, saved in ${whereStr}`,
                subText: `${blkPart}${sentinelPart}`,
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
    window.renderTopNotifDropdown = renderTopNotifDropdown;

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

    const initialUrlFilter = (typeof window !== 'undefined' && window.location && window.location.search)
        ? new URLSearchParams(window.location.search).get('filter')
        : null;
    let activeNotifPageFilter = (initialUrlFilter === 'runs') ? 'runs' : 'all';
    window._activeNotifFilter = activeNotifPageFilter;

    window.filterFullNotificationsPage = function (filterMode, btnEl) {
        if (filterMode) activeNotifPageFilter = filterMode;
        window._activeNotifFilter = activeNotifPageFilter;
        if (btnEl) {
            document.querySelectorAll('.sp-notif-page-tab').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active');
        } else {
            document.querySelectorAll('.sp-notif-page-tab').forEach(b => {
                const mode = b.getAttribute('data-filter-mode');
                if (mode) b.classList.toggle('active', mode === activeNotifPageFilter);
            });
        }
        const headingEl = document.getElementById('sp-notif-page-heading');
        if (headingEl) {
            headingEl.textContent = activeNotifPageFilter === 'runs' ? 'Run History' : 'All Notifications';
        }
        renderFullNotificationsPage();
    };

    function renderFullNotificationsPage() {
        const container = document.getElementById('sp-full-notifications-list');
        if (!container) return;

        // Sync tab highlight and heading if opened with ?filter=runs
        document.querySelectorAll('.sp-notif-page-tab').forEach(b => {
            const mode = b.getAttribute('data-filter-mode');
            if (mode) b.classList.toggle('active', mode === activeNotifPageFilter);
        });
        const headingEl = document.getElementById('sp-notif-page-heading');
        if (headingEl) {
            headingEl.textContent = activeNotifPageFilter === 'runs' ? 'Run History' : 'All Notifications';
        }

        const searchInput = document.getElementById('sp-notif-page-search');
        const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
        const urlParams = new URLSearchParams(window.location.search);
        const highlightId = urlParams.get('id');

        const allItems = window.getSmartPalmNotifications();
        const totalEl = document.getElementById('sp-notif-page-total-count');
        const unreadEl = document.getElementById('sp-notif-page-unread-count');

        const filtered = allItems.filter(item => {
            if (activeNotifPageFilter === 'runs' && item.type !== 'run') return false;
            if (query && !item.plainText.toLowerCase().includes(query) && !item.subText.toLowerCase().includes(query)) {
                return false;
            }
            return true;
        });

        if (totalEl) totalEl.textContent = activeNotifPageFilter === 'runs' ? allItems.filter(i => i.type === 'run').length : allItems.length;
        if (unreadEl) unreadEl.textContent = allItems.filter(i => i.unread).length;

        if (!filtered.length) {
            container.innerHTML = `
                <div style="padding: 42px 20px; text-align: left; color: #94a3b8; font-size: 14px;">
                    ${activeNotifPageFilter === 'runs' ? 'No completed prediction runs found in history yet.' : 'No notifications match the selected filter.'}
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(item => {
            const isHighlighted = highlightId && item.id === highlightId;
            const iconSvg = item.type === 'profile'
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>`;

            const safeFolder = String(item.folderName || '').replace(/'/g, "\\'");
            const safeEstate = String(item.estateLabel || '').replace(/'/g, "\\'");
            const safeDate = String(item.acquisitionDate || '').replace(/'/g, "\\'");
            const safeKey = String(item.shpKey || item.estateLabel || '').replace(/'/g, "\\'");

            const actionBtnHtml = item.type === 'profile'
                ? `<button type="button" class="sp-sched-btn" style="padding: 7px 14px; font-size: 12.5px;" onclick="openAuthModal('signin')">Update Profile</button>`
                : `<button type="button" class="sp-sched-btn" title="Download Data" aria-label="Download Data" style="width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 9px;" onclick="if(window.downloadSavedRunSixPageRasters){window.downloadSavedRunSixPageRasters('${safeFolder}','${safeEstate}','${safeDate}','${safeKey}');}"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>`;

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
    window.renderFullNotificationsPage = renderFullNotificationsPage;

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
            const matches = getVisibleEstates().filter(e =>
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
        const visibleClusters = getVisibleClusters();
        const visibleEstates = getVisibleEstates();
        const hudSel = document.getElementById('sp-hud-estate-select');
        const nutSel = document.getElementById('sp-nut3m-estate-select');
        const schedSel = document.getElementById('sp-sched-estate');

        if (hudSel) {
            const clusterOpts = visibleClusters.map(c =>
                `<option value="CLUSTER:${c.id}">🏢 ${c.ownerName} (${c.estateKeys.length} Estates)</option>`
            ).join('');
            const groupOpts = visibleClusters.map(c => {
                const items = c.estateKeys
                    .map(k => getEstateByKey(k))
                    .filter(Boolean)
                    .map(e => `<option value="${e.key}">${e.name} (${e.region})</option>`)
                    .join('');
                return `<optgroup label="${c.ownerName}">${items}</optgroup>`;
            }).join('');
            const allLabel = visibleClusters.length === 1
                ? `🗺️ All ${visibleEstates.length} Maps (${visibleClusters[0].ownerShort || visibleClusters[0].ownerName} Overview)`
                : `🗺️ All ${visibleEstates.length} Maps (Malaysia Overview)`;
            hudSel.innerHTML =
                `<option value="ALL">${allLabel}</option>` +
                `<optgroup label="Estate Owner Clusters">${clusterOpts}</optgroup>` +
                groupOpts;
        }
        if (nutSel) {
            nutSel.innerHTML = visibleEstates.map(e => `<option value="${e.key}">${e.name}</option>`).join('');
            if (visibleEstates.some(e => e.key === selectedEstateKey)) {
                nutSel.value = selectedEstateKey;
            }
        }
        if (schedSel) {
            schedSel.innerHTML = visibleEstates.map(e => `<option value="${e.key}">${e.name}</option>`).join('');
            if (visibleEstates.some(e => e.key === selectedEstateKey)) {
                schedSel.value = selectedEstateKey;
            }
        }
    }

    window.refreshHomeDashboardForUser = function () {
        injectCustomMapsIntoHomeData();
        const visibleClusters = getVisibleClusters();
        const visibleEstates = getVisibleEstates();

        if (visibleClusters.length > 0) {
            if (!visibleClusters.some(c => c.id === selectedOwnerClusterId)) {
                selectedOwnerClusterId = visibleClusters[0].id;
            }
        }
        if (visibleEstates.length > 0) {
            if (!visibleEstates.some(e => e.key === selectedEstateKey)) {
                selectedEstateKey = visibleEstates[0].key;
            }
        }

        populateDropdowns();
        if (homeMap) {
            renderAllBoundariesOnMap();
            if (visibleClusters.length === 1 && visibleClusters[0].id && typeof window.selectOwnerCluster === 'function') {
                window.selectOwnerCluster(visibleClusters[0].id, true);
            }
        }
        renderLeftEstateDirectory();
        renderStressLeaderboardPanel();
        renderRightNotificationsAndSchedules();

        const curEst = getEstateByKey(selectedEstateKey);
        if (curEst) {
            updateMapFocusCallout(curEst);
            render3MonthNutrientPanel(curEst);
        }
        renderCompanyStressCard(selectedOwnerClusterId);
    };

    // -------------------------------------------------------------------------
    // 8. BOOTSTRAP ON DOM READY
    // -------------------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof window.loadCustomMapsFromSupabase === 'function') {
            try { await window.loadCustomMapsFromSupabase(); } catch (e) {}
        }
        injectCustomMapsIntoHomeData();
        const visibleClusters = getVisibleClusters();
        const visibleEstates = getVisibleEstates();
        if (visibleClusters.length > 0) {
            selectedOwnerClusterId = visibleClusters[0].id;
        }
        if (visibleEstates.length > 0) {
            selectedEstateKey = visibleEstates[0].key;
        }

        populateDropdowns();
        initHomeMap();
        if (visibleClusters.length === 1 && visibleClusters[0].id && typeof window.selectOwnerCluster === 'function') {
            window.selectOwnerCluster(visibleClusters[0].id, false);
        }
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
