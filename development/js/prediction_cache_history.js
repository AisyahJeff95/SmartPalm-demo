/**
 * SmartPalm — Per-Estate Prediction Raster Cache & Prediction Run History (IndexedDB + Supabase + Server API)
 *
 * Provides:
 * 1. window.PREDICTION_CACHE_BY_ESTATE: Remembers predicted rasters, folder_name, and download URL per estate
 *    so switching between estates (e.g. Jengka 24 -> Jengka 25 -> Jengka 24) immediately restores the predicted
 *    rasters and download link without re-running prediction.
 * 2. Prediction History UI & Modal: Lists all previous prediction runs (from local IndexedDB cache, Supabase
 *    `prediction_runs` table, and backend `/api/prediction_history`) so any earlier run can be re-opened on the map
 *    or downloaded as a .zip (.tif / .csv) anytime.
 */
(function () {
    'use strict';

    window.PREDICTION_CACHE_BY_ESTATE = window.PREDICTION_CACHE_BY_ESTATE || {};
    window.PREDICTION_RUN_HISTORY = window.PREDICTION_RUN_HISTORY || [];

    const IDB_NAME = 'PalmNexPredictionCacheDB';
    const IDB_VERSION = 1;
    const STORE_ESTATE = 'estate_predictions';
    const STORE_HISTORY = 'prediction_history';
    const LS_HISTORY_KEY = 'smartpalm_prediction_history_v1';
    const DEFAULT_HF_BASE = 'https://aisyjeff95-smartpalm-demo.hf.space';

    let _idbPromise = null;

    function normalizeKey(str) {
        return String(str || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    function openPredictionIDB() {
        if (_idbPromise) return _idbPromise;
        _idbPromise = new Promise((resolve) => {
            if (typeof indexedDB === 'undefined') {
                resolve(null);
                return;
            }
            try {
                const req = indexedDB.open(IDB_NAME, IDB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_ESTATE)) {
                        db.createObjectStore(STORE_ESTATE, { keyPath: 'shpKey' });
                    }
                    if (!db.objectStoreNames.contains(STORE_HISTORY)) {
                        db.createObjectStore(STORE_HISTORY, { keyPath: 'folderName' });
                    }
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = () => resolve(null);
            } catch (err) {
                resolve(null);
            }
        });
        return _idbPromise;
    }

    async function idbPut(storeName, record) {
        const db = await openPredictionIDB();
        if (!db) return;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction([storeName], 'readwrite');
                tx.objectStore(storeName).put(record);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    }

    async function idbGetAll(storeName) {
        const db = await openPredictionIDB();
        if (!db) return [];
        return new Promise((resolve) => {
            try {
                const tx = db.transaction([storeName], 'readonly');
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            } catch (e) {
                resolve([]);
            }
        });
    }

    function saveLocalHistoryMeta(list) {
        try {
            const slim = (list || []).slice(0, 60).map(item => ({
                folderName: item.folderName || item.folder_name,
                shpKey: item.shpKey || '',
                estateName: item.estateName || item.estate_name || '',
                targetDate: item.targetDate || item.target_date || '',
                isRealtime: Boolean(item.isRealtime ?? item.is_realtime),
                baseUrl: item.baseUrl || DEFAULT_HF_BASE,
                executionTimeSec: item.executionTimeSec || item.execution_time_sec || null,
                timestamp: item.timestamp || new Date().toISOString(),
                mtime: item.mtime || Date.now() / 1000,
                hasOverlays: Boolean(item.overlays || item.hasOverlays || item.has_overlays)
            }));
            localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(slim));
        } catch (e) {}
    }

    function loadLocalHistoryMeta() {
        try {
            const raw = localStorage.getItem(LS_HISTORY_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    async function syncRunToSupabase(record) {
        try {
            const sb = typeof getSupabase === 'function' ? getSupabase() : null;
            if (!sb) return;
            await sb.from('prediction_runs').upsert([{
                folder_name: record.folderName,
                estate_key: record.shpKey || '',
                estate_name: record.estateName || '',
                target_date: record.targetDate || '',
                is_realtime: Boolean(record.isRealtime),
                base_url: record.baseUrl || DEFAULT_HF_BASE,
                execution_time_sec: Number(record.executionTimeSec) || null,
                created_at: new Date().toISOString()
            }], { onConflict: 'folder_name' });
        } catch (e) {
            // Silent fallback if table does not exist or RLS restricts anonymous writes
        }
    }

    async function fetchSupabaseHistory() {
        try {
            const sb = typeof getSupabase === 'function' ? getSupabase() : null;
            if (!sb) return [];
            const { data, error } = await sb
                .from('prediction_runs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            if (error || !Array.isArray(data)) return [];
            return data.map(row => ({
                folderName: row.folder_name,
                shpKey: row.estate_key || '',
                estateName: row.estate_name || row.estate_key || row.folder_name,
                targetDate: row.target_date || '',
                isRealtime: Boolean(row.is_realtime),
                baseUrl: row.base_url || DEFAULT_HF_BASE,
                executionTimeSec: row.execution_time_sec,
                timestamp: row.created_at || '',
                mtime: row.created_at ? (new Date(row.created_at).getTime() / 1000) : 0,
                hasOverlays: false
            }));
        } catch (e) {
            return [];
        }
    }

    async function fetchServerPredictionHistory() {
        const endpoints = [
            '/api/prediction_history',
            'http://127.0.0.1:7860/api/prediction_history',
            'http://127.0.0.1:5001/api/prediction_history',
            `${DEFAULT_HF_BASE}/api/prediction_history`
        ];
        const allServerRuns = [];
        for (const ep of endpoints) {
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 3500);
                const res = await fetch(ep, { signal: ctrl.signal });
                clearTimeout(timer);
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.runs)) {
                        const baseUrl = ep.startsWith('http')
                            ? ep.replace(/\/api\/prediction_history.*$/, '')
                            : window.location.origin;
                        data.runs.forEach(r => {
                            allServerRuns.push({
                                folderName: r.folder_name,
                                shpKey: guessShpKeyFromEstateName(r.estate_name || r.folder_name),
                                estateName: r.estate_name || r.folder_name,
                                targetDate: r.target_date || '',
                                isRealtime: false,
                                baseUrl: baseUrl,
                                executionTimeSec: r.execution_time_sec,
                                timestamp: r.timestamp || '',
                                mtime: r.mtime || 0,
                                hasOverlays: Boolean(r.has_overlays),
                                totalBlocks: r.total_blocks,
                                totalPixels: r.total_pixels
                            });
                        });
                    }
                }
            } catch (e) {}
        }
        return allServerRuns;
    }

    function guessShpKeyFromEstateName(nameStr) {
        const s = normalizeKey(nameStr);
        if (!s) return '';
        const selectEl = document.getElementById('map-select-comp') || document.getElementById('map-select-std') || document.getElementById('map-select-kpsm');
        if (selectEl && selectEl.options) {
            for (let i = 0; i < selectEl.options.length; i++) {
                const opt = selectEl.options[i];
                if (!opt.value) continue;
                const vNorm = normalizeKey(opt.value);
                const tNorm = normalizeKey(opt.text);
                if (s === vNorm || s === tNorm || s.includes(vNorm) || vNorm.includes(s)) {
                    return opt.value;
                }
            }
        }
        return s;
    }

    /**
     * Normalize overlays object from backend into { N: { dataUrl, bounds }, ... } format
     * if backend returned { bounds: [...], N: "data:image/png...", ... }
     */
    function normalizeOverlaysObject(overlays, fallbackBounds) {
        if (!overlays || typeof overlays !== 'object') return null;
        const sharedBounds = overlays.bounds || fallbackBounds || [[4.41323, 117.41170], [4.72680, 117.81996]];
        const result = {};
        if (overlays.bounds) result.bounds = overlays.bounds;
        ['N', 'P', 'K', 'Mg', 'Ca', 'B'].forEach(k => {
            const val = overlays[k];
            if (!val) return;
            if (typeof val === 'string') {
                result[k] = { dataUrl: val, bounds: sharedBounds };
            } else if (typeof val === 'object' && val.dataUrl) {
                result[k] = { dataUrl: val.dataUrl, bounds: val.bounds || sharedBounds };
            }
        });
        return Object.keys(result).length > 0 ? result : overlays;
    }

    /**
     * Save a completed prediction run into:
     * 1. window.PREDICTION_CACHE_BY_ESTATE[shpKey]
     * 2. IndexedDB (estate_predictions + prediction_history)
     * 3. localStorage metadata
     * 4. Supabase (prediction_runs)
     */
    async function savePredictionRunToCacheAndHistory(entry) {
        if (!entry) return;
        const shpKey = entry.shpKey || guessShpKeyFromEstateName(entry.estateName) || 'custom_upload';
        const folderName = entry.folderName || `predictions_${shpKey}_${entry.targetDate || new Date().toISOString().slice(0, 10)}`;
        const normOverlays = normalizeOverlaysObject(entry.overlays, entry.bounds);

        const record = {
            shpKey: shpKey,
            estateName: entry.estateName || shpKey,
            targetDate: entry.targetDate || new Date().toISOString().slice(0, 10),
            isRealtime: Boolean(entry.isRealtime),
            folderName: folderName,
            folderPath: entry.folderPath || '',
            baseUrl: entry.baseUrl || DEFAULT_HF_BASE,
            overlays: normOverlays,
            grids: entry.grids || null,
            bounds: entry.bounds || (normOverlays && normOverlays.bounds) || null,
            executionTimeSec: entry.executionTimeSec || null,
            timestamp: new Date().toISOString(),
            mtime: Date.now() / 1000,
            hasOverlays: Boolean(normOverlays)
        };

        if (record.grids) {
            window.DYNAMIC_PREDICTION_GRIDS = record.grids;
        } else if (normOverlays && typeof window.decodeDynamicPredictionGrids === 'function') {
            window.decodeDynamicPredictionGrids(normOverlays, record.bounds).then(decoded => {
                if (decoded && Object.keys(decoded).length > 0) {
                    record.grids = decoded;
                    window.DYNAMIC_PREDICTION_GRIDS = decoded;
                }
            });
        }

        window.PREDICTION_CACHE_BY_ESTATE[shpKey] = record;
        window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(shpKey)] = record;
        if (record.estateName) {
            window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(record.estateName)] = record;
        }

        // Update history list in memory
        window.PREDICTION_RUN_HISTORY = [
            record,
            ...window.PREDICTION_RUN_HISTORY.filter(r => (r.folderName || r.folder_name) !== folderName)
        ];

        saveLocalHistoryMeta(window.PREDICTION_RUN_HISTORY);
        await idbPut(STORE_ESTATE, record);
        await idbPut(STORE_HISTORY, record);
        syncRunToSupabase(record);
        updateHistoryUIBadge(shpKey);
    }

    /**
     * Check if an estate has a cached prediction in window.PREDICTION_CACHE_BY_ESTATE.
     * If found, restore its overlays and download folder immediately without re-running prediction.
     */
    function restoreEstatePredictionFromCache(shpKey) {
        if (!shpKey) {
            window.DYNAMIC_PREDICTION_RASTERS = null;
            window.DYNAMIC_PREDICTION_GRIDS = null;
            window._LAST_PREDICTION_FOLDER = '';
            updateHistoryUIBadge('');
            return false;
        }

        const cached = window.PREDICTION_CACHE_BY_ESTATE[shpKey]
            || window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(shpKey)];

        if (cached && (cached.overlays || cached.folderName)) {
            window.DYNAMIC_PREDICTION_RASTERS = cached.overlays || null;
            window.DYNAMIC_PREDICTION_GRIDS = cached.grids || null;
            if (!window.DYNAMIC_PREDICTION_GRIDS && cached.overlays && typeof window.decodeDynamicPredictionGrids === 'function') {
                window.decodeDynamicPredictionGrids(cached.overlays, cached.bounds).then(decoded => {
                    if (decoded && Object.keys(decoded).length > 0) {
                        cached.grids = decoded;
                        window.DYNAMIC_PREDICTION_GRIDS = decoded;
                    }
                });
            }
            window._LAST_PREDICTION_FOLDER = cached.folderName || '';
            window._LAST_PREDICTION_BASE_URL = cached.baseUrl || DEFAULT_HF_BASE;
            window._USE_RF_PREDICTIONS = true;

            if (typeof setNutrientLayerSelectionEnabled === 'function') {
                setNutrientLayerSelectionEnabled(
                    true,
                    `✓ Restored cached 10m Sentinel Rasters for ${cached.estateName} (${cached.targetDate})`,
                    true
                );
            }

            const activeRadio = document.querySelector('input[name="comp_layer"]:checked')
                || document.querySelector('input[name="std_layer"]:checked')
                || document.querySelector('input[name="kpsm_layer"]:checked');
            const layerVal = (activeRadio && activeRadio.value && activeRadio.value !== 'OFF') ? activeRadio.value : 'N';
            const radioToSelect = document.querySelector(`input[name="comp_layer"][value="${layerVal}"]`)
                || document.querySelector(`input[name="std_layer"][value="${layerVal}"]`);
            if (radioToSelect) radioToSelect.checked = true;

            setTimeout(() => {
                if (typeof toggleNutrientLayerComp === 'function') toggleNutrientLayerComp(layerVal);
                if (typeof toggleNutrientLayerStd === 'function') toggleNutrientLayerStd(layerVal);
                if (typeof toggleNutrientLayerKpsm === 'function') toggleNutrientLayerKpsm(layerVal);
            }, 180);

            updateHistoryUIBadge(shpKey);
            return true;
        } else {
            window.DYNAMIC_PREDICTION_RASTERS = null;
            window.DYNAMIC_PREDICTION_GRIDS = null;
            window._LAST_PREDICTION_FOLDER = '';
            updateHistoryUIBadge(shpKey);
            return false;
        }
    }

    function downloadPredictionZipByFolder(folderName, baseUrl) {
        const folder = folderName || window._LAST_PREDICTION_FOLDER || '';
        const base = (baseUrl || window._LAST_PREDICTION_BASE_URL || DEFAULT_HF_BASE).replace(/\/+$/, '');
        let zipUrl = `${base}/api/download_zip`;
        if (folder) {
            zipUrl += `?folder_name=${encodeURIComponent(folder)}`;
        }
        const link = document.createElement('a');
        link.href = zipUrl;
        link.target = '_blank';
        link.download = `${folder || 'predictions_output'}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function loadHistoricalRunOnMap(folderName, shpKeyHint, estateNameHint, targetDateHint, baseUrlHint) {
        // 1. Check in-memory / IDB history first
        let run = window.PREDICTION_RUN_HISTORY.find(r => (r.folderName || r.folder_name) === folderName);

        // 2. If no overlays in memory, try fetching overlays.json from backend
        if (!run || !run.overlays) {
            const bases = [
                baseUrlHint,
                '',
                'http://127.0.0.1:7860',
                'http://127.0.0.1:5001',
                DEFAULT_HF_BASE
            ].filter((v, i, a) => v !== undefined && a.indexOf(v) === i);

            for (const b of bases) {
                try {
                    const url = `${b}/api/prediction_overlays?folder_name=${encodeURIComponent(folderName)}`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.overlays) {
                            const normOv = normalizeOverlaysObject(data.overlays);
                            run = Object.assign({}, run || {}, {
                                folderName: folderName,
                                shpKey: shpKeyHint || guessShpKeyFromEstateName(estateNameHint || folderName),
                                estateName: estateNameHint || folderName,
                                targetDate: targetDateHint || '',
                                baseUrl: b || window.location.origin,
                                overlays: normOv,
                                grids: data.grids || null,
                                hasOverlays: true
                            });
                            await savePredictionRunToCacheAndHistory(run);
                            break;
                        }
                    }
                } catch (e) {}
            }
        }

        const resolvedShpKey = (run && run.shpKey) || shpKeyHint || guessShpKeyFromEstateName(estateNameHint || folderName);

        // Store folder and baseUrl for immediate download even if historical folder only has .tif files on disk
        window._LAST_PREDICTION_FOLDER = folderName;
        window._LAST_PREDICTION_BASE_URL = (run && run.baseUrl) || baseUrlHint || DEFAULT_HF_BASE;

        if (resolvedShpKey) {
            if (run && run.overlays) {
                window.PREDICTION_CACHE_BY_ESTATE[resolvedShpKey] = run;
                window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(resolvedShpKey)] = run;
            }
            const selectEl = document.getElementById('map-select-comp') || document.getElementById('map-select-std') || document.getElementById('map-select-kpsm');
            if (selectEl && selectEl.value !== resolvedShpKey) {
                selectEl.value = resolvedShpKey;
                if (typeof onMapSelectChanged === 'function') {
                    onMapSelectChanged(resolvedShpKey);
                }
            }
            restoreEstatePredictionFromCache(resolvedShpKey);
        }

        const modal = document.getElementById('smartpalm-history-modal');
        if (modal) modal.remove();
    }

    async function refreshMergedHistory() {
        const [idbEstates, idbHistory, sbHistory, srvHistory] = await Promise.all([
            idbGetAll(STORE_ESTATE),
            idbGetAll(STORE_HISTORY),
            fetchSupabaseHistory(),
            fetchServerPredictionHistory()
        ]);

        idbEstates.forEach(rec => {
            if (rec && rec.shpKey) {
                window.PREDICTION_CACHE_BY_ESTATE[rec.shpKey] = rec;
                window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(rec.shpKey)] = rec;
                if (rec.estateName) {
                    window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(rec.estateName)] = rec;
                }
            }
        });

        const byFolder = new Map();
        const mergeItem = (item) => {
            if (!item) return;
            const fn = item.folderName || item.folder_name;
            if (!fn) return;
            const existing = byFolder.get(fn) || {};
            byFolder.set(fn, Object.assign({}, item, existing, {
                overlays: existing.overlays || item.overlays || null,
                hasOverlays: Boolean(existing.overlays || item.overlays || existing.hasOverlays || item.hasOverlays)
            }));
        };

        idbHistory.forEach(mergeItem);
        idbEstates.forEach(mergeItem);
        loadLocalHistoryMeta().forEach(mergeItem);
        sbHistory.forEach(mergeItem);
        srvHistory.forEach(mergeItem);

        const merged = Array.from(byFolder.values()).sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        window.PREDICTION_RUN_HISTORY = merged;

        // Also populate PREDICTION_CACHE_BY_ESTATE for estates that have overlays in history
        merged.forEach(r => {
            const k = r.shpKey || guessShpKeyFromEstateName(r.estateName || r.folderName);
            if (k && !window.PREDICTION_CACHE_BY_ESTATE[k] && r.overlays) {
                window.PREDICTION_CACHE_BY_ESTATE[k] = r;
                window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(k)] = r;
            }
        });

        const selectEl = document.getElementById('map-select-comp') || document.getElementById('map-select-std') || document.getElementById('map-select-kpsm');
        updateHistoryUIBadge(selectEl ? selectEl.value : '');
        return merged;
    }

    function populateSidebarHistoryDropdown(activeShpKey) {
        const dropdown = document.getElementById('pred-history-dropdown');
        if (!dropdown) return;

        const runs = Array.isArray(window.PREDICTION_RUN_HISTORY) ? window.PREDICTION_RUN_HISTORY : [];
        if (runs.length === 0) {
            dropdown.innerHTML = `<option value="">-- No previous runs yet --</option>`;
            return;
        }

        const currentFolder = window._LAST_PREDICTION_FOLDER || (() => {
            if (!activeShpKey) return '';
            const c = window.PREDICTION_CACHE_BY_ESTATE[activeShpKey] || window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(activeShpKey)];
            return c ? (c.folderName || '') : '';
        })();

        // Group runs by Estate Name so users can easily pick by Estate + Date
        const groups = new Map();
        runs.forEach(r => {
            const fn = r.folderName || r.folder_name || '';
            if (!fn) return;
            const est = r.estateName || r.estate_name || fn;
            if (!groups.has(est)) groups.set(est, []);
            groups.get(est).push(r);
        });

        let html = `<option value="">🕒 Select Previous Run (Estate &amp; Date)...</option>`;
        groups.forEach((groupRuns, estateLabel) => {
            const safeEstLabel = String(estateLabel).replace(/"/g, '&quot;');
            html += `<optgroup label="📍 ${safeEstLabel}">`;
            groupRuns.forEach(r => {
                const fn = r.folderName || r.folder_name || '';
                const dateStr = r.targetDate || r.target_date || 'Unknown Date';
                const shpKey = r.shpKey || guessShpKeyFromEstateName(estateLabel);
                const baseUrl = r.baseUrl || DEFAULT_HF_BASE;
                const statusTag = (r.overlays || r.hasOverlays) ? '✓ Cached' : '📦 ZIP';
                const isSelected = (currentFolder && fn === currentFolder) ? 'selected' : '';
                const safeFn = String(fn).replace(/"/g, '&quot;');
                const safeKey = String(shpKey || '').replace(/"/g, '&quot;');
                const safeDate = String(dateStr).replace(/"/g, '&quot;');
                const safeBase = String(baseUrl).replace(/"/g, '&quot;');
                html += `<option value="${safeFn}" data-shp-key="${safeKey}" data-estate="${safeEstLabel}" data-date="${safeDate}" data-base="${safeBase}" ${isSelected}>📅 ${safeDate} — ${safeEstLabel} (${statusTag})</option>`;
            });
            html += `</optgroup>`;
        });

        dropdown.innerHTML = html;
    }

    function onSidebarHistoryDropdownChange(selectEl) {
        if (!selectEl || !selectEl.value) return;
        const opt = selectEl.options[selectEl.selectedIndex];
        if (!opt) return;
        const fn = selectEl.value;
        const shpKey = opt.getAttribute('data-shp-key') || '';
        const est = opt.getAttribute('data-estate') || '';
        const dt = opt.getAttribute('data-date') || '';
        const base = opt.getAttribute('data-base') || '';
        loadHistoricalRunOnMap(fn, shpKey, est, dt, base);
    }

    function downloadSelectedSidebarRunZip() {
        const dropdown = document.getElementById('pred-history-dropdown');
        if (dropdown && dropdown.value) {
            const opt = dropdown.options[dropdown.selectedIndex];
            const base = opt ? (opt.getAttribute('data-base') || '') : '';
            downloadPredictionZipByFolder(dropdown.value, base);
            return;
        }
        downloadPredictionZipByFolder(window._LAST_PREDICTION_FOLDER || '', window._LAST_PREDICTION_BASE_URL || '');
    }

    function updateHistoryUIBadge(activeShpKey) {
        const countEl = document.getElementById('pred-history-count-badge');
        if (countEl) {
            countEl.textContent = String(window.PREDICTION_RUN_HISTORY.length || 0);
        }

        const key = activeShpKey || (() => {
            const s = document.getElementById('map-select-comp') || document.getElementById('map-select-std') || document.getElementById('map-select-kpsm');
            return s ? s.value : '';
        })();

        populateSidebarHistoryDropdown(key);

        const statusEl = document.getElementById('estate-cache-status-pill');
        if (!statusEl) return;

        const cached = key ? (window.PREDICTION_CACHE_BY_ESTATE[key] || window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(key)]) : null;
        if (cached && cached.folderName) {
            statusEl.style.display = 'flex';
            statusEl.innerHTML = `
                <span style="color:#059669; font-weight:700;">● Cached Run Ready:</span>
                <span style="color:#1e293b; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${cached.folderName}">${cached.estateName || ''} (${cached.targetDate || cached.folderName})</span>
                <button type="button" onclick="window.downloadPredictionZipByFolder('${cached.folderName}', '${cached.baseUrl || ''}')" style="margin-left:auto; padding:2px 8px; font-size:10.5px; font-weight:700; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; cursor:pointer;">📥 .ZIP</button>
            `;
        } else {
            statusEl.style.display = 'none';
            statusEl.innerHTML = '';
        }
    }

    function renderHistoryModalList(runs, estateFilter, dateFilter) {
        const bodyEl = document.getElementById('pred-history-list-body');
        if (!bodyEl) return;

        const filtered = (runs || []).filter(r => {
            const fn = r.folderName || r.folder_name || '';
            const estateLabel = r.estateName || r.estate_name || fn;
            const dateStr = r.targetDate || r.target_date || '';
            if (estateFilter && estateLabel !== estateFilter) return false;
            if (dateFilter && dateStr !== dateFilter) return false;
            return true;
        });

        if (filtered.length === 0) {
            bodyEl.innerHTML = `
                <div style="text-align:center; padding:36px 20px; color:#94a3b8; font-size:13.5px;">
                    No prediction runs match the selected Estate / Date filter.
                </div>
            `;
            return;
        }

        bodyEl.innerHTML = filtered.map(r => {
            const fn = r.folderName || r.folder_name || '';
            const estateLabel = r.estateName || r.estate_name || fn;
            const dateStr = r.targetDate || r.target_date || '--';
            const shpKey = r.shpKey || guessShpKeyFromEstateName(estateLabel);
            const baseUrl = r.baseUrl || DEFAULT_HF_BASE;
            const hasOverlayBadge = (r.overlays || r.hasOverlays)
                ? `<span style="padding:2px 8px; border-radius:999px; font-size:10.5px; font-weight:700; background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.4);">✓ Rasters Cached</span>`
                : `<span style="padding:2px 8px; border-radius:999px; font-size:10.5px; font-weight:600; background:rgba(59,130,246,0.16); color:#93c5fd; border:1px solid rgba(59,130,246,0.35);">📦 Server Archive</span>`;

            const safeFn = fn.replace(/'/g, "\\'");
            const safeKey = (shpKey || '').replace(/'/g, "\\'");
            const safeEst = (estateLabel || '').replace(/'/g, "\\'");
            const safeDate = (dateStr || '').replace(/'/g, "\\'");
            const safeBase = (baseUrl || '').replace(/'/g, "\\'");

            return `
                <div style="padding:12px 14px; border-radius:10px; background:rgba(30,41,59,0.65); border:1px solid rgba(148,163,184,0.2); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                    <div style="min-width:220px; flex:1;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span style="font-size:13.5px; font-weight:700; color:#ffffff;">${estateLabel}</span>
                            ${hasOverlayBadge}
                        </div>
                        <div style="font-size:11.5px; color:#94a3b8; margin-top:4px;">
                            📅 Satellite Date: <strong style="color:#e2e8f0;">${dateStr}</strong>
                            · Folder: <code style="color:#38bdf8; font-size:11px;">${fn}</code>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <button type="button" onclick="window.loadHistoricalRunOnMap('${safeFn}', '${safeKey}', '${safeEst}', '${safeDate}', '${safeBase}')" style="padding:7px 12px; background:linear-gradient(135deg, #0284c7, #2563eb); color:#ffffff; border:1px solid #38bdf8; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">
                            🗺️ Load on Map
                        </button>
                        <button type="button" onclick="window.downloadPredictionZipByFolder('${safeFn}', '${safeBase}')" style="padding:7px 12px; background:rgba(16,185,129,0.16); color:#34d399; border:1px solid rgba(16,185,129,0.45); border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">
                            📥 Download .zip
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function openPredictionHistoryModal() {
        let existing = document.getElementById('smartpalm-history-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'smartpalm-history-modal';
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(6, 9, 18, 0.78); backdrop-filter:blur(5px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; font-family:"Inter", -apple-system, BlinkMacSystemFont, sans-serif;';
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.innerHTML = `
            <div style="width:100%; max-width:780px; max-height:85vh; background:#0f172a; border:1px solid rgba(148,163,184,0.28); border-radius:16px; box-shadow:0 25px 60px rgba(0,0,0,0.65); display:flex; flex-direction:column; overflow:hidden; color:#f8fafc;">
                <div style="padding:16px 22px; background:linear-gradient(90deg, #0f172a 0%, #1e1b4b 100%); border-bottom:1px solid rgba(148,163,184,0.2); display:flex; align-items:center; justify-content:space-between;">
                    <div>
                        <div style="font-size:16px; font-weight:700; color:#ffffff; display:flex; align-items:center; gap:8px;">
                            <span>🕒</span> Previous Prediction Runs &amp; Cached Rasters
                        </div>
                        <div style="font-size:12px; color:#94a3b8; margin-top:3px;">
                            Filter by <strong>Estate Name</strong> or <strong>Satellite Date</strong> to load cached rasters or download <code>.tif / .csv</code> archives.
                        </div>
                    </div>
                    <button type="button" onclick="document.getElementById('smartpalm-history-modal').remove()" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#e2e8f0; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px; font-weight:700;">✕</button>
                </div>

                <div style="padding:12px 22px; background:#111827; border-bottom:1px solid rgba(148,163,184,0.16); display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                    <div style="flex:1; min-width:200px;">
                        <label style="display:block; font-size:11px; color:#94a3b8; font-weight:600; margin-bottom:4px;">📍 Filter by Estate Name</label>
                        <select id="pred-modal-filter-estate" style="width:100%; padding:7px 10px; border-radius:8px; background:#1e293b; color:#f8fafc; border:1px solid #334155; font-size:12.5px;">
                            <option value="">All Estates</option>
                        </select>
                    </div>
                    <div style="flex:1; min-width:180px;">
                        <label style="display:block; font-size:11px; color:#94a3b8; font-weight:600; margin-bottom:4px;">📅 Filter by Satellite Date</label>
                        <select id="pred-modal-filter-date" style="width:100%; padding:7px 10px; border-radius:8px; background:#1e293b; color:#f8fafc; border:1px solid #334155; font-size:12.5px;">
                            <option value="">All Dates</option>
                        </select>
                    </div>
                </div>

                <div id="pred-history-list-body" style="padding:16px 22px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:10px;">
                    <div style="text-align:center; padding:30px; color:#94a3b8; font-size:13px;">⏳ Loading prediction history from local cache, Supabase &amp; server...</div>
                </div>

                <div style="padding:12px 22px; background:#090d16; border-top:1px solid rgba(148,163,184,0.16); display:flex; align-items:center; justify-content:space-between; font-size:12px; color:#94a3b8;">
                    <span>💡 Rasters predicted in this browser are cached per estate in IndexedDB (`window.PREDICTION_CACHE_BY_ESTATE`).</span>
                    <button type="button" onclick="document.getElementById('smartpalm-history-modal').remove()" style="padding:7px 16px; background:#1e293b; color:#f8fafc; border:1px solid #475569; border-radius:8px; font-weight:600; cursor:pointer;">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const runs = await refreshMergedHistory();
        const bodyEl = document.getElementById('pred-history-list-body');
        if (!bodyEl) return;

        if (!runs || runs.length === 0) {
            bodyEl.innerHTML = `
                <div style="text-align:center; padding:36px 20px; color:#94a3b8; font-size:13.5px;">
                    No previous prediction runs found yet. Click <strong>Run Prediction</strong> on any estate to generate and cache 10m Sentinel nutrient rasters.
                </div>
            `;
            return;
        }

        const estSelect = document.getElementById('pred-modal-filter-estate');
        const dateSelect = document.getElementById('pred-modal-filter-date');
        const uniqueEstates = Array.from(new Set(runs.map(r => r.estateName || r.estate_name || r.folderName || '').filter(Boolean))).sort();
        const uniqueDates = Array.from(new Set(runs.map(r => r.targetDate || r.target_date || '').filter(Boolean))).sort().reverse();

        if (estSelect) {
            estSelect.innerHTML = `<option value="">All Estates (${uniqueEstates.length})</option>` +
                uniqueEstates.map(e => `<option value="${String(e).replace(/"/g, '&quot;')}">${e}</option>`).join('');
            estSelect.onchange = () => renderHistoryModalList(runs, estSelect.value, dateSelect ? dateSelect.value : '');
        }
        if (dateSelect) {
            dateSelect.innerHTML = `<option value="">All Dates (${uniqueDates.length})</option>` +
                uniqueDates.map(d => `<option value="${String(d).replace(/"/g, '&quot;')}">${d}</option>`).join('');
            dateSelect.onchange = () => renderHistoryModalList(runs, estSelect ? estSelect.value : '', dateSelect.value);
        }

        renderHistoryModalList(runs, '', '');
    }

    function injectPredictionHistoryControls() {
        const runBtn = document.getElementById('btn-run-prediction');
        if (!runBtn || document.getElementById('btn-open-prediction-history')) return;

        const parent = runBtn.parentElement;
        if (!parent) return;

        const statusPill = document.createElement('div');
        statusPill.id = 'estate-cache-status-pill';
        statusPill.style.cssText = 'display:none; align-items:center; gap:6px; margin-top:8px; padding:6px 10px; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; font-size:11.5px;';
        parent.appendChild(statusPill);

        // Sidebar Dropdown Selector by Estate Name & Date
        const dropdownWrap = document.createElement('div');
        dropdownWrap.style.cssText = 'margin-top:8px; display:flex; flex-direction:column; gap:4px;';
        dropdownWrap.innerHTML = `
            <label for="pred-history-dropdown" style="font-size:11px; font-weight:700; color:#475569; display:flex; align-items:center; justify-content:space-between;">
                <span>📂 Load Previous Run (Estate &amp; Date):</span>
                <span id="pred-history-count-badge" style="padding:1px 7px; border-radius:999px; background:#e2e8f0; color:#0f172a; font-size:10.5px; font-weight:700;">0</span>
            </label>
            <div style="display:flex; gap:6px; align-items:center;">
                <select id="pred-history-dropdown" onchange="window.onSidebarHistoryDropdownChange(this)" style="flex:1; min-width:0; padding:7px 9px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; font-size:12px; font-weight:600; cursor:pointer;">
                    <option value="">-- Loading runs history... --</option>
                </select>
                <button type="button" onclick="window.downloadSelectedSidebarRunZip()" title="Download .zip for selected run" style="padding:7px 10px; border-radius:8px; border:1px solid #10b981; background:#ecfdf5; color:#047857; font-size:12px; font-weight:700; cursor:pointer; flex-shrink:0;">
                    📥 .ZIP
                </button>
            </div>
        `;
        parent.appendChild(dropdownWrap);

        const histBtn = document.createElement('button');
        histBtn.type = 'button';
        histBtn.id = 'btn-open-prediction-history';
        histBtn.onclick = openPredictionHistoryModal;
        histBtn.style.cssText = 'width:100%; margin-top:6px; padding:7px 12px; border-radius:10px; border:1px solid #cbd5e1; background:#f8fafc; color:#1e293b; font-weight:600; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.15s ease;';
        histBtn.innerHTML = `
            <span>🕒 Browse &amp; Filter All Runs (Estate / Date)</span>
        `;
        parent.appendChild(histBtn);
    }

    window.savePredictionRunToCacheAndHistory = savePredictionRunToCacheAndHistory;
    window.restoreEstatePredictionFromCache = restoreEstatePredictionFromCache;
    window.openPredictionHistoryModal = openPredictionHistoryModal;
    window.loadHistoricalRunOnMap = loadHistoricalRunOnMap;
    window.downloadPredictionZipByFolder = downloadPredictionZipByFolder;
    window.refreshMergedHistory = refreshMergedHistory;
    window.onSidebarHistoryDropdownChange = onSidebarHistoryDropdownChange;
    window.downloadSelectedSidebarRunZip = downloadSelectedSidebarRunZip;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            injectPredictionHistoryControls();
            refreshMergedHistory();
        });
    } else {
        injectPredictionHistoryControls();
        refreshMergedHistory();
    }
})();
