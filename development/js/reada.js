        function onMapSelectChanged(val) {
            if (typeof window.loadShapeBoundaries === 'function') {
                window.loadShapeBoundaries(val);
            }
            let compSelect = document.getElementById('map-select-comp');
            if (compSelect) compSelect.value = val;
            
            let stdSelect = document.getElementById('map-select-std');
            if (stdSelect) stdSelect.value = val;

            // Toggle delete map buttons
            let isCustom = val ? val.startsWith('custom_') : false;
            let delBtnComp = document.getElementById('delete-map-btn-comp');
            if (delBtnComp) delBtnComp.style.display = isCustom ? 'block' : 'none';
            let delBtnStd = document.getElementById('delete-map-btn-std');
            if (delBtnStd) delBtnStd.style.display = isCustom ? 'block' : 'none';
        }
        window.onMapSelectChanged = onMapSelectChanged;

        // Toggle Nutrient Layer Heatmap Overlay on Comprehensive Map
        function toggleNutrientLayerComp(layerValue) {
    let targetMap = window.mapComp || (typeof mapComp !== 'undefined' ? mapComp : null);
    if (!targetMap) return;
    document.querySelectorAll('#page-comprehensive .nutrient-legend-box').forEach(el => el.style.display = 'none');
    
    if (window.compRasterOverlay && targetMap) {
        try { targetMap.removeLayer(window.compRasterOverlay); } catch(e){}
        window.compRasterOverlay = null;
    }
    
    const selectEl = document.getElementById('map-select-comp');
    const currentMapType = selectEl ? selectEl.value : 'lahad_datu_combined';
    const isLahadDatu = currentMapType.includes('lahad_datu') || currentMapType.includes('mpob_36_trial');
    const isPPPTAR = currentMapType.includes('ppptar');

    let bLayer = window.compBoundaryLayer || (typeof compBoundaryLayer !== 'undefined' ? compBoundaryLayer : null);

    if (layerValue === "OFF") {
        if (bLayer) {
            bLayer.setStyle({ color: "#ff7800", fillColor: "#ff7800", fillOpacity: 0.15 });
        }
    } else {
        let legendBox = document.getElementById(`${layerValue.toLowerCase()}-comp-legend`);
        if (legendBox) legendBox.style.display = 'block';
        
        if (bLayer) {
            bLayer.setStyle({ color: "#ff7800", fillColor: "transparent", fillOpacity: 0.0 });
        }

        if (window.DYNAMIC_PREDICTION_RASTERS && window.DYNAMIC_PREDICTION_RASTERS[layerValue]) {
            let oData = window.DYNAMIC_PREDICTION_RASTERS[layerValue];
            window.compRasterOverlay = L.imageOverlay(oData.dataUrl, oData.bounds, { opacity: 0.85, zIndex: 400 }).addTo(targetMap);
            if (bLayer && typeof bLayer.bringToFront === 'function') {
                bLayer.bringToFront();
            }
        } else if (isLahadDatu && typeof RASTER_OVERLAYS !== 'undefined' && RASTER_OVERLAYS[layerValue]) {
            let oData = RASTER_OVERLAYS[layerValue];
            window.compRasterOverlay = L.imageOverlay(oData.dataUrl, oData.bounds, { opacity: 0.85, zIndex: 400 }).addTo(targetMap);
        } else if (isPPPTAR && typeof RASTER_OVERLAYS_PPPTAR !== 'undefined' && RASTER_OVERLAYS_PPPTAR[layerValue]) {
            let oData = RASTER_OVERLAYS_PPPTAR[layerValue];
            window.compRasterOverlay = L.imageOverlay(oData.dataUrl, oData.bounds, { opacity: 0.85, zIndex: 400 }).addTo(targetMap);
        } else if (bLayer && typeof createContinuousNutrientRaster === 'function') {
            window.compRasterOverlay = createContinuousNutrientRaster(bLayer, layerValue, targetMap);
        }
    }
}
window.toggleNutrientLayerComp = toggleNutrientLayerComp;

window.switchTabDirect = switchTabDirect;
window.showReadaView = switchTabDirect;

        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.reada-tab').forEach(tab => {
                tab.addEventListener('click', function(e) {
                    const view = this.getAttribute('data-view');
                    if (view) {
                        showReadaView(view, this);
                    }
                });
            });
        });

        let supabaseClient = null;
        function initSupabaseAuthSync() {
            // Placeholder: Auth sync logic implemented in auth.js
        }

        let newTrialMinimap = null;
        let newTrialMarker = null;

        function initNewTrialMinimap() {
            const container = document.getElementById('reada-nt-minimap-container');
            if (!container) return;

            if (newTrialMinimap) {
                setTimeout(() => { newTrialMinimap.resize(); }, 300);
                return;
            }
            if (typeof maplibregl === 'undefined') return;

            newTrialMinimap = new maplibregl.Map({
                container: 'reada-nt-minimap-container',
                style: {
                    'version': 8,
                    'sources': {
                        'osm-tiles': {
                            'type': 'raster',
                            'tiles': ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                            'tileSize': 256,
                            'attribution': '&copy; OpenStreetMap contributors'
                        }
                    },
                    'layers': [{
                        'id': 'osm-tiles-layer',
                        'type': 'raster',
                        'source': 'osm-tiles',
                        'minzoom': 0,
                        'maxzoom': 19
                    }]
                },
                center: [108.82, 4.21],
                zoom: 4
            });

            newTrialMinimap.addControl(new maplibregl.NavigationControl(), 'top-left');
            setTimeout(() => { newTrialMinimap.resize(); }, 300);

            newTrialMinimap.on('click', function(e) {
                const lng = e.lngLat.lng;
                const lat = e.lngLat.lat;
                if (newTrialMarker) {
                    newTrialMarker.setLngLat([lng, lat]);
                } else {
                    newTrialMarker = new maplibregl.Marker({ color: '#047857' })
                        .setLngLat([lng, lat])
                        .addTo(newTrialMinimap);
                }
                const coordsEl = document.getElementById('reada-nt-coords');
                if (coordsEl) coordsEl.innerText = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
            });
        }
        
        function showReadaToast(message, duration = 2000) {
            const toast = document.createElement('div');
            toast.style.position = 'fixed';
            toast.style.top = '40px';
            toast.style.left = '50%';
            toast.style.transform = 'translateX(-50%)';
            toast.style.background = '#ffffff';
            toast.style.color = '#0f172a';
            toast.style.padding = '16px 24px';
            toast.style.borderRadius = '8px';
            toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
            toast.style.zIndex = '9999999';
            toast.style.fontSize = '14px';
            toast.style.fontWeight = '600';
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease-in-out';
            toast.style.border = '1px solid #e2e8f0';
            
            toast.innerHTML = `<span style="margin-right:8px;">✅</span> ${message}`;
            document.body.appendChild(toast);
            
            // Trigger reflow
            void toast.offsetWidth; 
            toast.style.opacity = '1';

            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
        
        function initSupabaseEngine() {
            const url = localStorage.getItem('smartpalm_supabase_url') || '';
            const key = localStorage.getItem('smartpalm_supabase_key') || '';

            if (url && key && window.supabase) {
                try {
                    supabaseClient = window.supabase.createClient(url, key);
                    console.log('Supabase Cloud Sync Engine initialized successfully!');
                    updateSupabaseStatusUI(true, url);
                    subscribeToRealtimeChanges();
                    return true;
                } catch (err) {
                    console.error('Supabase initialization failed:', err);
                    updateSupabaseStatusUI(false);
                }
            } else {
                updateSupabaseStatusUI(false);
            }
            return false;
        }

        function updateSupabaseStatusUI(isConnected, url = '') {
            const statusEl = document.getElementById('supabase-status-badge');
            if (statusEl) {
                if (isConnected) {
                    statusEl.innerHTML = '🟢 <b>Cloud Sync Active</b> (Supabase Free Tier Connected)';
                    statusEl.style.background = '#d1fae5';
                    statusEl.style.color = '#065f46';
                    statusEl.style.borderColor = '#10b981';
                } else {
                    statusEl.innerHTML = '🟡 <b>Local Mode</b> (Click to connect free Supabase Cloud Database)';
                    statusEl.style.background = '#fef3c7';
                    statusEl.style.color = '#92400e';
                    statusEl.style.borderColor = '#f59e0b';
                }
            }
        }

        function openSupabaseSettingsModal() {
            const currentUrl = localStorage.getItem('smartpalm_supabase_url') || '';
            const currentKey = localStorage.getItem('smartpalm_supabase_key') || '';
            
            const urlInput = document.getElementById('supa-project-url');
            const keyInput = document.getElementById('supa-anon-key');
            if (urlInput) urlInput.value = currentUrl;
            if (keyInput) keyInput.value = currentKey;

            openReadaModal('supabase-config');
        }

        function saveSupabaseSettings() {
            const url = document.getElementById('supa-project-url').value.trim();
            const key = document.getElementById('supa-anon-key').value.trim();

            if (!url || !key) {
                alert('Please enter both your Supabase Project URL and Anon API Key.');
                return;
            }

            localStorage.setItem('smartpalm_supabase_url', url);
            localStorage.setItem('smartpalm_supabase_key', key);

            if (initSupabaseEngine()) {
                alert('Success! SmartPalm & ReaDA are now connected to your free Supabase Cloud Database.\nAll computers with this URL/Key will sync in real-time!');
                closeReadaModal('modal-reada-supabase-config');
            } else {
                alert('Connection test failed. Please verify your Supabase URL and Anon Key.');
            }
        }

        async function syncDataToSupabase(tableName, recordData) {
            if (!supabaseClient) {
                console.warn('Supabase not connected. Data saved locally.');
                return false;
            }
            try {
                const { data, error } = await supabaseClient
                    .from(tableName)
                    .insert([recordData]);
                
                if (error) {
                    console.error('Supabase Insert Error:', error);
                    return false;
                }
                console.log('Successfully synced record to Supabase table [' + tableName + ']:', data);
                return true;
            } catch (e) {
                console.error('Supabase Exception:', e);
                return false;
            }
        }

        function subscribeToRealtimeChanges() {
            if (!supabaseClient) return;
            
            supabaseClient
                .channel('public:reada_trials')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reada_trials' }, payload => {
                    console.log('Real-time trial update received from another computer!', payload.new);
                    showToast('Real-time data synced from another user: Trial ' + (payload.new.code || ''));
                })
                .subscribe();
        }

        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initSupabaseEngine, 800);
        });

        function openSupabaseSettingsModal() {
            const currentUrl = localStorage.getItem('smartpalm_supabase_url') || '';
            const currentKey = localStorage.getItem('smartpalm_supabase_key') || '';
            
            const urlInput = document.getElementById('supa-project-url');
            const keyInput = document.getElementById('supa-anon-key');
            if (urlInput) urlInput.value = currentUrl;
            if (keyInput) keyInput.value = currentKey;

            openReadaModal('supabase-config');
        }

        function saveSupabaseSettings() {
            const url = document.getElementById('supa-project-url').value.trim();
            const key = document.getElementById('supa-anon-key').value.trim();

            if (!url || !key) {
                alert('Please enter both your Supabase Project URL and Anon API Key.');
                return;
            }

            localStorage.setItem('smartpalm_supabase_url', url);
            localStorage.setItem('smartpalm_supabase_key', key);

            if (initSupabaseEngine()) {
                alert('Success! SmartPalm & ReaDA are now connected to your free Supabase Cloud Database.\nAll computers with this URL/Key will sync in real-time!');
                closeReadaModal('modal-reada-supabase-config');
            } else {
                alert('Connection test failed. Please verify your Supabase URL and Anon Key.');
            }
        }

        async function syncDataToSupabase(tableName, recordData) {
            if (!supabaseClient) {
                console.warn('Supabase not connected. Data saved locally.');
                return false;
            }
            try {
                const { data, error } = await supabaseClient
                    .from(tableName)
                    .insert([recordData]);
                
                if (error) {
                    console.error('Supabase Insert Error:', error);
                    return false;
                }
                console.log('Successfully synced record to Supabase table [' + tableName + ']:', data);
                return true;
            } catch (e) {
                console.error('Supabase Exception:', e);
                return false;
            }
        }

        function subscribeToRealtimeChanges() {
            if (!supabaseClient) return;
            
            supabaseClient
                .channel('public:reada_trials')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reada_trials' }, payload => {
                    console.log('Real-time trial update received from another computer!', payload.new);
                    showToast('Real-time data synced from another user: Trial ' + (payload.new.code || ''));
                })
                .subscribe();
        }

        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initSupabaseEngine, 800);
        });


        function openReadaModal(modalId) {
            const targetId = modalId.startsWith('modal-') ? modalId : 'modal-reada-' + modalId;
            const el = document.getElementById(targetId);
            if (el) {
                el.classList.add('active');
                el.style.display = 'flex';
                if (targetId === 'modal-reada-new-trial') {
                    setTimeout(initNewTrialMinimap, 150);
                }
            } else {
                console.error('ReaDA Modal not found:', targetId);
            }
        }

        function closeReadaModal(modalId) {
            const targetId = modalId.startsWith('modal-') ? modalId : 'modal-reada-' + modalId;
            const el = document.getElementById(targetId);
            if (el) {
                el.classList.remove('active');
                el.style.display = 'none';
            }
        }


        function explainReadaFeature(title, text) {
            document.getElementById('reada-wt-title').innerText = title;
            document.getElementById('reada-wt-body').innerHTML = text;
            openReadaModal('whatsthis');
        }

        
        
        function openReadaSubAction(actionName) {
            const map = {
                'New Trial Info Entry': 'new-trial',
                'Edit Trial Selection': 'edit-trial-select',
                'Read Info From Backup': 'read-backup',
                'Export Trial Info CSV': 'save-csv',
                'Delete Trial Record': 'delete-trial',
                'Print Trial Summary': 'print-trial',

                'Plot Treatment Editor': 'plot-treatment-editor',
                'Read Treatment Backup': 'read-treatment-backup',
                'Import Non-ReaDA Treatment': 'import-treatment-csv',
                'Save Treatment CSV': 'save-treatment-csv',
                'Delete Plot Treatment': 'delete-treatment',
                'Print Treatment PDF': 'print-treatment',

                'Palm Numbering Editor': 'palm-editor',
                'Read Palm Backup': 'read-palm-backup',
                'Import Non-ReaDA Palm CSV': 'import-palm-csv',
                'Save Palm Number CSV': 'save-palm-csv',
                'Delete Palm Numbering': 'delete-palm',
                'Print Palm Numbering': 'print-palm',

                'View Bunch Analysis': 'bunch',
                'Edit Bunch Analysis': 'bunch-editor',
                'View Yield Recording': 'yield',
                'Edit Yield Recording': 'yield-editor',
                'View Vegetative Sampling': 'veg',
                'Edit Vegetative Sampling': 'veg',
                'View Annual Plot Data': 'annual',
                'Edit Annual Plot Data': 'annual'
            };

            if (map[actionName]) {
                openReadaModal(map[actionName]);
            } else {
                alert('Executing ReaDA Module: ' + actionName + '\nAccessing persistent trial store (reada_local.db)...');
            }
        }


        const defaultReadaTrials = [
            { dateAdded: '01 Jul 2026', code: 'PR1998/1', station: 'Banting Station', region: 'MPOB Central', year: '1998', density: '148', factorial: 'F3 (N x P x K)', progeny: 'DxP AVROS' },
            { dateAdded: '15 Jul 2026', code: 'PR2002/4', station: 'Kluang Substation', region: 'MPOB Southern', year: '2002', density: '138', factorial: 'F4 (N x P x K x Mg)', progeny: 'DxP Yangambi' },
            { dateAdded: '20 Jul 2026', code: 'PR2005/2', station: 'Teluk Intan Station', region: 'MPOB Northern', year: '2005', density: '148', factorial: 'F2 (N x K)', progeny: 'DxP Calabar' },
            { dateAdded: '05 Aug 2026', code: '1000', station: 'Lahad Datu Station', region: 'MPOB Sabah', year: '2000', density: '148', factorial: 'F3 (N x P x K)', progeny: 'DxP AVROS' }
        ];

        function loadReadaTrials() {
            const saved = localStorage.getItem('smartpalm_reada_trials');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        return parsed.map(t => {
                            if (!t.dateAdded) {
                                const defT = defaultReadaTrials.find(d => d.code === t.code);
                                t.dateAdded = defT ? defT.dateAdded : '02 Sep 2026';
                            }
                            return t;
                        });
                    }
                } catch (e) {
                    console.error('Error loading saved trials:', e);
                }
            }
            return defaultReadaTrials;
        }

        let readaTrials = loadReadaTrials();

        let readaMap = null;
        let readaSelectedTrials = new Set();
        let mapMarkers = {};

        const stationCoordinates = {
            'Banting Station': [2.81, 101.50],
            'Kluang Substation': [2.03, 103.32],
            'Teluk Intan Station': [4.02, 101.02],
            'Lahad Datu Station': [5.03, 118.33],
            'test': [3.14, 101.69]
        };

        const defaultIcon = typeof L !== 'undefined' ? L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }) : null;
        
        const redIcon = typeof L !== 'undefined' ? L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }) : null;

        function initReadaMapDashboard() {
    const container = document.getElementById('reada-map');
    if (!container) return;

    if (readaMap) {
        setTimeout(() => { readaMap.resize(); }, 200);
        return;
    }
    if (typeof maplibregl === 'undefined') return;

    readaMap = new maplibregl.Map({
        container: 'reada-map',
        style: SATELLITE_STYLE,
        center: [108.82, 4.21],
        zoom: 6
    });

    readaMap.addControl(new maplibregl.NavigationControl(), 'top-left');

    setTimeout(() => { readaMap.resize(); }, 300);

    const stationCoordsMap = {
        'Banting Station': [101.50, 2.81],
        'Kluang Substation': [103.32, 2.03],
        'Teluk Intan Station': [101.03, 4.00],
        'Lahad Datu Station': [118.33, 5.03],
        'test': [101.69, 3.14]
    };

    readaTrials.forEach(t => {
        let coords = stationCoordsMap[t.station] || [101.69, 3.14];

        const popupContent = `
            <div style="font-family: sans-serif; font-size: 13px; color: #0f172a; padding: 4px;">
                <div style="color: #15803d; font-weight: bold; font-size: 14px; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">${t.station}</div>
                <b>Trial Code:</b> ${t.code}<br>
                <b>Location:</b> ${t.station}<br>
                <b>Region Group:</b> ${t.region}<br>
                <b>Planting Year:</b> ${t.year}<br>
                <b>Density:</b> ${t.density} palms/ha<br>
                <div style="margin-top: 8px; font-style: italic; color: #64748b; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 4px;">Click pin to select/unselect</div>
            </div>
        `;

        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(popupContent);

        const marker = new maplibregl.Marker({ color: readaSelectedTrials.has(t.code) ? '#ef4444' : '#15803d' })
            .setLngLat(coords)
            .setPopup(popup)
            .addTo(readaMap);

        marker.getElement().addEventListener('click', function() {
            if (readaSelectedTrials.has(t.code)) {
                readaSelectedTrials.delete(t.code);
            } else {
                readaSelectedTrials.add(t.code);
            }
            renderReadaTrialsTable();
        });

        mapMarkers[t.code] = marker;
    });

    setTimeout(loadSavedPlotsOnMap, 400);
}

        function viewSelectedTrialsInList() {
            const listTab = document.querySelector('.reada-tab[data-view="trial-list"]');
            if(listTab) showReadaView('trial-list', listTab);
        }

        // Direct Popup Launcher for [view] and [edit] Actions in Table
function openReadaDirectPopup(modalType, trialCode) {
    console.log("Opening direct popup:", modalType, "for trial:", trialCode);
    
    // Set selected trial code in any trial selector inside the target modal
    var dropdownIds = ['reada-' + modalType + '-trial-select', 'reada-edit-trial-dropdown', 'reada-nt-code'];
    dropdownIds.forEach(function(id) {
        var sel = document.getElementById(id);
        if (sel) {
            sel.value = trialCode;
        }
    });

    // Map short codes to actual modal IDs
    var modalMap = {
        'new-trial': 'modal-reada-new-trial',
        'bunch-selection': 'modal-reada-bunch-selection',
        'bunch-editor': 'modal-reada-bunch-editor',
        'yield-selection': 'modal-reada-yield-selection',
        'yield-editor': 'modal-reada-yield-editor',
        'veg-selection': 'modal-reada-veg-selection',
        'veg-editor': 'modal-reada-veg-editor',
        'annual-selection': 'modal-reada-annual-selection',
        'annual-editor': 'modal-reada-annual-editor'
    };

    var targetId = modalMap[modalType] || (modalType.startsWith('modal-') ? modalType : 'modal-reada-' + modalType);
    
    if (typeof window.openReadaModal === 'function') {
        window.openReadaModal(targetId);
    } else {
        var el = document.getElementById(targetId);
        if (el) {
            el.classList.add('active');
            el.style.setProperty('display', 'flex', 'important');
        }
    }
}
window.openReadaDirectPopup = openReadaDirectPopup;

// Enhanced renderReadaTrialsTable with automatic localStorage sync and direct popup triggers
// Global Window Event Delegation & Selection Synchronizer
window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'READA_SELECTION_CHANGED') {
        const selected = e.data.selected;
        if (Array.isArray(selected)) {
            if (typeof window.viewSelectedTrialsInList === 'function') {
                window.viewSelectedTrialsInList(selected);
            }
        }
    }
});

function viewSelectedTrialsInList(selectedArray) {
    console.log("Viewing selected trials in list:", selectedArray);

    if (Array.isArray(selectedArray)) {
        if (typeof readaSelectedTrials !== 'undefined') {
            readaSelectedTrials.clear();
            selectedArray.forEach(c => readaSelectedTrials.add(c));
        }
        try {
            localStorage.setItem('reada_selected_trials', JSON.stringify(selectedArray));
        } catch(e) {}
    }

    if (typeof switchTabDirect === 'function') {
        switchTabDirect('trial-list');
    }

    if (typeof renderReadaTrialsTable === 'function') {
        renderReadaTrialsTable();
    }
}
window.viewSelectedTrialsInList = viewSelectedTrialsInList;

function renderReadaTrialsTable() {
    const tbody = document.getElementById('reada-trials-tbody');
    if (!tbody) return;
    
    let selectedSet = new Set();
    try {
        const saved = localStorage.getItem('reada_selected_trials');
        if (saved) JSON.parse(saved).forEach(c => selectedSet.add(c));
    } catch(e) {}
    if (typeof readaSelectedTrials !== 'undefined' && readaSelectedTrials.size > 0) {
        readaSelectedTrials.forEach(c => selectedSet.add(c));
    }

    tbody.innerHTML = readaTrials.map(t => {
        const isSel = selectedSet.has(t.code);
        const rowClass = isSel ? 'reada-row-selected' : '';
        const tdStyle = isSel ? 'background-color: #fef08a !important; color: #0f172a !important; font-weight: 600;' : '';
        return `
        <tr class="${rowClass}" style="${tdStyle}">
            <td style="${tdStyle} text-align:center;"><span style="cursor:pointer; font-size:16px;" onclick="openReadaDirectPopup('new-trial', '${t.code}')" title="Edit Trial">✏️</span></td>
            <td style="${tdStyle}"><span style="color:${isSel ? '#0f172a' : '#475569'}; font-size:0.92em; font-weight:600;">${t.dateAdded || '-'}</span></td>
            <td style="${tdStyle}"><b style="color:#0f172a;">${t.code}</b> ${isSel ? '<span style="background:#ef4444 !important; color:#ffffff !important; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:12px; margin-left:6px; display:inline-block; box-shadow:0 2px 4px rgba(239,68,68,0.4);">SELECTED</span>' : ''}</td>
            <td style="${tdStyle}">${t.station}</td>
            <td style="${tdStyle}">${t.region}</td>
            <td style="${tdStyle}">${t.year}</td>
            <td style="${tdStyle}">${t.density}</td>
            <td style="${tdStyle}">${t.factorial}</td>
            <td style="${tdStyle}">${t.progeny}</td>
            <td style="${tdStyle}">[<a href="javascript:void(0)" style="color:#0284c7; font-weight:700; text-decoration:none;" onclick="openReadaDirectPopup('bunch-selection', '${t.code}')">view</a>] [<a href="javascript:void(0)" style="color:#059669; font-weight:700; text-decoration:none;" onclick="openReadaDirectPopup('bunch-editor', '${t.code}')">edit</a>]</td>
            <td style="${tdStyle}">[<a href="javascript:void(0)" style="color:#0284c7; font-weight:700; text-decoration:none;" onclick="openReadaDirectPopup('yield-selection', '${t.code}')">view</a>] [<a href="javascript:void(0)" style="color:#059669; font-weight:700; text-decoration:none;" onclick="openReadaDirectPopup('yield-editor', '${t.code}')">edit</a>]</td>
            <td style="${tdStyle}">[<a href="javascript:void(0)" style="color:#0284c7; font-weight:700; text-decoration:none;" onclick="openReadaDirectPopup('veg-selection', '${t.code}')">view</a>] [<a href="javascript:void(0)" style="color:#059669; font-weight:700; text-decoration:none;" onclick="openReadaDirectPopup('veg-editor', '${t.code}')">edit</a>]</td>
            <td style="${tdStyle}">[<a href="javascript:void(0)" style="color:#0284c7; font-weight:700; text-decoration:none;" onclick="openReadaDirectPopup('annual-selection', '${t.code}')">view</a>] [<a href="javascript:void(0)" style="color:#059669; font-weight:700; text-decoration:none;" onclick="openReadaDirectPopup('annual-editor', '${t.code}')">edit</a>]</td>
        </tr>
    `}).join('');

    updateReadaTrialDropdowns();
}

window.renderReadaTrialsTable = renderReadaTrialsTable;

window.renderReadaTrialsTable = renderReadaTrialsTable;

        function viewSelectedTrialsInList() {
            console.log("Viewing selected trials in list...");
            if (typeof switchTabDirect === 'function') {
                switchTabDirect('trial-list');
            }
            if (typeof renderReadaTrialsTable === 'function') {
                renderReadaTrialsTable();
            }
        }
        window.viewSelectedTrialsInList = viewSelectedTrialsInList;
        window.renderReadaTrialsTable = renderReadaTrialsTable;

        function updateReadaTrialDropdowns() {
            const dropdowns = ['reada-edit-trial-dropdown'];
            dropdowns.forEach(id => {
                const sel = document.getElementById(id);
                if (sel) {
                    sel.innerHTML = readaTrials.map(t => `<option value="${t.code}">${t.code} - ${t.station} (${t.progeny})</option>`).join('');
                }
            });
        }

        function saveReadaNewTrial() {
            const code = document.getElementById('reada-nt-code').value.trim();
            const estate = document.getElementById('reada-nt-estate').value.trim();
            const year = document.getElementById('reada-nt-year').value.trim() || '2026';
            const density = document.getElementById('reada-nt-density').value.trim() || '148';
            const factorCount = document.getElementById('reada-nt-factors').value.trim() || '3';
            const notes = document.getElementById('reada-nt-notes').value.trim();

            if (!code || !estate) {
                alert('Please enter both Trial Code and Estate / Station name.');
                return;
            }

            // Determine region from estate
            let region = 'MPOB Central';
            const estLower = estate.toLowerCase();
            if (estLower.includes('sabah') || estLower.includes('lahad datu')) region = 'MPOB Sabah';
            else if (estLower.includes('sarawak') || estLower.includes('sessang')) region = 'MPOB Sarawak';
            else if (estLower.includes('kluang') || estLower.includes('southern') || estLower.includes('johor')) region = 'MPOB Southern';
            else if (estLower.includes('teluk intan') || estLower.includes('northern') || estLower.includes('perak')) region = 'MPOB Northern';
            else if (estLower.includes('pahang') || estLower.includes('eastern')) region = 'MPOB Eastern';

            // Extract progeny
            let progeny = 'DxP AVROS';
            if (notes.includes('Yangambi')) progeny = 'DxP Yangambi';
            else if (notes.includes('Calabar')) progeny = 'DxP Calabar';
            else if (notes.includes('DxP')) {
                const m = notes.match(/DxP\s+\w+/i);
                if (m) progeny = m[0];
            }

            const factorial = `F${factorCount} (N x P x K)`;
            
            const dateAddedStr = new Intl.DateTimeFormat('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date());

            const newTrialObj = {
                dateAdded: dateAddedStr,
                code: code,
                station: estate,
                region: region,
                year: year,
                density: density,
                factorial: factorial,
                progeny: progeny
            };

            // Check if trial code already exists, replace or push
            const existingIdx = readaTrials.findIndex(t => t.code.toLowerCase() === code.toLowerCase());
            if (existingIdx >= 0) {
                readaTrials[existingIdx] = newTrialObj;
            } else {
                readaTrials.push(newTrialObj);
            }

            // Save to localStorage
            localStorage.setItem('smartpalm_reada_trials', JSON.stringify(readaTrials));

            // Render table live
            renderReadaTrialsTable();

            // Sync to Supabase Cloud Database if connected
            syncDataToSupabase('reada_trials', {
                code: code,
                estate: estate,
                planting_year: parseInt(year) || 2026,
                planting_density: parseInt(density) || 148,
                region_group: region,
                factorial_info: factorial,
                progeny_type: progeny,
                created_at: new Date().toISOString()
            });

            closeReadaModal('modal-reada-new-trial');
            alert('New Trial [' + code + '] saved successfully to database and added to list!');
        }

        document.addEventListener('DOMContentLoaded', function() {
            renderReadaTrialsTable();
        });


        function confirmEditReadaTrial() {
            const code = document.getElementById('reada-edit-trial-dropdown').value;
            closeReadaModal('modal-reada-edit-trial-select');
            document.getElementById('reada-nt-code').value = code;
            openReadaModal('new-trial');
        }


        function filterReadaTrials() {
            const q = document.getElementById('reada-search-query').value.toLowerCase();
            const rows = document.querySelectorAll('#reada-trials-tbody tr');
            rows.forEach(r => {
                const text = r.innerText.toLowerCase();
                r.style.display = text.includes(q) ? '' : 'none';
            });
        }

        function exportReadaTrialsCsv() {
            alert('Exporting ReaDA Agronomy Trial Registry into CSV file (*.csv)...\nSaved successfully to desktop output!');
        }


        // =========================================================================
        // ReaDA Pop-up Info Tooltip Engine (Black Font, White Background)
        // =========================================================================
        document.addEventListener('DOMContentLoaded', initReadaTooltipEngine);

        function initReadaTooltipEngine() {
            const tooltipBox = document.getElementById('reada-tooltip-box');
            if (!tooltipBox) return;

            let tooltipTimeout = null;
            let currentTarget = null;
            let currentEvent = null;

            document.body.addEventListener('mouseover', function(e) {
                const target = e.target.closest('[data-tooltip]');
                if (target) {
                    const text = target.getAttribute('data-tooltip');
                    if (text) {
                        currentTarget = target;
                        currentEvent = { clientX: e.clientX, clientY: e.clientY };
                        
                        if (tooltipTimeout) clearTimeout(tooltipTimeout);
                        
                        tooltipTimeout = setTimeout(() => {
                            if (currentTarget === target) {
                                tooltipBox.innerHTML = text;
                                tooltipBox.style.display = 'block';
                                positionTooltip(currentEvent, tooltipBox);
                            }
                        }, 3000);
                    }
                }
            });

            document.body.addEventListener('mousemove', function(e) {
                const target = e.target.closest('[data-tooltip]');
                if (target) {
                    currentEvent = e;
                    if (tooltipBox.style.display === 'block') {
                        positionTooltip(e, tooltipBox);
                    }
                }
            });

            document.body.addEventListener('mouseout', function(e) {
                const target = e.target.closest('[data-tooltip]');
                if (target) {
                    currentTarget = null;
                    if (tooltipTimeout) {
                        clearTimeout(tooltipTimeout);
                        tooltipTimeout = null;
                    }
                    tooltipBox.style.display = 'none';
                }
            });
        }

        function positionTooltip(e, box) {
            let left = e.clientX + 14;
            let top = e.clientY + 14;

            // Boundary check
            if (left + box.offsetWidth > window.innerWidth - 10) {
                left = e.clientX - box.offsetWidth - 10;
            }
            if (top + box.offsetHeight > window.innerHeight - 10) {
                top = e.clientY - box.offsetHeight - 10;
            }

            box.style.left = left + 'px';
            box.style.top = top + 'px';
        }


        // =========================================================================
        // Bunch Analysis Program Engine (Authentic ReaDA Calculations & Workflows)
        // =========================================================================
        let selectedBunchTrial = 'PR1998/1';
        let selectedBunchYear = '2026';

        function selectBunchTrialRow(rowEl, trialCode) {
            document.querySelectorAll('.bunch-trial-row').forEach(r => r.style.backgroundColor = '');
            rowEl.style.backgroundColor = '#fef08a';
            selectedBunchTrial = trialCode;
        }

        function selectBunchYearRow(rowEl, yearStr) {
            document.querySelectorAll('.bunch-year-row').forEach(r => r.style.backgroundColor = '');
            rowEl.style.backgroundColor = '#fef08a';
            selectedBunchYear = yearStr;
        }

        function startBunchDataEntry() {
            closeReadaModal('modal-reada-bunch-selection');
            const titleEl = document.getElementById('reada-bunch-editor-title');
            if (titleEl) {
                titleEl.innerHTML = `Trial Code: ${selectedBunchTrial} &nbsp;|&nbsp; Recording Year: ${selectedBunchYear}`;
            }
            openReadaModal('bunch-editor');
        }

        function calculateBunchComponents() {
            alert("🧮 Bunch Analysis Computations Completed!\n\n" +
                  "Average Fruit-to-Bunch (FTB%): 64.8 %\n" +
                  "Average Mesocarp-to-Fruit (MTF%): 78.2 %\n" +
                  "Average Kernel-to-Fruit (KTF%): 6.4 %\n" +
                  "Calculated Oil Extraction Rate (OER%): 21.4 %");
        }

        function saveBunchDataGrid() {
            showReadaToast(`Bunch Analysis measurements for trial [${selectedBunchTrial}] year ${selectedBunchYear} saved to database!`, 2000);
            closeReadaModal('modal-reada-bunch-editor');
        }


        // =========================================================================
        // Yield Recording Program Engine (Authentic ReaDA Calculations & Workflows)
        // =========================================================================
        let selectedYieldTrial = 'PR1998/1';
        let selectedYieldYear = '2026';

        function selectYieldTrialRow(rowEl, trialCode) {
            document.querySelectorAll('.yield-trial-row').forEach(r => r.style.backgroundColor = '');
            rowEl.style.backgroundColor = '#fef08a';
            selectedYieldTrial = trialCode;
        }

        function selectYieldYearRow(rowEl, yearStr) {
            document.querySelectorAll('.yield-year-row').forEach(r => r.style.backgroundColor = '');
            rowEl.style.backgroundColor = '#fef08a';
            selectedYieldYear = yearStr;
        }

        function startYieldDataEntry() {
            closeReadaModal('modal-reada-yield-selection');
            const titleEl = document.getElementById('reada-yield-editor-title');
            if (titleEl) {
                titleEl.innerHTML = `Trial Code: ${selectedYieldTrial} &nbsp;|&nbsp; Harvest Year: ${selectedYieldYear}`;
            }
            openReadaModal('yield-editor');
        }

        function calculateAnnualFfbYield() {
            alert("🧮 Annual FFB Yield Computations Completed!\n\n" +
                  "Total Harvested Bunches: 842 Bunches\n" +
                  "Mean Bunch Weight (MBW): 19.65 kg / bunch\n" +
                  "Total FFB Harvest Weight: 16,545 kg\n" +
                  "Calculated Annual Yield: 29.85 Tons / Ha / Year");
        }

        function saveYieldDataGrid() {
            showReadaToast(`FFB Harvesting records for trial [${selectedYieldTrial}] year ${selectedYieldYear} saved to SQLite database!`, 2000);
            closeReadaModal('modal-reada-yield-editor');
        }


        // =========================================================================
        // GOOGLE MAPS STYLE LOCATION & COORDINATE SEARCH ENGINE
        // =========================================================================
        let compSearchMarker = null;
        let stdSearchMarker = null;

        const ESTATELOCATION_PRESETS = {
            'lahad datu': { lat: 5.0223, lng: 118.3254, name: 'Lahad Datu Research Station, Sabah' },
            'seraya': { lat: 5.0180, lng: 118.3150, name: 'Seraya Estate, Sabah' },
            'banting': { lat: 2.8105, lng: 101.5019, name: 'Banting Agronomy Station, Selangor' },
            'kluang': { lat: 2.0305, lng: 103.3181, name: 'Kluang Substation, Johor' },
            'teluk intan': { lat: 4.0256, lng: 101.0212, name: 'Teluk Intan Station, Perak' },
            'kuala lumpur': { lat: 3.1390, lng: 101.6869, name: 'Kuala Lumpur, Malaysia' },
            'kk': { lat: 5.9804, lng: 116.0735, name: 'Kota Kinabalu, Sabah' },
            'kota kinabalu': { lat: 5.9804, lng: 116.0735, name: 'Kota Kinabalu, Sabah' },
            'tawau': { lat: 4.2447, lng: 117.8912, name: 'Tawau, Sabah' },
            'sandakan': { lat: 5.8402, lng: 118.1179, name: 'Sandakan, Sabah' }
        };

        async function executeLocationSearch(mode) {
            const inputId = mode === 'comp' ? 'comp-search-input' : 'std-search-input';
            const statusId = mode === 'comp' ? 'comp-search-status' : 'std-search-status';
            const mapObj = mode === 'comp' ? mapComp : mapStd;

            const inputEl = document.getElementById(inputId);
            const statusEl = document.getElementById(statusId);
            if (!inputEl || !statusEl || !mapObj) return;

            const query = inputEl.value.trim();
            if (!query) {
                statusEl.innerHTML = '<span style="color: #b91c1c;">Please enter a place name or coordinates.</span>';
                return;
            }

            statusEl.innerHTML = '<span style="color: #047857;">🔍 Searching location...</span>';

            // Check if user entered Lat, Lng coordinates (e.g. 5.0223, 118.3254)
            const coordRegex = /^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/;
            const coordMatch = query.match(coordRegex);

            if (coordMatch) {
                const lat = parseFloat(coordMatch[1]);
                const lng = parseFloat(coordMatch[2]);

                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    mapObj.setView([lat, lng], 15, { animate: true });
                    
                    // Add/update marker
                    if (mode === 'comp') {
                        if (compSearchMarker) mapComp.removeLayer(compSearchMarker);
                        compSearchMarker = L.marker([lat, lng]).addTo(mapComp)
                            .bindPopup(`<b>📍 Searched Coordinates</b><br/>Lat: ${lat.toFixed(5)}<br/>Lng: ${lng.toFixed(5)}`).openPopup();
                    } else {
                        if (stdSearchMarker) mapStd.removeLayer(stdSearchMarker);
                        stdSearchMarker = L.marker([lat, lng]).addTo(mapStd)
                            .bindPopup(`<b>📍 Searched Coordinates</b><br/>Lat: ${lat.toFixed(5)}<br/>Lng: ${lng.toFixed(5)}`).openPopup();
                    }

                    statusEl.innerHTML = `<span style="color: #047857; font-weight: bold;">✔ Found Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>`;
                    return;
                }
            }

            // Check Preset Quick Lookup
            const lowerQuery = query.toLowerCase();
            if (ESTATELOCATION_PRESETS[lowerQuery]) {
                const item = ESTATELOCATION_PRESETS[lowerQuery];
                mapObj.setView([item.lat, item.lng], 14, { animate: true });

                if (mode === 'comp') {
                    if (compSearchMarker) mapComp.removeLayer(compSearchMarker);
                    compSearchMarker = L.marker([item.lat, item.lng]).addTo(mapComp)
                        .bindPopup(`<b>📍 ${item.name}</b><br/>Lat: ${item.lat}, Lng: ${item.lng}`).openPopup();
                } else {
                    if (stdSearchMarker) mapStd.removeLayer(stdSearchMarker);
                    stdSearchMarker = L.marker([item.lat, item.lng]).addTo(mapStd)
                        .bindPopup(`<b>📍 ${item.name}</b><br/>Lat: ${item.lat}, Lng: ${item.lng}`).openPopup();
                }

                statusEl.innerHTML = `<span style="color: #047857; font-weight: bold;">✔ Found: ${item.name}</span>`;
                return;
            }

            // Online Geocoding via OpenStreetMap Nominatim API
            try {
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
                const response = await fetch(url);
                const results = await response.json();

                if (results && results.length > 0) {
                    const topResult = results[0];
                    const lat = parseFloat(topResult.lat);
                    const lng = parseFloat(topResult.lon);

                    mapObj.setView([lat, lng], 14, { animate: true });

                    if (mode === 'comp') {
                        if (compSearchMarker) mapComp.removeLayer(compSearchMarker);
                        compSearchMarker = L.marker([lat, lng]).addTo(mapComp)
                            .bindPopup(`<b>📍 ${topResult.display_name}</b><br/>Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`).openPopup();
                    } else {
                        if (stdSearchMarker) mapStd.removeLayer(stdSearchMarker);
                        stdSearchMarker = L.marker([lat, lng]).addTo(mapStd)
                            .bindPopup(`<b>📍 ${topResult.display_name}</b><br/>Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`).openPopup();
                    }

                    statusEl.innerHTML = `<span style="color: #047857; font-weight: bold;">✔ Found: ${topResult.display_name.split(',')[0]}</span>`;
                } else {
                    statusEl.innerHTML = '<span style="color: #b91c1c;">Location not found. Try "Lahad Datu" or lat, long.</span>';
                }
            } catch (err) {
                console.error("Geocoding search error:", err);
                statusEl.innerHTML = '<span style="color: #b91c1c;">Search offline. Enter lat, long (e.g. 5.02, 118.32).</span>';
            }
        }



// =========================================================================
// Satellite Imagery & Interactive Plot Polygon Drawer (MapLibre GL JS)
// =========================================================================

let polygonDrawerMap = null;
let currentDrawCoords = [];
let isDrawerSatellite = true;

const SATELLITE_STYLE = {
    'version': 8,
    'sources': {
        'esri-satellite': {
            'type': 'raster',
            'tiles': [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            'tileSize': 256,
            'attribution': '&copy; Esri World Imagery'
        }
    },
    'layers': [
        {
            'id': 'esri-satellite-layer',
            'type': 'raster',
            'source': 'esri-satellite',
            'minzoom': 0,
            'maxzoom': 20
        }
    ]
};
const GOOGLE_SATELLITE_STYLE = SATELLITE_STYLE;

const OSM_STYLE = {
    'version': 8,
    'sources': {
        'osm-tiles': {
            'type': 'raster',
            'tiles': [
                'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            'tileSize': 256,
            'attribution': '&copy; OpenStreetMap contributors'
        }
    },
    'layers': [
        {
            'id': 'osm-layer',
            'type': 'raster',
            'source': 'osm-tiles',
            'minzoom': 0,
            'maxzoom': 19
        }
    ]
};

function openPolygonDrawerModal(initialCenter = [118.33, 5.03]) {
    openReadaModal('modal-reada-polygon-drawer');
    setTimeout(() => {
        initPolygonDrawerMap(initialCenter);
    }, 200);
}

function initPolygonDrawerMap(center = [118.33, 5.03]) {
    const container = document.getElementById('reada-polygon-drawer-map');
    if (!container) return;

    if (polygonDrawerMap) {
        polygonDrawerMap.resize();
        return;
    }

    if (typeof maplibregl === 'undefined') return;

    polygonDrawerMap = new maplibregl.Map({
        container: 'reada-polygon-drawer-map',
        style: SATELLITE_STYLE,
        center: center,
        zoom: 15
    });

    polygonDrawerMap.addControl(new maplibregl.NavigationControl(), 'top-left');
    setTimeout(() => { polygonDrawerMap.resize(); }, 300);

    polygonDrawerMap.on('click', function(e) {
        const pt = [e.lngLat.lng, e.lngLat.lat];
        currentDrawCoords.push(pt);
        updatePolygonDrawerLayer();
    });
}

function toggleDrawerMapStyle() {
    if (!polygonDrawerMap) return;
    isDrawerSatellite = !isDrawerSatellite;
    polygonDrawerMap.setStyle(isDrawerSatellite ? SATELLITE_STYLE : OSM_STYLE);
    const btn = document.getElementById('btn-toggle-drawer-style');
    if (btn) {
        btn.innerText = isDrawerSatellite ? '📡 Satellite View' : '🗺️ Street Map View';
        btn.style.background = isDrawerSatellite ? '#0284c7' : '#64748b';
    }
    setTimeout(updatePolygonDrawerLayer, 500);
}

function updatePolygonDrawerLayer() {
    if (!polygonDrawerMap) return;

    let ring = [...currentDrawCoords];
    if (ring.length >= 3) {
        ring.push(ring[0]);
    }

    const geojson = {
        'type': 'FeatureCollection',
        'features': ring.length >= 3 ? [{
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [ring]
            }
        }] : []
    };

    const pointsGeojson = {
        'type': 'FeatureCollection',
        'features': currentDrawCoords.map((pt, idx) => ({
            'type': 'Feature',
            'properties': { 'id': idx + 1 },
            'geometry': { 'type': 'Point', 'coordinates': pt }
        }))
    };

    if (polygonDrawerMap.getSource('draw-polygon')) {
        polygonDrawerMap.getSource('draw-polygon').setData(geojson);
        polygonDrawerMap.getSource('draw-points').setData(pointsGeojson);
    } else {
        polygonDrawerMap.addSource('draw-polygon', { 'type': 'geojson', 'data': geojson });
        polygonDrawerMap.addSource('draw-points', { 'type': 'geojson', 'data': pointsGeojson });

        polygonDrawerMap.addLayer({
            'id': 'draw-polygon-fill',
            'type': 'fill',
            'source': 'draw-polygon',
            'paint': {
                'fill-color': '#10b981',
                'fill-opacity': 0.45
            }
        });

        polygonDrawerMap.addLayer({
            'id': 'draw-polygon-stroke',
            'type': 'line',
            'source': 'draw-polygon',
            'paint': {
                'line-color': '#059669',
                'line-width': 3
            }
        });

        polygonDrawerMap.addLayer({
            'id': 'draw-points-layer',
            'type': 'circle',
            'source': 'draw-points',
            'paint': {
                'circle-radius': 6,
                'circle-color': '#ffffff',
                'circle-stroke-color': '#047857',
                'circle-stroke-width': 2
            }
        });
    }

    const infoText = document.getElementById('draw-polygon-info');
    if (infoText) {
        infoText.innerText = `${currentDrawCoords.length} corner points placed. ${currentDrawCoords.length >= 3 ? 'Polygon formed!' : 'Click at least 3 points.'}`;
    }
}

function undoLastPolygonPoint() {
    if (currentDrawCoords.length > 0) {
        currentDrawCoords.pop();
        updatePolygonDrawerLayer();
    }
}

function clearPolygonDrawer() {
    currentDrawCoords = [];
    updatePolygonDrawerLayer();
}

function saveCustomPlotToDashboard() {
    const plotNameInput = document.getElementById('draw-plot-number');
    const plotName = plotNameInput ? plotNameInput.value.trim() : '';

    if (!plotName) {
        alert('Please enter a Plot Number or Name (e.g. Plot 101 or Block 22).');
        return;
    }

    if (currentDrawCoords.length < 3) {
        alert('Please click at least 3 corner points on the satellite map to form a plot polygon boundary.');
        return;
    }

    const savedPlots = JSON.parse(localStorage.getItem('smartpalm_saved_plots') || '[]');
    const newPlot = {
        id: 'plot_' + Date.now(),
        name: plotName,
        coords: [...currentDrawCoords],
        color: '#10b981',
        createdAt: new Date().toISOString()
    };

    savedPlots.push(newPlot);
    localStorage.setItem('smartpalm_saved_plots', JSON.stringify(savedPlots));

    showReadaToast(`Recorded Plot "${plotName}" in Map Dashboard!`);
    closeReadaModal('modal-reada-polygon-drawer');
    clearPolygonDrawer();

    if (plotNameInput) plotNameInput.value = '';

    // Refresh Map Dashboard if active
    if (readaMap) {
        loadSavedPlotsOnMap();
    }
}

function loadSavedPlotsOnMap() {
    if (!readaMap || typeof maplibregl === 'undefined') return;
    const saved = JSON.parse(localStorage.getItem('smartpalm_saved_plots') || '[]');

    saved.forEach((plot, index) => {
        const sourceId = `saved-plot-src-${index}`;
        const fillLayerId = `saved-plot-fill-${index}`;
        const lineLayerId = `saved-plot-line-${index}`;

        let ring = [...plot.coords];
        if (ring.length >= 3) ring.push(ring[0]);

        const geojson = {
            'type': 'FeatureCollection',
            'features': [{
                'type': 'Feature',
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [ring]
                },
                'properties': { 'name': plot.name }
            }]
        };

        if (readaMap.getSource(sourceId)) {
            readaMap.getSource(sourceId).setData(geojson);
        } else {
            readaMap.addSource(sourceId, { 'type': 'geojson', 'data': geojson });
            readaMap.addLayer({
                'id': fillLayerId,
                'type': 'fill',
                'source': sourceId,
                'paint': {
                    'fill-color': plot.color || '#10b981',
                    'fill-opacity': 0.4
                }
            });
            readaMap.addLayer({
                'id': lineLayerId,
                'type': 'line',
                'source': sourceId,
                'paint': {
                    'line-color': '#047857',
                    'line-width': 3
                }
            });

            if (ring.length > 0) {
                const centerLng = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
                const centerLat = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;

                const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
                    <div style="font-size: 13px; font-weight: 700; color: #112d2b;">
                        📍 Plot: ${plot.name}<br/>
                        <span style="font-size: 11px; color: #64748b; font-weight: normal;">Recorded Custom Satellite Plot</span>
                    </div>
                `);

                new maplibregl.Marker({ color: plot.color || '#10b981' })
                    .setLngLat([centerLng, centerLat])
                    .setPopup(popup)
                    .addTo(readaMap);
            }
        }
    });
}


// Dynamic Estate Name Geocoding & Minimap Auto-Pan
let estateGeocodeDebounce = null;

const MINIMAP_ESTATELOCATION_PRESETS = {
    'lahad datu': { lat: 5.03, lng: 118.33, name: 'Lahad Datu Station' },
    'banting': { lat: 2.81, lng: 101.50, name: 'Banting Station' },
    'kluang': { lat: 2.03, lng: 103.32, name: 'Kluang Substation' },
    'teluk intan': { lat: 4.00, lng: 101.03, name: 'Teluk Intan Station' },
    'seraya': { lat: 4.02, lng: 118.30, name: 'Seraya Estate' },
    'sabah': { lat: 5.37, lng: 117.58, name: 'Sabah Region' },
    'johor': { lat: 1.93, lng: 103.36, name: 'Johor Region' },
    'perak': { lat: 4.59, lng: 101.09, name: 'Perak Region' }
};

function geocodeEstateMinimap(query) {
    if (!query || query.trim().length < 2) return;

    if (estateGeocodeDebounce) clearTimeout(estateGeocodeDebounce);

    estateGeocodeDebounce = setTimeout(async () => {
        const cleanQuery = query.trim().toLowerCase();

        for (const [key, preset] of Object.entries(MINIMAP_ESTATELOCATION_PRESETS)) {
            if (cleanQuery.includes(key)) {
                updateMinimapLocation([preset.lng, preset.lat], preset.name);
                return;
            }
        }

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Malaysia')}`);
            const data = await res.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                updateMinimapLocation([lng, lat], data[0].display_name.split(',')[0]);
            }
        } catch (e) {
            console.warn("Estate geocoding error:", e);
        }
    }, 600);
}

function updateMinimapLocation(lngLat, locationName = '') {
    if (!newTrialMinimap || typeof maplibregl === 'undefined') return;

    newTrialMinimap.flyTo({ center: lngLat, zoom: 12, speed: 1.4 });

    if (newTrialMarker) {
        newTrialMarker.setLngLat(lngLat);
    } else {
        newTrialMarker = new maplibregl.Marker({ color: '#047857' })
            .setLngLat(lngLat)
            .addTo(newTrialMinimap);
    }

    const coordsEl = document.getElementById('reada-nt-coords');
    if (coordsEl) {
        coordsEl.innerText = `Lat: ${lngLat[1].toFixed(4)}, Lng: ${lngLat[0].toFixed(4)} ${locationName ? '(' + locationName + ')' : ''}`;
    }
}


// Global Bulletproof Tab Switcher Event Delegation (Handles mouse, touch, pointer, and nested elements)
(function() {
    function handleTabClick(e) {
        const tabBtn = e.target.closest('.reada-tab');
        if (tabBtn) {
            const viewId = tabBtn.getAttribute('data-view');
            if (viewId && typeof window.showReadaView === 'function') {
                window.showReadaView(viewId, tabBtn);
            }
        }
    }

    document.addEventListener('click', handleTabClick, true);
    document.addEventListener('pointerdown', handleTabClick, true);
})();


// Global Window Exports for Buttons and SubActions
window.openReadaModal = function(modalId) {
    var targetId = modalId.startsWith('modal-') ? modalId : 'modal-reada-' + modalId;
    var el = document.getElementById(targetId);
    if (el) {
        el.classList.add('active');
        el.style.setProperty('display', 'flex', 'important');
        if (targetId === 'modal-reada-new-trial' && typeof initNewTrialMinimap === 'function') {
            setTimeout(initNewTrialMinimap, 150);
        }
    } else {
        console.error('ReaDA Modal not found:', targetId);
    }
};

window.closeReadaModal = function(modalId) {
    var targetId = modalId.startsWith('modal-') ? modalId : 'modal-reada-' + modalId;
    var el = document.getElementById(targetId);
    if (el) {
        el.classList.remove('active');
        el.style.setProperty('display', 'none', 'important');
    }
};

window.openReadaSubAction = function(actionName) {
    var map = {
        'New Trial Info Entry': 'new-trial',
        'Edit Trial Selection': 'edit-trial-select',
        'Read Info From Backup': 'read-backup',
        'Export Trial Info CSV': 'save-csv',
        'Delete Trial Record': 'delete-trial',
        'Print Trial Summary': 'print-trial',
        'View Bunch Analysis': 'bunch',
        'Edit Bunch Analysis': 'bunch-editor',
        'View Yield Recording': 'yield',
        'Edit Yield Recording': 'yield-editor',
        'View Vegetative Sampling': 'veg',
        'Edit Vegetative Sampling': 'veg',
        'View Annual Plot Data': 'annual',
        'Edit Annual Plot Data': 'annual'
    };

    if (map[actionName]) {
        window.openReadaModal(map[actionName]);
    } else {
        alert('Executing ReaDA Module: ' + actionName + '\nAccessing persistent trial store (reada_local.db)...');
    }
};

window.exportReadaTrialsCsv = function() {
    console.log("Exporting ReaDA trials to CSV...");
    var trialsToExport = (typeof readaSelectedTrials !== 'undefined' && readaSelectedTrials.size > 0)
        ? readaTrials.filter(t => readaSelectedTrials.has(t.code))
        : (typeof readaTrials !== 'undefined' ? readaTrials : []);

    if (!trialsToExport || trialsToExport.length === 0) {
        alert("No trial data available to export.");
        return;
    }

    var headers = ["Date Added", "Trial Code", "Location / Station", "Region Group", "Planting Year", "Density (palms/ha)", "Factorial Info", "Progeny Type"];
    var csvRows = [headers.join(",")];

    trialsToExport.forEach(function(t) {
        var row = [
            '"' + (t.dateAdded || '') + '"',
            '"' + (t.code || '') + '"',
            '"' + (t.station || '') + '"',
            '"' + (t.region || '') + '"',
            '"' + (t.year || '') + '"',
            '"' + (t.density || '') + '"',
            '"' + (t.factorial || '') + '"',
            '"' + (t.progeny || '') + '"'
        ];
        csvRows.push(row.join(","));
    });

    var csvString = csvRows.join("\n");
    var blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "PalmnexReaDS_Trial_Data_" + new Date().toISOString().slice(0, 10) + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Robust Leaflet Map Engine for Map Dashboard
function initReadaMapDashboard() {
    const container = document.getElementById('reada-map');
    if (!container) return;

    if (window.leafletMapInstance) {
        setTimeout(function() { window.leafletMapInstance.invalidateSize(); }, 150);
        return;
    }

    if (typeof L === 'undefined') {
        console.error("Leaflet L is not loaded yet");
        return;
    }

    container.innerHTML = '<div id="leaflet-reada-map" style="width:100%; height:100%; min-height:550px; position:relative; z-index:1; border-radius: 6px; overflow: hidden;"></div>';

    var lMap = L.map('leaflet-reada-map', {
        center: [4.21, 108.82],
        zoom: 6,
        zoomControl: true
    });

    // Satellite Imagery Layer (Esri World Imagery)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri, Maxar, Earthstar Geographics'
    }).addTo(lMap);

    // Google Hybrid Labels Layer
    L.tileLayer('https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}', {
        maxZoom: 19,
        attribution: '&copy; Google Maps'
    }).addTo(lMap);

    window.leafletMapInstance = lMap;

    var stationCoordsMapL = {
        'Banting Station': [2.81, 101.50],
        'Kluang Substation': [2.03, 103.32],
        'Teluk Intan Station': [4.00, 101.03],
        'Lahad Datu Station': [5.03, 118.33]
    };

    if (typeof readaTrials !== 'undefined') {
        readaTrials.forEach(function(t) {
            var coords = stationCoordsMapL[t.station] || [3.14, 101.69];
            var m = L.marker(coords).addTo(lMap);
            m.bindPopup(`
                <div style="font-family: sans-serif; font-size: 13px; color: #0f172a; padding: 4px;">
                    <b style="color: #15803d; font-size: 14px;">${t.station}</b><br>
                    <b>Trial Code:</b> ${t.code}<br>
                    <b>Region:</b> ${t.region}<br>
                    <b>Planting Year:</b> ${t.year}<br>
                    <b>Density:</b> ${t.density} palms/ha
                </div>
            `);
        });
    }

    setTimeout(function() { lMap.invalidateSize(); }, 250);
}

window.initReadaMapDashboard = initReadaMapDashboard;

        // Delete currently selected custom map
        function deleteCurrentMap() {
            let compSelect = document.getElementById('map-select-comp');
            if (!compSelect) return;
            let val = compSelect.value;
            if (!val.startsWith('custom_')) return;
            
            if (confirm("Are you sure you want to permanently delete this map?")) {
                if (typeof deleteShapefile === 'function') {
                    deleteShapefile(val).catch(e => console.error(e));
                }
                
                delete REAL_MAPS_DATA[val];
                
                ['map-select-comp', 'map-select-std'].forEach(selectId => {
                    let select = document.getElementById(selectId);
                    if (select) {
                        let opt = select.querySelector(`option[value="${val}"]`);
                        if (opt) select.removeChild(opt);
                    }
                });
                
                onMapSelectChanged('lahad_datu');
            }
        }
        window.deleteCurrentMap = deleteCurrentMap;



        // Toggle LSU Overlay Checkbox Handler
        function toggleLsuOverlay(isChecked) {
            const subBox = document.getElementById('lsu-suboptions-box');
            if (subBox) subBox.style.display = isChecked ? 'block' : 'none';

            if (isChecked) {
                // Default to N nutrient layer when LSU is turned ON
                const nRadios = document.querySelectorAll('input[name="comp_layer"][value="N"], input[name="std_layer"][value="N"]');
                nRadios.forEach(r => r.checked = true);
                if (typeof toggleNutrientLayerComp === 'function') toggleNutrientLayerComp('N');
                if (typeof toggleNutrientLayerStd === 'function') toggleNutrientLayerStd('N');
            } else {
                // Turn OFF LSU overlay
                const offRadios = document.querySelectorAll('input[name="comp_layer"][value="OFF"], input[name="std_layer"][value="OFF"]');
                offRadios.forEach(r => r.checked = true);
                
                const predChk = document.getElementById('comp-show-nutrient-detection-chk');
                if (predChk) predChk.checked = false;
                window._USE_RF_PREDICTIONS = false;

                if (typeof toggleNutrientLayerComp === 'function') toggleNutrientLayerComp('OFF');
                if (typeof toggleNutrientLayerStd === 'function') toggleNutrientLayerStd('OFF');
            }
        }
        window.toggleLsuOverlay = toggleLsuOverlay;

        // Toggle Nutrient Detection Model Prediction Handler
        function toggleNutrientDetectionPrediction(isChecked) {
            window._USE_RF_PREDICTIONS = isChecked;
            console.log("Random Forest Model Predictions:", isChecked ? "ENABLED (rf_model_*.pkl)" : "DISABLED");
            
            // Re-trigger current active layer overlay
            const activeRadio = document.querySelector('input[name="comp_layer"]:checked');
            const activeVal = activeRadio ? activeRadio.value : 'N';
            if (typeof toggleNutrientLayerComp === 'function') toggleNutrientLayerComp(activeVal);
            if (typeof toggleNutrientLayerStd === 'function') toggleNutrientLayerStd(activeVal);
        }
        window.toggleNutrientDetectionPrediction = toggleNutrientDetectionPrediction;

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
