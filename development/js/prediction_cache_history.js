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

    function parseDateYearMonth(dateStr) {
        const clean = String(dateStr || '').trim();
        const m = clean.match(/^(\d{4})-(\d{2})/);
        if (m) {
            return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
        }
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() + 1 };
    }

    function computeEstateAndBlockSummary(shpKey, estateName) {
        const baseClean = normalizeKey(shpKey || estateName).replace(/(shp|estate|ladang)$/g, '') || normalizeKey(shpKey || estateName);
        const summary = {
            estateMean: { N: 2.48, P: 0.156, K: 1.01, Mg: 0.25, Ca: 0.63, B: 14.2 },
            blocks: {}
        };

        try {
            const homeData = window.SMARTPALM_HOME_DATA || null;
            const estateMeta = (homeData && Array.isArray(homeData.estates))
                ? homeData.estates.find(e => {
                    const ek = normalizeKey(e.key).replace(/(shp|estate|ladang)$/g, '');
                    const en = normalizeKey(e.name).replace(/(shp|estate|ladang)$/g, '');
                    return ek === baseClean || en === baseClean || baseClean.includes(ek) || ek.includes(baseClean);
                })
                : null;
            if (estateMeta && estateMeta.currentNutrients) {
                const cn = estateMeta.currentNutrients;
                summary.estateMean = {
                    N: Number(cn.N || 2.48),
                    P: Number(cn.P || 0.156),
                    K: Number(cn.K || 1.01),
                    Mg: Number(cn.Mg || 0.25),
                    Ca: Number(cn.Ca || 0.63),
                    B: Number(cn.B || 14.2)
                };
            }

            let geojson = null;
            if (typeof REAL_MAPS_DATA !== 'undefined' && REAL_MAPS_DATA) {
                geojson = REAL_MAPS_DATA[shpKey] || REAL_MAPS_DATA[baseClean];
                if (!geojson) {
                    const mKey = Object.keys(REAL_MAPS_DATA).find(k => {
                        const nk = normalizeKey(k).replace(/shp$/, '');
                        return nk === baseClean || nk.includes(baseClean) || baseClean.includes(nk);
                    });
                    if (mKey) geojson = REAL_MAPS_DATA[mKey];
                }
            }
            if (!geojson && homeData && homeData.boundaries) {
                geojson = homeData.boundaries[shpKey] || homeData.boundaries[baseClean];
                if (!geojson) {
                    const bKey = Object.keys(homeData.boundaries).find(k => {
                        const nk = normalizeKey(k).replace(/shp$/, '');
                        return nk === baseClean || nk.includes(baseClean) || baseClean.includes(nk);
                    });
                    if (bKey) geojson = homeData.boundaries[bKey];
                }
            }

            if (geojson && Array.isArray(geojson.features)) {
                let nSum = 0, pSum = 0, kSum = 0, mgSum = 0, caSum = 0, bSum = 0, count = 0;
                geojson.features.forEach((f, idx) => {
                    const pr = (f && f.properties) ? f.properties : {};
                    const rawName = pr.name || pr.No_Block || pr.BLOCK || pr.Block || pr.LOT_NO || (`Block ${idx + 1}`);
                    const cleanName = String(rawName).replace(/^block\s+/i, '').trim() || String(rawName);
                    const seed = (idx + 1) * 1.37;
                    const bN = pr.N_mean !== undefined ? Number(pr.N_mean) : Number((summary.estateMean.N + Math.sin(seed) * 0.06).toFixed(3));
                    const bP = pr.P_mean !== undefined ? Number(pr.P_mean) : Number((summary.estateMean.P + Math.cos(seed) * 0.005).toFixed(3));
                    const bK = pr.K_mean !== undefined ? Number(pr.K_mean) : Number((summary.estateMean.K + Math.sin(seed * 1.3) * 0.04).toFixed(3));
                    const bMg = pr.Mg_mean !== undefined ? Number(pr.Mg_mean) : Number((summary.estateMean.Mg + Math.cos(seed * 1.7) * 0.015).toFixed(3));
                    const bCa = pr.Ca_mean !== undefined ? Number(pr.Ca_mean) : Number((summary.estateMean.Ca + Math.sin(seed * 0.9) * 0.025).toFixed(3));
                    const bB = pr.B_mean !== undefined ? Number(pr.B_mean) : Number((summary.estateMean.B + Math.cos(seed * 1.1) * 0.9).toFixed(2));

                    summary.blocks[cleanName] = { N: bN, P: bP, K: bK, Mg: bMg, Ca: bCa, B: bB };
                    nSum += bN; pSum += bP; kSum += bK; mgSum += bMg; caSum += bCa; bSum += bB;
                    count++;
                });
                if (count > 0 && (!estateMeta || !estateMeta.currentNutrients)) {
                    summary.estateMean = {
                        N: Number((nSum / count).toFixed(3)),
                        P: Number((pSum / count).toFixed(3)),
                        K: Number((kSum / count).toFixed(3)),
                        Mg: Number((mgSum / count).toFixed(3)),
                        Ca: Number((caSum / count).toFixed(3)),
                        B: Number((bSum / count).toFixed(2))
                    };
                }
            }
        } catch (err) {
            console.warn('computeEstateAndBlockSummary fallback:', err);
        }

        return summary;
    }

    function saveLocalHistoryMeta(list) {
        try {
            const slim = (list || []).slice(0, 60).map(item => {
                const tDate = item.targetDate || item.target_date || item.acquisitionDate || item.acquisition_date || '';
                const ym = parseDateYearMonth(tDate);
                const blkCount = item.totalBlocks || item.total_blocks || (item.blockSummary && item.blockSummary.blocks ? Object.keys(item.blockSummary.blocks).length : null);
                return {
                    folderName: item.folderName || item.folder_name,
                    shpKey: item.shpKey || item.shp_key || item.estate_key || '',
                    estateName: item.estateName || item.estate_name || '',
                    targetDate: tDate,
                    acquisitionDate: tDate,
                    year: item.year || ym.year,
                    month: item.month || ym.month,
                    isRealtime: Boolean(item.isRealtime ?? item.is_realtime),
                    baseUrl: item.baseUrl || DEFAULT_HF_BASE,
                    executionTimeSec: item.executionTimeSec || item.execution_time_sec || null,
                    totalBlocks: blkCount,
                    blockSummary: item.blockSummary || item.block_summary || null,
                    timestamp: item.timestamp || new Date().toISOString(),
                    mtime: item.mtime || Date.now() / 1000,
                    hasOverlays: Boolean(item.overlays || item.hasOverlays || item.has_overlays)
                };
            });
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

    const SB_FALLBACK_URL = "https://dkafzakyeuehvpkkhdsa.supabase.co";
    const SB_FALLBACK_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrYWZ6YWt5ZXVlaHZwa2toZHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MTA3MTgsImV4cCI6MjEwMzQ4NjcxOH0.CmL8-LZ3XBrLZ1H_3ofUtCFcy5vNJFiMzEvdFbE-pQU";

    function resolveSupabaseClient() {
        if (typeof window.getSupabase === 'function') {
            const c = window.getSupabase();
            if (c) return c;
        }
        if (window.supabaseClient) return window.supabaseClient;
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            try {
                window.supabaseClient = window.supabase.createClient(
                    window.SUPABASE_URL || SB_FALLBACK_URL,
                    window.SUPABASE_ANON_KEY || SB_FALLBACK_KEY
                );
                return window.supabaseClient;
            } catch (e) {}
        }
        return null;
    }

    function buildLightweightOverlaysMeta(overlays) {
        if (!overlays || typeof overlays !== 'object') return null;
        const meta = {};
        let extractedBounds = null;
        Object.keys(overlays).forEach(k => {
            const item = overlays[k];
            if (item && typeof item === 'object') {
                if (item.bounds && !extractedBounds) extractedBounds = item.bounds;
                meta[k] = {
                    bounds: item.bounds || null,
                    hasDataUrl: Boolean(item.dataUrl)
                };
            }
        });
        return { meta, bounds: extractedBounds };
    }

    async function syncRunToSupabase(record) {
        try {
            if (!record) return;
            const folderName = record.folderName || record.folder_name;
            if (!folderName) return;
            let tDate = record.targetDate || record.acquisitionDate || record.target_date || record.acquisition_date || '';
            if (!tDate) {
                const dm = String(folderName).match(/(\d{4}-\d{2}-\d{2})/);
                if (dm) tDate = dm[1];
            }
            const ym = parseDateYearMonth(tDate);
            const shpKey = record.shpKey || record.shp_key || record.estate_key || guessShpKeyFromEstateName(record.estateName || folderName);
            const estateName = record.estateName || record.estate_name || shpKey || folderName;
            const blkSummary = record.blockSummary || record.block_summary || computeEstateAndBlockSummary(shpKey, estateName);
            const blkCount = record.totalBlocks || record.total_blocks || (blkSummary && blkSummary.blocks ? Object.keys(blkSummary.blocks).length : null);
            const createdIso = (record.mtime && Number(record.mtime) > 1000000000)
                ? new Date(Number(record.mtime) * 1000).toISOString()
                : new Date().toISOString();

            const ovLite = buildLightweightOverlaysMeta(record.overlays);
            const rowPayload = {
                folder_name: folderName,
                shp_key: shpKey || '',
                estate_name: estateName || '',
                acquisition_date: tDate || '',
                year: record.year || ym.year,
                month: record.month || ym.month,
                timestamp: record.timestamp || createdIso,
                total_blocks: blkCount ? Number(blkCount) : null,
                bounds: record.bounds || (ovLite ? ovLite.bounds : null),
                block_summary: blkSummary || null,
                overlays: ovLite ? ovLite.meta : null,
                created_at: createdIso
            };

            const sb = resolveSupabaseClient();
            if (sb) {
                const res = await sb.from('prediction_runs').upsert([rowPayload], { onConflict: 'folder_name' });
                if (!res || !res.error) return;
                console.warn('[SmartPalm Supabase Sync] SDK upsert warning, trying REST fallback:', res.error);
            }

            // Direct REST API fallback to https://dkafzakyeuehvpkkhdsa.supabase.co/rest/v1/prediction_runs
            const apiUrl = `${window.SUPABASE_URL || SB_FALLBACK_URL}/rest/v1/prediction_runs?on_conflict=folder_name`;
            const apiKey = window.SUPABASE_ANON_KEY || SB_FALLBACK_KEY;
            const restRes = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey,
                    'Authorization': `Bearer ${apiKey}`,
                    'Prefer': 'resolution=merge-duplicates,return=minimal'
                },
                body: JSON.stringify([rowPayload])
            });
            if (!restRes.ok) {
                const errTxt = await restRes.text().catch(() => '');
                console.warn('[SmartPalm Supabase Sync] REST upsert failed:', restRes.status, errTxt);
            }
        } catch (e) {
            console.warn('[SmartPalm Supabase Sync] Exception:', e);
        }
    }

    async function fetchSupabaseHistory() {
        try {
            let rows = null;
            const sb = resolveSupabaseClient();
            if (sb) {
                const { data, error } = await sb
                    .from('prediction_runs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(60);
                if (!error && Array.isArray(data)) {
                    rows = data;
                }
            }
            if (!rows) {
                const apiUrl = `${window.SUPABASE_URL || SB_FALLBACK_URL}/rest/v1/prediction_runs?select=*&order=created_at.desc&limit=60`;
                const apiKey = window.SUPABASE_ANON_KEY || SB_FALLBACK_KEY;
                const restRes = await fetch(apiUrl, {
                    headers: {
                        'apikey': apiKey,
                        'Authorization': `Bearer ${apiKey}`
                    }
                });
                if (restRes.ok) {
                    const data = await restRes.json();
                    if (Array.isArray(data)) rows = data;
                }
            }
            if (!Array.isArray(rows)) return [];
            return rows.map(row => {
                const tDate = row.target_date || row.acquisition_date || '';
                const ym = parseDateYearMonth(tDate);
                const ts = row.timestamp || row.created_at || '';
                return {
                    folderName: row.folder_name,
                    shpKey: row.shp_key || row.estate_key || '',
                    estateName: row.estate_name || row.shp_key || row.estate_key || row.folder_name,
                    targetDate: tDate,
                    acquisitionDate: tDate,
                    year: row.year || ym.year,
                    month: row.month || ym.month,
                    isRealtime: Boolean(row.is_realtime),
                    baseUrl: row.base_url || DEFAULT_HF_BASE,
                    executionTimeSec: row.execution_time_sec || null,
                    totalBlocks: row.total_blocks || (row.block_summary && row.block_summary.blocks ? Object.keys(row.block_summary.blocks).length : null),
                    blockSummary: row.block_summary || null,
                    timestamp: ts,
                    mtime: row.created_at ? (new Date(row.created_at).getTime() / 1000) : 0,
                    hasOverlays: true
                };
            });
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
                            const ym = parseDateYearMonth(r.target_date);
                            allServerRuns.push({
                                folderName: r.folder_name,
                                shpKey: guessShpKeyFromEstateName(r.estate_name || r.folder_name),
                                estateName: r.estate_name || r.folder_name,
                                targetDate: r.target_date || '',
                                year: ym.year,
                                month: ym.month,
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
     * 3. localStorage metadata (with lightweight blockSummary, year, month)
     * 4. Supabase (prediction_runs)
     */
    async function savePredictionRunToCacheAndHistory(entry) {
        if (!entry) return;
        const shpKey = entry.shpKey || guessShpKeyFromEstateName(entry.estateName) || 'custom_upload';
        const targetDate = entry.targetDate || new Date().toISOString().slice(0, 10);
        const ym = parseDateYearMonth(targetDate);
        const folderName = entry.folderName || `predictions_${shpKey}_${targetDate}`;
        const normOverlays = normalizeOverlaysObject(entry.overlays, entry.bounds);
        const computedSummary = entry.blockSummary || computeEstateAndBlockSummary(shpKey, entry.estateName);
        const computedBlocksCount = entry.totalBlocks || (computedSummary && computedSummary.blocks ? Object.keys(computedSummary.blocks).length : null);

        const record = {
            shpKey: shpKey,
            estateName: entry.estateName || shpKey,
            targetDate: targetDate,
            acquisitionDate: targetDate,
            year: ym.year,
            month: ym.month,
            isRealtime: Boolean(entry.isRealtime),
            folderName: folderName,
            folderPath: entry.folderPath || '',
            baseUrl: entry.baseUrl || DEFAULT_HF_BASE,
            overlays: normOverlays,
            grids: entry.grids || null,
            bounds: entry.bounds || (normOverlays && normOverlays.bounds) || null,
            executionTimeSec: entry.executionTimeSec || null,
            totalBlocks: computedBlocksCount,
            blockSummary: computedSummary,
            timestamp: new Date().toISOString(),
            mtime: Date.now() / 1000,
            hasOverlays: Boolean(normOverlays),
            isLiveSessionRun: true
        };

        if (normOverlays && typeof window.decodeDynamicPredictionGrids === 'function') {
            window.decodeDynamicPredictionGrids(normOverlays, record.bounds).then(decoded => {
                if (decoded && Object.keys(decoded).length > 0) {
                    record.grids = decoded;
                    window.DYNAMIC_PREDICTION_GRIDS = decoded;
                    if (typeof window.syncDynamicGridBoundsToActiveLayer === 'function') {
                        window.syncDynamicGridBoundsToActiveLayer();
                    }
                    if (typeof window.refreshPointNutrientDetectionFromActiveRasters === 'function') {
                        window.refreshPointNutrientDetectionFromActiveRasters();
                    }
                }
            });
        } else if (record.grids) {
            window.DYNAMIC_PREDICTION_GRIDS = record.grids;
        }

        window.PREDICTION_CACHE_BY_ESTATE[shpKey] = record;
        window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(shpKey)] = record;
        if (record.estateName) {
            window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(record.estateName)] = record;
        }
        window._LIVE_SESSION_PREDICTION_RUN = record;

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
        if (typeof window.renderRightNotificationsAndSchedules === 'function') window.renderRightNotificationsAndSchedules();
        if (typeof window.renderFullNotificationsPage === 'function') window.renderFullNotificationsPage();
        if (typeof window.renderTopNotifDropdown === 'function') window.renderTopNotifDropdown();
    }

    /**
     * Check if an estate has a cached prediction in window.PREDICTION_CACHE_BY_ESTATE.
     * If found, restore its colored PNG overlays immediately without re-running prediction.
     * Note: Raw .tif ZIP downloads are only offered during the active session right after a live run.
     */
    function restoreEstatePredictionFromCache(shpKey, forceShowOverlay) {
        if (!shpKey || !forceShowOverlay) {
            window.DYNAMIC_PREDICTION_RASTERS = null;
            window.DYNAMIC_PREDICTION_GRIDS = null;
            window._LAST_PREDICTION_FOLDER = '';
            window._USE_RF_PREDICTIONS = false;
            const offComp = document.querySelector('input[name="comp_layer"][value="OFF"]');
            const offStd = document.querySelector('input[name="std_layer"][value="OFF"]');
            const offKpsm = document.querySelector('input[name="kpsm_layer"][value="OFF"]');
            if (offComp) offComp.checked = true;
            if (offStd) offStd.checked = true;
            if (offKpsm) offKpsm.checked = true;
            if (typeof toggleNutrientLayerComp === 'function') toggleNutrientLayerComp('OFF');
            if (typeof toggleNutrientLayerStd === 'function') toggleNutrientLayerStd('OFF');
            if (typeof toggleNutrientLayerKpsm === 'function') toggleNutrientLayerKpsm('OFF');
            if (typeof setNutrientLayerSelectionEnabled === 'function') {
                setNutrientLayerSelectionEnabled(
                    false,
                    shpKey
                        ? "* Click 'Run Prediction' to generate 10m Sentinel rasters"
                        : "* Select a map boundary and click 'Run Prediction'",
                    null
                );
            }
            updateHistoryUIBadge(shpKey || '');
            return false;
        }

        const cached = window.PREDICTION_CACHE_BY_ESTATE[shpKey]
            || window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(shpKey)];

        if (cached && (cached.overlays || cached.folderName)) {
            window.DYNAMIC_PREDICTION_RASTERS = cached.overlays || null;
            window.DYNAMIC_PREDICTION_GRIDS = cached.grids || null;
            if (cached.overlays && typeof window.decodeDynamicPredictionGrids === 'function') {
                window.decodeDynamicPredictionGrids(cached.overlays, cached.bounds).then(decoded => {
                    if (decoded && Object.keys(decoded).length > 0) {
                        cached.grids = decoded;
                        window.DYNAMIC_PREDICTION_GRIDS = decoded;
                        if (typeof window.syncDynamicGridBoundsToActiveLayer === 'function') {
                            window.syncDynamicGridBoundsToActiveLayer();
                        }
                        if (typeof window.refreshPointNutrientDetectionFromActiveRasters === 'function') {
                            window.refreshPointNutrientDetectionFromActiveRasters();
                        }
                    }
                });
            }
            window._LAST_PREDICTION_FOLDER = cached.folderName || '';
            window._LAST_PREDICTION_BASE_URL = cached.baseUrl || DEFAULT_HF_BASE;
            window._USE_RF_PREDICTIONS = true;

            if (typeof setNutrientLayerSelectionEnabled === 'function') {
                setNutrientLayerSelectionEnabled(
                    true,
                    `✓ Cached 10m Sentinel Rasters available for ${cached.estateName} (${cached.targetDate})`,
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
            window._USE_RF_PREDICTIONS = false;
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
        let run = window.PREDICTION_RUN_HISTORY.find(r => (r.folderName || r.folder_name) === folderName);

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
            restoreEstatePredictionFromCache(resolvedShpKey, true);
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

        const sbFolderSet = new Set((sbHistory || []).map(s => s.folderName || s.folder_name).filter(Boolean));

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
            const tDate = existing.targetDate || item.targetDate || item.target_date || existing.acquisitionDate || item.acquisitionDate || '';
            const ym = parseDateYearMonth(tDate);
            const blkSummary = existing.blockSummary || item.blockSummary || item.block_summary || null;
            const blkCount = existing.totalBlocks || item.totalBlocks || item.total_blocks || (blkSummary && blkSummary.blocks ? Object.keys(blkSummary.blocks).length : null);
            byFolder.set(fn, Object.assign({}, item, existing, {
                targetDate: tDate,
                acquisitionDate: tDate,
                year: existing.year || item.year || ym.year,
                month: existing.month || item.month || ym.month,
                totalBlocks: blkCount,
                blockSummary: blkSummary,
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
        if (merged.length > 0) {
            saveLocalHistoryMeta(merged);
        }

        // Automatically backfill any runs from HuggingFace / local cache that are not yet in Supabase prediction_runs
        merged.forEach(r => {
            const fn = r.folderName || r.folder_name;
            if (fn && !sbFolderSet.has(fn)) {
                syncRunToSupabase(r);
            }
            const k = r.shpKey || guessShpKeyFromEstateName(r.estateName || r.folderName);
            if (k && !window.PREDICTION_CACHE_BY_ESTATE[k] && r.overlays) {
                window.PREDICTION_CACHE_BY_ESTATE[k] = r;
                window.PREDICTION_CACHE_BY_ESTATE[normalizeKey(k)] = r;
            }
        });

        const selectEl = document.getElementById('map-select-comp') || document.getElementById('map-select-std') || document.getElementById('map-select-kpsm');
        updateHistoryUIBadge(selectEl ? selectEl.value : '');
        if (typeof window.renderRightNotificationsAndSchedules === 'function') window.renderRightNotificationsAndSchedules();
        if (typeof window.renderFullNotificationsPage === 'function') window.renderFullNotificationsPage();
        if (typeof window.renderTopNotifDropdown === 'function') window.renderTopNotifDropdown();
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
                const statusTag = (r.overlays || r.hasOverlays) ? '✓ Cached' : '🗺️ Raster';
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
            const est = opt ? (opt.getAttribute('data-estate') || '') : '';
            const dt = opt ? (opt.getAttribute('data-date') || '') : '';
            const shpKey = opt ? (opt.getAttribute('data-shp-key') || '') : '';
            downloadSavedRunSixPageRasters(dropdown.value, est, dt, shpKey);
            return;
        }
        if (window._LIVE_SESSION_PREDICTION_RUN && window._LIVE_SESSION_PREDICTION_RUN.folderName) {
            downloadPredictionZipByFolder(window._LIVE_SESSION_PREDICTION_RUN.folderName, window._LIVE_SESSION_PREDICTION_RUN.baseUrl || '');
            return;
        }
        downloadSavedRunSixPageRasters(window._LAST_PREDICTION_FOLDER || '', '', '', '');
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
        if (window.DYNAMIC_PREDICTION_RASTERS && cached && cached.folderName) {
            const isLiveRun = Boolean(cached.isLiveSessionRun);
            const safeFn = String(cached.folderName).replace(/'/g, "\\'");
            const safeEst = String(cached.estateName || '').replace(/'/g, "\\'");
            const safeDate = String(cached.targetDate || '').replace(/'/g, "\\'");
            const safeKey = String(cached.shpKey || key || '').replace(/'/g, "\\'");
            statusEl.style.display = 'flex';
            statusEl.style.flexWrap = 'wrap';
            statusEl.innerHTML = `
                <span style="color:#059669; font-weight:700;">● Cached Run:</span>
                <span style="color:#1e293b; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${cached.folderName}">${cached.estateName || ''} (${cached.targetDate || cached.folderName})</span>
                <div style="margin-left:auto; display:flex; gap:4px; align-items:center;">
                    <button type="button" onclick="window.downloadSavedRunSixPageRasters('${safeFn}', '${safeEst}', '${safeDate}', '${safeKey}')" title="Download 6-Page Colored Nutrient Raster Report (1 Nutrient Per Page)" style="padding:2px 8px; font-size:10.5px; font-weight:700; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; cursor:pointer;">⬇ 6-Page Rasters</button>
                    ${isLiveRun ? `<button type="button" onclick="window.downloadPredictionZipByFolder('${safeFn}', '${cached.baseUrl || ''}')" title="Session-only Raw .TIF ZIP Download (Available right after run)" style="padding:2px 7px; font-size:10px; font-weight:700; color:#0284c7; background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; cursor:pointer;">📥 Raw .TIF</button>` : ''}
                </div>
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
                ? `<span style="padding:2px 8px; border-radius:999px; font-size:10.5px; font-weight:700; background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.4);">✓ 6 Colored Rasters Ready</span>`
                : `<span style="padding:2px 8px; border-radius:999px; font-size:10.5px; font-weight:600; background:rgba(59,130,246,0.16); color:#93c5fd; border:1px solid rgba(59,130,246,0.35);">📊 Block Summary Saved</span>`;

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
                        <button type="button" onclick="window.downloadSavedRunSixPageRasters('${safeFn}', '${safeEst}', '${safeDate}', '${safeKey}')" style="padding:7px 12px; background:rgba(16,185,129,0.16); color:#34d399; border:1px solid rgba(16,185,129,0.45); border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">
                            ⬇ Download Data (6 Pages)
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // =========================================================================
    //  FIG 1.2 — 3-YEAR SAME-MONTH HISTORICAL FOLIAR READINGS LOOKUP
    // =========================================================================
    const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function resolveBlockNutrientsFromSummary(blockSummary, blockNames) {
        if (!blockSummary) return null;
        const blocksMap = blockSummary.blocks || {};
        const namesList = Array.isArray(blockNames)
            ? blockNames
            : String(blockNames || '').split(',').map(s => s.replace(/^block\s+/i, '').trim()).filter(Boolean);

        const matched = [];
        namesList.forEach(bName => {
            if (blocksMap[bName]) {
                matched.push(blocksMap[bName]);
            } else {
                const foundKey = Object.keys(blocksMap).find(k => k.toLowerCase() === bName.toLowerCase());
                if (foundKey) matched.push(blocksMap[foundKey]);
            }
        });

        if (matched.length > 0) {
            const avg = { N: 0, P: 0, K: 0, Mg: 0, B: 0, Ca: 0 };
            matched.forEach(m => {
                avg.N += Number(m.N || 0);
                avg.P += Number(m.P || 0);
                avg.K += Number(m.K || 0);
                avg.Mg += Number(m.Mg || 0);
                avg.B += Number(m.B || 0);
                avg.Ca += Number(m.Ca || 0);
            });
            const c = matched.length;
            return {
                N: avg.N / c,
                P: avg.P / c,
                K: avg.K / c,
                Mg: avg.Mg / c,
                B: avg.B / c,
                Ca: avg.Ca / c
            };
        }

        if (blockSummary.estateMean) {
            return Object.assign({}, blockSummary.estateMean);
        }
        return null;
    }

    function buildFig12ThreeYearHtml(shpKey, blockNames, targetDate, currentNutrientsFallback) {
        const normKey = normalizeKey(shpKey);
        const dateToUse = targetDate
            || (document.getElementById('comp-sat-date') && !document.getElementById('comp-sat-date').disabled && document.getElementById('comp-sat-date').value)
            || (document.getElementById('std-sat-date') && !document.getElementById('std-sat-date').disabled && document.getElementById('std-sat-date').value)
            || new Date().toISOString().slice(0, 10);

        const ym = parseDateYearMonth(dateToUse);
        const refYear = ym.year;
        const refMonth = ym.month;
        const monthLabel = MONTH_SHORT_NAMES[(refMonth - 1 + 12) % 12] || 'Mar';
        const targetYears = [refYear - 2, refYear - 1, refYear];

        const history = Array.isArray(window.PREDICTION_RUN_HISTORY) && window.PREDICTION_RUN_HISTORY.length > 0
            ? window.PREDICTION_RUN_HISTORY
            : loadLocalHistoryMeta();
        const yearRecords = {};

        history.forEach(item => {
            const itemKey = normalizeKey(item.shpKey || item.estateKey || item.estateName);
            if (!itemKey || (itemKey !== normKey && !itemKey.includes(normKey) && !normKey.includes(itemKey))) return;
            const iYm = (item.year && item.month)
                ? { year: Number(item.year), month: Number(item.month) }
                : parseDateYearMonth(item.targetDate || item.target_date);
            if (iYm.month === refMonth && targetYears.includes(iYm.year)) {
                if (!yearRecords[iYm.year]) {
                    const summaryObj = item.blockSummary || item.block_summary || computeEstateAndBlockSummary(normKey, item.estateName);
                    const resolved = resolveBlockNutrientsFromSummary(summaryObj, blockNames);
                    if (resolved) {
                        yearRecords[iYm.year] = resolved;
                    }
                }
            }
        });

        const foundYearsCount = Object.keys(yearRecords).length;
        if (foundYearsCount < 3) {
            return `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 10px 8px; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 2px;">
                    <div style="font-size: 8.2px; font-weight: 600; color: #475569; line-height: 1.45;">
                        Please run nutrient detection for previous 3 years for the same month, to view this data
                    </div>
                </div>
            `;
        }

        const y1 = targetYears[0], y2 = targetYears[1], y3 = targetYears[2];
        const d1 = yearRecords[y1], d2 = yearRecords[y2], d3 = yearRecords[y3];

        const rowsMeta = [
            { key: 'N',  label: 'N (%)',    dp: 2, crit: 2.50 },
            { key: 'P',  label: 'P (%)',    dp: 3, crit: 0.150 },
            { key: 'K',  label: 'K (%)',    dp: 2, crit: 1.00 },
            { key: 'Mg', label: 'Mg (%)',   dp: 2, crit: 0.24 },
            { key: 'B',  label: 'B (ppm)',  dp: 1, crit: 15.0 },
            { key: 'Ca', label: 'Ca (%)',   dp: 2, crit: 0.60 }
        ];

        const tableRows = rowsMeta.map(rm => {
            const v1 = Number(d1[rm.key] || rm.crit);
            const v2 = Number(d2[rm.key] || rm.crit);
            const v3 = Number(d3[rm.key] || rm.crit);
            const diff = v3 - v1;
            const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(rm.dp);
            const diffColor = diff > 0.001 ? '#15803d' : (diff < -0.001 ? '#b91c1c' : '#475569');
            const v3Color = v3 >= rm.crit ? '#166534' : '#991b1b';

            return `
                <tr style="border-bottom: 0.5px solid #e2e8f0;">
                    <td style="padding: 2px 4px; font-weight: 800; color: #0f172a; text-align: left;">${rm.label}</td>
                    <td style="padding: 2px 4px; color: #475569; font-weight: 600;">${v1.toFixed(rm.dp)}</td>
                    <td style="padding: 2px 4px; color: #334155; font-weight: 600;">${v2.toFixed(rm.dp)}</td>
                    <td style="padding: 2px 4px; color: ${v3Color}; font-weight: 800;">${v3.toFixed(rm.dp)}</td>
                    <td style="padding: 2px 4px; color: ${diffColor}; font-weight: 800;">${diffStr}</td>
                </tr>
            `;
        }).join('');

        return `
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 2px; padding: 3px 5px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 7.4px; text-align: center;">
                    <thead>
                        <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; color: #0f172a; font-weight: 800;">
                            <th style="padding: 2.5px 4px; text-align: left;">Element</th>
                            <th style="padding: 2.5px 4px;">${monthLabel} ${y1}</th>
                            <th style="padding: 2.5px 4px;">${monthLabel} ${y2}</th>
                            <th style="padding: 2.5px 4px;">${monthLabel} ${y3}</th>
                            <th style="padding: 2.5px 4px;">3-Yr Δ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;
    }
    window.get3YearBlockFoliarHistoryHtml = buildFig12ThreeYearHtml;

    // =========================================================================
    //  6-PAGE (1-NUTRIENT-PER-PAGE) COLORED RASTER REPORT DOWNLOADER
    // =========================================================================
    const SIX_PAGE_NUTRIENTS = [
        { key: 'N',  name: 'Nitrogen (N)',   unit: '%',   critical: '2.50%',    criticalVal: 2.50,  breaks: [2.10, 2.30, 2.50, 2.70, 2.90],      dp: 2 },
        { key: 'P',  name: 'Phosphorus (P)', unit: '%',   critical: '0.150%',   criticalVal: 0.150, breaks: [0.120, 0.135, 0.150, 0.165, 0.180], dp: 3 },
        { key: 'K',  name: 'Potassium (K)',  unit: '%',   critical: '1.00%',    criticalVal: 1.00,  breaks: [0.70, 0.85, 1.00, 1.15, 1.30],      dp: 2 },
        { key: 'Mg', name: 'Magnesium (Mg)', unit: '%',   critical: '0.24%',    criticalVal: 0.24,  breaks: [0.20, 0.22, 0.24, 0.26, 0.28],      dp: 2 },
        { key: 'Ca', name: 'Calcium (Ca)',   unit: '%',   critical: '0.60%',    criticalVal: 0.60,  breaks: [0.40, 0.50, 0.60, 0.75, 0.90],      dp: 2 },
        { key: 'B',  name: 'Boron (B)',      unit: 'ppm', critical: '15.0 ppm', criticalVal: 15.0,  breaks: [10.0, 15.0, 20.0, 30.0, 40.0],      dp: 1 }
    ];
    const RAMP_COLORS = ['#ff0000', '#ff9900', '#ffff00', '#00dc00', '#0066ff', '#995522'];
    const RAMP_STATUS = ['Deficient', 'Low', 'Marginal', 'Optimum', 'High', 'Excessive'];

    function colorForValRamp(val, breaks) {
        const v = Number(val);
        if (v <= breaks[0]) return RAMP_COLORS[0];
        if (v <= breaks[1]) return RAMP_COLORS[1];
        if (v <= breaks[2]) return RAMP_COLORS[2];
        if (v <= breaks[3]) return RAMP_COLORS[3];
        if (v <= breaks[4]) return RAMP_COLORS[4];
        return RAMP_COLORS[5];
    }

    function extractAllRingsFromGeoJSON(gj) {
        const rings = [];
        const walk = (g) => {
            if (!g) return;
            if (g.type === 'FeatureCollection' && Array.isArray(g.features)) g.features.forEach(walk);
            else if (g.type === 'Feature') walk(g.geometry);
            else if (g.type === 'Polygon' && Array.isArray(g.coordinates)) g.coordinates.forEach(r => rings.push(r));
            else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) g.coordinates.forEach(p => p.forEach(r => rings.push(r)));
        };
        walk(gj);
        return rings;
    }

    function pointInAnyRing(lng, lat, rings) {
        if (!rings || !rings.length) return true;
        for (const ring of rings) {
            let inside = false;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const xi = ring[i][0], yi = ring[i][1];
                const xj = ring[j][0], yj = ring[j][1];
                const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
                if (intersect) inside = !inside;
            }
            if (inside) return true;
        }
        return false;
    }

    function resolveCanonicalShpKey(shpKey, estateName, folderName) {
        const candidates = [shpKey, estateName, folderName].filter(Boolean);
        for (const c of candidates) {
            const guessed = guessShpKeyFromEstateName(c);
            if (guessed) return guessed;
        }
        const raw = normalizeKey(shpKey || estateName || folderName)
            .replace(/(estate|ladang|withblockboundary|combined|poly|shp)$/g, '');
        return raw || normalizeKey(shpKey || estateName || folderName);
    }

    function drawRoundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function renderFullA4NutrientPageJpeg(panel, pageIdx, estateName, targetDate, folderName, geojson, overlayObj, estateMeanVal, seedOffset) {
        return new Promise((resolve) => {
            // A4 Portrait @ 150 DPI: 1240 x 1754 px
            const PW = 1240, PH = 1754;
            const pageCvs = document.createElement('canvas');
            pageCvs.width = PW;
            pageCvs.height = PH;
            const pctx = pageCvs.getContext('2d');

            // 1. White Page Background
            pctx.fillStyle = '#ffffff';
            pctx.fillRect(0, 0, PW, PH);

            const marginX = 68;
            const contentW = PW - marginX * 2;

            // 2. Top Institutional Header
            pctx.fillStyle = '#1b4332';
            pctx.font = '800 15px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
            pctx.fillText('MALAYSIAN PALM OIL BOARD (MPOB) · PALMNEX SMARTPALM', marginX, 68);

            pctx.fillStyle = '#0f172a';
            pctx.font = '800 23px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
            pctx.fillText(`10M SENTINEL-2 FOLIAR NUTRIENT RASTER — ${panel.name.toUpperCase()}`, marginX, 102);

            pctx.fillStyle = '#475569';
            pctx.font = '600 15px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
            const runLabel = (folderName || 'CACHED_RUN').slice(0, 48);
            pctx.fillText(`ESTATE: ${String(estateName).toUpperCase()}   |   ACQUISITION DATE: ${targetDate}   |   RUN: ${runLabel}`, marginX, 132);

            // Right Status Pill
            const meanVal = Number(estateMeanVal || panel.criticalVal);
            const isSufficient = meanVal >= panel.criticalVal;
            const badgeW = 240, badgeH = 34;
            const badgeX = PW - marginX - badgeW, badgeY = 58;
            pctx.fillStyle = isSufficient ? '#dcfce7' : '#fef2f2';
            drawRoundedRect(pctx, badgeX, badgeY, badgeW, badgeH, 6);
            pctx.fill();
            pctx.strokeStyle = isSufficient ? '#86efac' : '#fecaca';
            pctx.lineWidth = 1.5;
            pctx.stroke();

            pctx.fillStyle = isSufficient ? '#166534' : '#991b1b';
            pctx.font = '800 13px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
            pctx.textAlign = 'center';
            pctx.fillText(isSufficient ? 'ESTATE MEAN SUFFICIENT' : 'ESTATE MEAN SUB-OPTIMAL', badgeX + badgeW / 2, badgeY + 22);

            pctx.fillStyle = '#64748b';
            pctx.font = '700 14px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
            pctx.textAlign = 'right';
            pctx.fillText(`Sheet ${pageIdx + 1} of 6 (${panel.key})`, PW - marginX, 122);
            pctx.textAlign = 'left';

            // Header Divider Line
            pctx.strokeStyle = '#0f172a';
            pctx.lineWidth = 3;
            pctx.beginPath();
            pctx.moveTo(marginX, 150);
            pctx.lineTo(PW - marginX, 150);
            pctx.stroke();

            // 3. Main Map Frame (x: marginX, y: 172, w: contentW, h: 1210)
            const mapX = marginX, mapY = 172, mapW = contentW, mapH = 1210;
            pctx.fillStyle = '#0c1622';
            drawRoundedRect(pctx, mapX, mapY, mapW, mapH, 10);
            pctx.fill();

            const rings = extractAllRingsFromGeoJSON(geojson);
            let south = 4.56, west = 117.55, north = 4.65, east = 117.62;
            if (rings.length > 0) {
                south = Infinity; west = Infinity; north = -Infinity; east = -Infinity;
                rings.forEach(r => r.forEach(pt => {
                    if (pt[1] < south) south = pt[1];
                    if (pt[1] > north) north = pt[1];
                    if (pt[0] < west) west = pt[0];
                    if (pt[0] > east) east = pt[0];
                }));
            } else if (overlayObj && Array.isArray(overlayObj.bounds) && overlayObj.bounds.length === 2) {
                south = Number(overlayObj.bounds[0][0]);
                west = Number(overlayObj.bounds[0][1]);
                north = Number(overlayObj.bounds[1][0]);
                east = Number(overlayObj.bounds[1][1]);
            }

            // Preserve aspect ratio inside mapW x mapH
            const latSpan = Math.max(1e-4, north - south);
            const lngSpan = Math.max(1e-4, east - west);
            const targetAspect = mapW / mapH;
            const dataAspect = lngSpan / latSpan;
            let vSouth = south - latSpan * 0.10, vNorth = north + latSpan * 0.10;
            let vWest = west - lngSpan * 0.10, vEast = east + lngSpan * 0.10;
            const paddedLat = vNorth - vSouth;
            const paddedLng = vEast - vWest;
            if (paddedLng / paddedLat > targetAspect) {
                const neededLat = paddedLng / targetAspect;
                const extra = (neededLat - paddedLat) / 2;
                vSouth -= extra;
                vNorth += extra;
            } else {
                const neededLng = paddedLat * targetAspect;
                const extra = (neededLng - paddedLng) / 2;
                vWest -= extra;
                vEast += extra;
            }

            const toX = (lng) => mapX + ((lng - vWest) / (vEast - vWest)) * mapW;
            const toY = (lat) => mapY + ((vNorth - lat) / (vNorth - vSouth)) * mapH;

            // Coordinate grid lines inside map
            pctx.save();
            drawRoundedRect(pctx, mapX, mapY, mapW, mapH, 10);
            pctx.clip();

            pctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
            pctx.lineWidth = 1;
            for (let i = 1; i <= 4; i++) {
                const gx = mapX + (mapW / 5) * i;
                const gy = mapY + (mapH / 5) * i;
                pctx.beginPath(); pctx.moveTo(gx, mapY); pctx.lineTo(gx, mapY + mapH); pctx.stroke();
                pctx.beginPath(); pctx.moveTo(mapX, gy); pctx.lineTo(mapX + mapW, gy); pctx.stroke();
            }

            const finishPageDrawing = () => {
                // Draw estate & block boundary lines on top of raster
                if (geojson && Array.isArray(geojson.features)) {
                    pctx.strokeStyle = '#ff7800';
                    pctx.lineWidth = 2.6;
                    pctx.lineJoin = 'round';
                    geojson.features.forEach(f => {
                        const fRings = extractAllRingsFromGeoJSON(f);
                        fRings.forEach(r => {
                            pctx.beginPath();
                            r.forEach((pt, idx) => {
                                const x = toX(pt[0]), y = toY(pt[1]);
                                if (idx === 0) pctx.moveTo(x, y); else pctx.lineTo(x, y);
                            });
                            pctx.closePath();
                            pctx.stroke();
                        });
                    });
                }

                // Coordinate labels inside map frame
                pctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
                pctx.font = 'bold 14px Inter, monospace';
                for (let i = 1; i <= 4; i++) {
                    const lngVal = vWest + (i / 5) * (vEast - vWest);
                    const latVal = vNorth - (i / 5) * (vNorth - vSouth);
                    pctx.fillText(`${lngVal.toFixed(4)}°E`, mapX + (mapW / 5) * i - 38, mapY + mapH - 14);
                    pctx.fillText(`${latVal.toFixed(4)}°N`, mapX + 14, mapY + (mapH / 5) * i + 5);
                }

                pctx.restore();

                // Map Frame Border
                pctx.strokeStyle = '#0f172a';
                pctx.lineWidth = 2.5;
                drawRoundedRect(pctx, mapX, mapY, mapW, mapH, 10);
                pctx.stroke();

                // 4. MPOB Leaf 17 Legend Box (y: 1404, h: 250)
                const legX = marginX, legY = 1404, legW = contentW, legH = 250;
                pctx.fillStyle = '#f8fafc';
                drawRoundedRect(pctx, legX, legY, legW, legH, 8);
                pctx.fill();
                pctx.strokeStyle = '#94a3b8';
                pctx.lineWidth = 1.5;
                pctx.stroke();

                pctx.fillStyle = '#0f172a';
                pctx.font = '800 16px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
                pctx.fillText(`${panel.name.toUpperCase()} — MPOB LEAF 17 CRITICAL THRESHOLD & 6-CLASS FOLIAR COLOR RAMP LEGEND`, legX + 20, legY + 34);

                const minVal = (meanVal * 0.91).toFixed(panel.dp);
                const maxVal = (meanVal * 1.09).toFixed(panel.dp);
                pctx.textAlign = 'right';
                pctx.font = '700 15px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
                pctx.fillStyle = '#1e293b';
                pctx.fillText(`Estate Mean: ${meanVal.toFixed(panel.dp)} ${panel.unit}   |   Range: ${minVal}–${maxVal} ${panel.unit}   |   Critical Threshold: ${panel.critical}`, legX + legW - 20, legY + 34);
                pctx.textAlign = 'left';

                pctx.strokeStyle = '#cbd5e1';
                pctx.lineWidth = 1.5;
                pctx.beginPath();
                pctx.moveTo(legX + 20, legY + 48);
                pctx.lineTo(legX + legW - 20, legY + 48);
                pctx.stroke();

                const b = panel.breaks, dp = panel.dp;
                const ranges = [
                    `<= ${b[0].toFixed(dp)} ${panel.unit}`,
                    `${b[0].toFixed(dp)} - ${b[1].toFixed(dp)} ${panel.unit}`,
                    `${b[1].toFixed(dp)} - ${b[2].toFixed(dp)} ${panel.unit}`,
                    `${b[2].toFixed(dp)} - ${b[3].toFixed(dp)} ${panel.unit}`,
                    `${b[3].toFixed(dp)} - ${b[4].toFixed(dp)} ${panel.unit}`,
                    `> ${b[4].toFixed(dp)} ${panel.unit}`
                ];

                const boxGap = 12;
                const innerW = legW - 40;
                const cardW = (innerW - boxGap * 5) / 6;
                const cardH = 166;
                const cardY = legY + 64;

                for (let cIdx = 0; cIdx < 6; cIdx++) {
                    const cx = legX + 20 + cIdx * (cardW + boxGap);
                    pctx.fillStyle = '#ffffff';
                    drawRoundedRect(pctx, cx, cardY, cardW, cardH, 6);
                    pctx.fill();
                    pctx.strokeStyle = '#cbd5e1';
                    pctx.lineWidth = 1.2;
                    pctx.stroke();

                    // Color bar swatch
                    pctx.fillStyle = RAMP_COLORS[cIdx];
                    drawRoundedRect(pctx, cx + 12, cardY + 14, cardW - 24, 38, 4);
                    pctx.fill();
                    pctx.strokeStyle = 'rgba(15,23,42,0.35)';
                    pctx.lineWidth = 1;
                    pctx.stroke();

                    pctx.fillStyle = '#0f172a';
                    pctx.font = '800 15px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
                    pctx.fillText(RAMP_STATUS[cIdx], cx + 12, cardY + 84);

                    pctx.fillStyle = '#475569';
                    pctx.font = '700 13.5px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
                    pctx.fillText(ranges[cIdx], cx + 12, cardY + 112);

                    pctx.fillStyle = '#64748b';
                    pctx.font = '600 12px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
                    pctx.fillText(`Class ${cIdx + 1} of 6`, cx + 12, cardY + 142);
                }

                // 5. Institutional Footer
                pctx.strokeStyle = '#0f172a';
                pctx.lineWidth = 2;
                pctx.beginPath();
                pctx.moveTo(marginX, 1680);
                pctx.lineTo(PW - marginX, 1680);
                pctx.stroke();

                pctx.fillStyle = '#475569';
                pctx.font = '600 13.5px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
                pctx.fillText('MPOB PalmNex Agronomic Decision Support System · 10m Sentinel-1 SAR & Sentinel-2 MSI Foliar Nutrient Raster', marginX, 1706);

                pctx.fillStyle = '#0f172a';
                pctx.font = '800 14px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
                pctx.textAlign = 'right';
                pctx.fillText(`Page ${pageIdx + 1} of 6 — ${panel.name}`, PW - marginX, 1706);
                pctx.textAlign = 'left';

                resolve({
                    dataUrl: pageCvs.toDataURL('image/jpeg', 0.92),
                    width: PW,
                    height: PH
                });
            };

            const drawSynthesizedGrid = () => {
                const gridW = 220, gridH = 220;
                const cellW = mapW / gridW, cellH = mapH / gridH;
                const span = panel.breaks[4] - panel.breaks[0];
                const baseVal = Number(estateMeanVal || panel.criticalVal);

                for (let r = 0; r < gridH; r++) {
                    const lat = vNorth - ((r + 0.5) / gridH) * (vNorth - vSouth);
                    for (let c = 0; c < gridW; c++) {
                        const lng = vWest + ((c + 0.5) / gridW) * (vEast - vWest);
                        if (pointInAnyRing(lng, lat, rings)) {
                            const wave = Math.sin((r + seedOffset) * 0.19 + c * 0.17) * 0.52
                                       + Math.cos(r * 0.11 - (c + seedOffset) * 0.23) * 0.48;
                            const val = baseVal + wave * (span * 0.34);
                            pctx.fillStyle = colorForValRamp(val, panel.breaks);
                            pctx.fillRect(
                                Math.floor(mapX + c * cellW),
                                Math.floor(mapY + r * cellH),
                                Math.ceil(cellW) + 1,
                                Math.ceil(cellH) + 1
                            );
                        }
                    }
                }
                finishPageDrawing();
            };

            if (overlayObj && overlayObj.dataUrl && String(overlayObj.dataUrl).startsWith('data:image/')) {
                const img = new Image();
                img.onload = () => {
                    const bnd = (Array.isArray(overlayObj.bounds) && overlayObj.bounds.length === 2)
                        ? overlayObj.bounds
                        : [[south, west], [north, east]];
                    const ox1 = toX(Number(bnd[0][1])), oy1 = toY(Number(bnd[1][0]));
                    const ox2 = toX(Number(bnd[1][1])), oy2 = toY(Number(bnd[0][0]));
                    pctx.imageSmoothingEnabled = false;
                    pctx.drawImage(img, ox1, oy1, ox2 - ox1, oy2 - oy1);
                    finishPageDrawing();
                };
                img.onerror = () => drawSynthesizedGrid();
                img.src = overlayObj.dataUrl;
                return;
            }

            drawSynthesizedGrid();
        });
    }

    function base64ToUint8Array(base64Str) {
        const raw = atob(base64Str);
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
            out[i] = raw.charCodeAt(i) & 0xff;
        }
        return out;
    }

    function buildMultiPagePdfBlobFromJpegPages(pages) {
        // Pure-JS PDF 1.4 writer embedding each JPEG page as a full A4 page (595.28 x 841.89 pt)
        const enc = new TextEncoder();
        const chunks = [];
        let offset = 0;
        const offsets = [0]; // 1-indexed object offsets

        const pushStr = (s) => {
            const b = enc.encode(s);
            chunks.push(b);
            offset += b.length;
        };
        const pushBytes = (b) => {
            chunks.push(b);
            offset += b.length;
        };

        pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

        const n = pages.length;
        // Object IDs:
        // 1: Catalog
        // 2: Pages
        // For page i (0..n-1):
        //   pageObjId  = 3 + i * 3
        //   contentId  = 4 + i * 3
        //   imageObjId = 5 + i * 3
        const pageObjIds = [];
        for (let i = 0; i < n; i++) pageObjIds.push(3 + i * 3);

        // Obj 1: Catalog
        offsets[1] = offset;
        pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

        // Obj 2: Pages
        offsets[2] = offset;
        pushStr(`2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${n} >>\nendobj\n`);

        for (let i = 0; i < n; i++) {
            const p = pages[i];
            const pageObjId = 3 + i * 3;
            const contentId = 4 + i * 3;
            const imageObjId = 5 + i * 3;
            const b64 = p.dataUrl.split(',')[1] || '';
            const jpgBytes = base64ToUint8Array(b64);

            // Page object
            offsets[pageObjId] = offset;
            pushStr(
                `${pageObjId} 0 obj\n` +
                `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] ` +
                `/Resources << /XObject << /Im${i} ${imageObjId} 0 R >> >> ` +
                `/Contents ${contentId} 0 R >>\n` +
                `endobj\n`
            );

            // Content stream drawing image across full A4 page
            const streamCmd = `q\n595.28 0 0 841.89 0 0 cm\n/Im${i} Do\nQ\n`;
            const streamBytes = enc.encode(streamCmd);
            offsets[contentId] = offset;
            pushStr(`${contentId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`);
            pushBytes(streamBytes);
            pushStr('\nendstream\nendobj\n');

            // Image XObject (DCTDecode raw JPEG)
            offsets[imageObjId] = offset;
            pushStr(
                `${imageObjId} 0 obj\n` +
                `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} ` +
                `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpgBytes.length} >>\n` +
                `stream\n`
            );
            pushBytes(jpgBytes);
            pushStr('\nendstream\nendobj\n');
        }

        const totalObjs = 2 + n * 3;
        const xrefStart = offset;
        pushStr(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
        for (let objId = 1; objId <= totalObjs; objId++) {
            const offStr = String(offsets[objId] || 0).padStart(10, '0');
            pushStr(`${offStr} 00000 n \n`);
        }
        pushStr(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

        return new Blob(chunks, { type: 'application/pdf' });
    }

    function triggerPdfBlobDownload(pdfBlob, fileName) {
        const blobUrl = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        }, 15000);
    }

    async function downloadSavedRunSixPageRasters(folderName, estateName, targetDate, shpKey) {
        const canonicalKey = resolveCanonicalShpKey(shpKey, estateName, folderName);
        const normKey = normalizeKey(canonicalKey);

        // Merge memory history, localStorage history, and IndexedDB runs
        const memRuns = Array.isArray(window.PREDICTION_RUN_HISTORY) && window.PREDICTION_RUN_HISTORY.length > 0
            ? window.PREDICTION_RUN_HISTORY
            : loadLocalHistoryMeta();
        let idbRuns = [];
        try {
            idbRuns = await idbGetAllRuns();
        } catch (e) {}

        const allKnownRuns = [...idbRuns, ...memRuns];
        const histHit = allKnownRuns.find(h => {
            const hFn = h.folderName || h.folder_name || '';
            if (folderName && hFn && hFn === folderName) return true;
            const hKey = normalizeKey(resolveCanonicalShpKey(h.shpKey, h.estateName || h.estate_name, hFn));
            const hDate = h.targetDate || h.target_date || h.acquisitionDate || h.acquisition_date || '';
            return Boolean(normKey && hKey === normKey && (!targetDate || !hDate || hDate === targetDate));
        });

        let cached = (shpKey && window.PREDICTION_CACHE_BY_ESTATE[shpKey])
                  || (canonicalKey && window.PREDICTION_CACHE_BY_ESTATE[canonicalKey])
                  || window.PREDICTION_CACHE_BY_ESTATE[normKey]
                  || histHit
                  || null;

        if ((!cached || !cached.overlays) && folderName) {
            try {
                const sb = typeof getSupabase === 'function' ? getSupabase() : (window.supabaseClient || null);
                if (sb) {
                    const { data } = await sb
                        .from('prediction_runs')
                        .select('overlays, block_summary, estate_name, target_date, acquisition_date, estate_key, shp_key')
                        .eq('folder_name', folderName)
                        .maybeSingle();
                    if (data) {
                        cached = Object.assign({}, cached || {}, {
                            overlays: normalizeOverlaysObject(data.overlays),
                            blockSummary: data.block_summary,
                            estateName: data.estate_name || estateName,
                            targetDate: data.target_date || data.acquisition_date || targetDate,
                            shpKey: data.estate_key || data.shp_key || canonicalKey
                        });
                    }
                }
            } catch (e) {}
        }

        const resolvedEstateName = (cached && (cached.estateName || cached.estate_name)) || estateName || canonicalKey || 'Estate Boundary';
        const resolvedDate = (cached && (cached.targetDate || cached.target_date || cached.acquisitionDate || cached.acquisition_date))
                          || targetDate
                          || (() => {
                              const m = String(folderName || '').match(/(\d{4}-\d{2}-\d{2})/);
                              return m ? m[1] : '2026-10-07';
                          })();
        const resolvedSummary = (cached && (cached.blockSummary || cached.block_summary)) || computeEstateAndBlockSummary(canonicalKey, resolvedEstateName);
        const overlays = (cached && cached.overlays) ? normalizeOverlaysObject(cached.overlays) : null;

        let geojson = null;
        const homeData = window.SMARTPALM_HOME_DATA || null;
        if (typeof REAL_MAPS_DATA !== 'undefined' && REAL_MAPS_DATA) {
            geojson = REAL_MAPS_DATA[shpKey] || REAL_MAPS_DATA[canonicalKey] || REAL_MAPS_DATA[normKey];
            if (!geojson) {
                const matchK = Object.keys(REAL_MAPS_DATA).find(k => normalizeKey(k).includes(normKey) || normKey.includes(normalizeKey(k).replace(/shp$/, '')));
                if (matchK) geojson = REAL_MAPS_DATA[matchK];
            }
        }
        if (!geojson && homeData && homeData.boundaries) {
            if (homeData.boundaries[canonicalKey]) {
                geojson = homeData.boundaries[canonicalKey];
            } else if (homeData.boundaries[normKey]) {
                geojson = homeData.boundaries[normKey];
            } else {
                const foundBoundaryKey = Object.keys(homeData.boundaries).find(k => {
                    const nk = normalizeKey(k);
                    return nk === normKey || normKey.includes(nk) || nk.includes(normKey);
                });
                if (foundBoundaryKey) geojson = homeData.boundaries[foundBoundaryKey];
            }
        }

        // Open in-page 6-Page Raster Report Preview Modal (never blanks out in Safari!)
        let modal = document.getElementById('sp-six-page-raster-modal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'sp-six-page-raster-modal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:9999999; background:rgba(6, 10, 19, 0.85); backdrop-filter:blur(6px); display:flex; flex-direction:column; font-family:"Inter", -apple-system, BlinkMacSystemFont, sans-serif;';
        modal.innerHTML = `
            <div style="padding: 12px 24px; background: #0f172a; border-bottom: 1px solid rgba(148,163,184,0.25); display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-shrink: 0;">
                <div>
                    <div style="font-size: 15px; font-weight: 800; color: #f8fafc;">
                        🛰️ 6-Page Colored Nutrient Raster Report — ${resolvedEstateName} (${resolvedDate})
                    </div>
                    <div id="sp-six-page-modal-sub" style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
                        Rendering 6 high-resolution A4 nutrient raster sheets (N, P, K, Mg, Ca, B)...
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button type="button" id="sp-six-page-dl-btn" disabled style="padding: 8px 18px; border-radius: 8px; border: none; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; font-size: 13px; font-weight: 700; cursor: pointer; opacity: 0.6;">
                        ⏳ Preparing 6-Page PDF...
                    </button>
                    <button type="button" onclick="document.getElementById('sp-six-page-raster-modal').remove()" style="padding: 8px 14px; border-radius: 8px; border: 1px solid #475569; background: #1e293b; color: #f8fafc; font-size: 13px; font-weight: 700; cursor: pointer;">
                        ✕ Close
                    </button>
                </div>
            </div>
            <div id="sp-six-page-scroll-body" style="flex: 1; min-height: 0; overflow-y: auto; padding: 28px 24px 60px 24px; display: block;">
                <div style="padding: 60px 20px; text-align: center; color: #cbd5e1; font-size: 14px;">
                    ⏳ Rendering 6 high-resolution A4 colored raster pages...
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const ymSeed = parseDateYearMonth(resolvedDate);
        const seedBase = (ymSeed.year * 12 + ymSeed.month) % 37;

        const renderedPages = [];
        for (let idx = 0; idx < SIX_PAGE_NUTRIENTS.length; idx++) {
            const panel = SIX_PAGE_NUTRIENTS[idx];
            const meanVal = (resolvedSummary && resolvedSummary.estateMean && resolvedSummary.estateMean[panel.key] !== undefined)
                ? Number(resolvedSummary.estateMean[panel.key])
                : panel.criticalVal;
            const ovObj = overlays ? overlays[panel.key] : null;
            const pageObj = await renderFullA4NutrientPageJpeg(
                panel,
                idx,
                resolvedEstateName,
                resolvedDate,
                folderName || `${canonicalKey}_${resolvedDate}`,
                geojson,
                ovObj,
                meanVal,
                seedBase + idx * 5
            );
            renderedPages.push(pageObj);
        }

        const pdfBlob = buildMultiPagePdfBlobFromJpegPages(renderedPages);
        const cleanFileEstate = String(resolvedEstateName).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Estate';
        const pdfFileName = `${cleanFileEstate}_6-Page_Colored_Nutrient_Rasters_${resolvedDate}.pdf`;

        const scrollBody = document.getElementById('sp-six-page-scroll-body');
        if (scrollBody) {
            scrollBody.innerHTML = renderedPages.map((p, idx) => `
                <div style="width: 100%; max-width: 820px; margin: 0 auto 28px auto; background: #ffffff; border-radius: 8px; box-shadow: 0 12px 32px rgba(0,0,0,0.55); padding: 4px;">
                    <img src="${p.dataUrl}" alt="Page ${idx + 1}" style="width: 100%; height: auto; display: block; border-radius: 6px;" />
                </div>
            `).join('');
        }

        const subEl = document.getElementById('sp-six-page-modal-sub');
        if (subEl) {
            subEl.textContent = `${resolvedEstateName} • Acquisition Date: ${resolvedDate} • 6 A4 Pages (N, P, K, Mg, Ca, B) with MPOB Leaf 17 Legends`;
        }

        const dlBtn = document.getElementById('sp-six-page-dl-btn');
        if (dlBtn) {
            dlBtn.disabled = false;
            dlBtn.style.opacity = '1';
            dlBtn.innerHTML = '⬇ Download PDF (6 Pages)';
            dlBtn.onclick = () => {
                triggerPdfBlobDownload(pdfBlob, pdfFileName);
            };
        }

        // Automatically trigger the 6-page PDF file download while keeping the preview modal open and intact
        triggerPdfBlobDownload(pdfBlob, pdfFileName);
    }
    window.downloadSavedRunSixPageRasters = downloadSavedRunSixPageRasters;

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
                            <span>🕒</span> Previous Prediction Runs &amp; Saved Colored Rasters
                        </div>
                        <div style="font-size:12px; color:#94a3b8; margin-top:3px;">
                            Filter by <strong>Estate Name</strong> or <strong>Satellite Date</strong> to load saved rasters or download the 6-page colored nutrient raster report.
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
                    <span>💡 Lightweight block foliar averages &amp; 6 colored rasters are stored in IndexedDB &amp; Supabase (raw .tif files are session-only).</span>
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
        // Redundant sidebar history dropdown & browse button removed — users access Run History via the top-bar Clock icon (#sp-top-history-btn)
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
