/**
 * PalmnexReaDS — Trial Plots GIS Map Explorer
 * --------------------------------------------------------------------------
 * High-resolution satellite geolocation & field boundary management for MPOB trials.
 * Features:
 *  - Geolocation points for all MPOB research stations and trial plots
 *  - Sharp satellite imagery (Google Maps Hybrid & ESRI World Imagery)
 *  - Interactive polygon boundary drawing tool with real-time area calculation (ha)
 *  - Client-side Shapefile (.shp + .dbf / .zip) & GeoJSON boundary importer
 *  - Seamless synchronization with READA_TRIALS and trial-main-info.html
 */

(function () {
  'use strict';

  // Master Geolocation Coordinate Registry for MPOB Trial Stations
  const MPOB_COORDINATES = {
    'DTP1': {
      lat: 4.0042,
      lng: 101.0205,
      station: 'Teluk Intan Research Station, Perak',
      soilSeries: 'Briah / Selangor Series',
      region: 'Peninsular Malaysia (Perak)',
      description: 'Density x NPKL Factorial Agronomy Trial (1988 planting)'
    },
    'FT1': {
      lat: 1.5204,
      lng: 104.1352,
      station: 'Ladang Sg. Papan, Kota Tinggi, Johor',
      soilSeries: 'Rengam Series',
      region: 'Peninsular Malaysia (Johor)',
      description: 'NPK Nutrition Factorial (1989 planting)'
    },
    'FT2': {
      lat: 2.1802,
      lng: 103.2005,
      station: 'Bukit Paloh Estate, Kluang, Johor',
      soilSeries: 'Harimau / Kulai Series',
      region: 'Peninsular Malaysia (Johor)',
      description: 'N-K-Mg Fertilizer Trial (1990 planting)'
    },
    'FT3': {
      lat: 5.8504,
      lng: 117.7508,
      station: 'Pamol Estate, Sandakan, Sabah',
      soilSeries: 'Tanjong Lipat Series',
      region: 'Sabah (Sandakan)',
      description: 'NPKB Micro-nutrient Trial (1991 planting)'
    },
    'FT4': {
      lat: 5.4201,
      lng: 118.1502,
      station: 'Malamba Estate, Kinabatangan, Sabah',
      soilSeries: 'Kretam Series',
      region: 'Sabah (Kinabatangan)',
      description: 'High-Yield Progeny Nutrition (1992 planting)'
    },
    'FT5': {
      lat: 5.2500,
      lng: 118.0500,
      station: 'Ladang Koko, Landas, Sabah',
      soilSeries: 'Sementa Series',
      region: 'Sabah (East Coast)',
      description: 'Alluvial Soil Nutrition Trial (1993 planting)'
    },
    'LPK1': {
      lat: 4.0080,
      lng: 101.0180,
      station: 'Teluk Intan Agronomy Blocks, Perak',
      soilSeries: 'Briah Series',
      region: 'Peninsular Malaysia (Perak)',
      description: 'Long-term Potassium Dynamics (1989 planting)'
    },
    'RISDA': {
      lat: 4.2200,
      lng: 101.1800,
      station: 'Stesen RISDA Gerdong, Bidor, Perak',
      soilSeries: 'Malacca Series',
      region: 'Peninsular Malaysia (Perak)',
      description: 'Smallholder Replanting & Nutrition Trial (1987 planting)'
    },
    'TEP1': {
      lat: 4.0110,
      lng: 101.0250,
      station: 'Teluk Intan Agronomy Blocks, Perak',
      soilSeries: 'Briah Series',
      region: 'Peninsular Malaysia (Perak)',
      description: 'Peat Soil Trace Element Trial (1989 planting)'
    },
    'TEP2': {
      lat: 4.3100,
      lng: 100.9500,
      station: 'Felcra Sg. Mong, Perak',
      soilSeries: 'Sogomana Series',
      region: 'Peninsular Malaysia (Perak)',
      description: 'Mineral Soil NPK Agronomy (1990 planting)'
    },
    'PR1998/1': {
      lat: 2.8125,
      lng: 101.5050,
      station: 'MPOB Banting Research Station, Selangor',
      soilSeries: 'Kapar Series',
      region: 'Peninsular Malaysia (Selangor)',
      description: 'Agronomy & Physiology Breeding Block'
    },
    'PR2002/4': {
      lat: 2.0305,
      lng: 103.3250,
      station: 'MPOB Kluang Substation, Johor',
      soilSeries: 'Rengam Series',
      region: 'Peninsular Malaysia (Johor)',
      description: 'High-Density Breeding Progeny Evaluation'
    },
    'PR2005/2': {
      lat: 4.0060,
      lng: 101.0220,
      station: 'Teluk Intan Research Station, Perak',
      soilSeries: 'Briah Series',
      region: 'Peninsular Malaysia (Perak)',
      description: 'Tissue Culture Clone Performance Field'
    }
  };

  // State Management
  const state = {
    map: null,
    markers: {},
    activeTrialCode: null,
    trials: [],
    drawnLayers: [],
    uploadedLayers: [],
    isDrawing: false,
    drawingPoints: [],
    tempPolyline: null,
    tempPolygon: null,
    tempGuideMarkers: []
  };

  // --------------------------------------------------------------------------
  // Utility: Spherical Geodesic Area Calculation (Hectares)
  // --------------------------------------------------------------------------
  function calculatePolygonAreaHectares(latLngs) {
    if (!latLngs || latLngs.length < 3) return 0;
    const R = 6378137; // Earth radius in meters
    let totalArea = 0;

    const rad = d => (d * Math.PI) / 180;
    const n = latLngs.length;

    for (let i = 0; i < n; i++) {
      const p1 = latLngs[i];
      const p2 = latLngs[(i + 1) % n];
      const lat1 = rad(p1.lat !== undefined ? p1.lat : p1[0]);
      const lng1 = rad(p1.lng !== undefined ? p1.lng : p1[1]);
      const lat2 = rad(p2.lat !== undefined ? p2.lat : p2[0]);
      const lng2 = rad(p2.lng !== undefined ? p2.lng : p2[1]);

      totalArea += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    totalArea = (Math.abs(totalArea) * R * R) / 2.0;
    const hectares = totalArea / 10000;
    return hectares;
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', async () => {
    if (window.ReadaSync && typeof window.ReadaSync.fetchTrials === 'function') {
      try {
        await window.ReadaSync.fetchTrials();
      } catch (e) {
        console.warn('ReadaSync fetch error on map init:', e);
      }
    }
    loadTrialsData();
    initMap();
    renderTrialsSidebar();
    setupEventListeners();
    await loadSavedBoundaries();
  });

  function loadTrialsData() {
    let trials = [];
    if (window.READA_TRIALS && Array.isArray(window.READA_TRIALS)) {
      trials = [...window.READA_TRIALS];
    }

    // Merge any trials added by user in trial-main-info.html stored in localStorage
    try {
      const custom = localStorage.getItem('reada_custom_trials');
      if (custom) {
        const parsed = JSON.parse(custom);
        parsed.forEach(pt => {
          if (!trials.some(t => t.code === pt.code)) {
            trials.push(pt);
          }
        });
      }
    } catch (e) {
      console.warn('Error reading custom trials:', e);
    }

    state.trials = trials;
  }

  // --------------------------------------------------------------------------
  // Map Initialization: Satellite Imagery with High Resolution
  // --------------------------------------------------------------------------
  function initMap() {
    // Default center: Peninsular Malaysia overview
    const defaultCenter = [3.8, 102.5];
    const defaultZoom = 7;

    state.map = L.map('map-canvas', {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: false,
      maxZoom: 19
    });

    // Add Top-Right Zoom Control
    L.control.zoom({ position: 'topright' }).addTo(state.map);

    // 1. ESRI World Imagery (Ultra High-Res Satellite Photography)
    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19
    });

    // 2. High-contrast estate labels overlay
    const esriLabels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      opacity: 0.85
    });

    // 3. OpenStreetMap standard street layer (alternative)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    });

    // 4. Google Maps Hybrid layer via standard TMS tiles
    const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps',
      maxZoom: 20
    });

    // Add Google Hybrid as default for sharpest images, with fallback to ESRI
    googleHybrid.addTo(state.map);

    const baseMaps = {
      'Google Maps (Satellite Hybrid)': googleHybrid,
      'ESRI World Imagery (High-Res Satellite)': esriSatellite,
      'OpenStreetMap (Terrain & Roads)': osmLayer
    };

    const overlays = {
      'Estate & Place Labels': esriLabels
    };

    L.control.layers(baseMaps, overlays, { position: 'bottomright' }).addTo(state.map);

    // Render geolocation points (markers ONLY by default, NO boundaries)
    renderTrialMarkers();
  }

  // --------------------------------------------------------------------------
  // Markers: Geolocation Points ONLY
  // --------------------------------------------------------------------------
  function createCustomPinIcon(code, isSelected) {
    const bg = isSelected ? '#16a34a' : '#0f172a';
    const border = isSelected ? '#ffffff' : '#4ade80';
    const scale = isSelected ? 'scale(1.15)' : 'scale(1)';

    return L.divIcon({
      className: 'custom-trial-pin-container',
      html: `
        <div style="transform: ${scale}; transition: transform 0.2s ease; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
          <div style="background: ${bg}; color: #ffffff; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; font-weight: 700; padding: 3px 7px; border-radius: 6px; border: 2px solid ${border}; box-shadow: 0 4px 10px rgba(0,0,0,0.4); display: flex; align-items: center; gap: 4px; white-space: nowrap;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #4ade80;"></span>
            ${code}
          </div>
          <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid ${border}; margin-top: -1px;"></div>
        </div>
      `,
      iconSize: [60, 32],
      iconAnchor: [30, 32],
      popupAnchor: [0, -32]
    });
  }

  function renderTrialMarkers() {
    // Clear existing
    Object.values(state.markers).forEach(m => state.map.removeLayer(m));
    state.markers = {};

    state.trials.forEach(trial => {
      const trialLat = (trial.latitude !== null && trial.latitude !== undefined && !isNaN(trial.latitude)) ? Number(trial.latitude) : null;
      const trialLng = (trial.longitude !== null && trial.longitude !== undefined && !isNaN(trial.longitude)) ? Number(trial.longitude) : null;

      const fallback = MPOB_COORDINATES[trial.code] || {
        lat: 4.0042 + (Math.random() - 0.5) * 0.1,
        lng: 101.0205 + (Math.random() - 0.5) * 0.1,
        station: trial.estate || 'MPOB Station',
        soilSeries: 'Mineral / Alluvial Series',
        region: 'Malaysia',
        description: 'MPOB Agronomy Field Trial'
      };

      const geo = {
        lat: trialLat !== null ? trialLat : fallback.lat,
        lng: trialLng !== null ? trialLng : fallback.lng,
        station: fallback.station || trial.estate || 'MPOB Station',
        soilSeries: fallback.soilSeries || 'Mineral / Alluvial Series',
        region: fallback.region || 'Malaysia',
        description: fallback.description || 'MPOB Agronomy Field Trial'
      };

      const marker = L.marker([geo.lat, geo.lng], {
        icon: createCustomPinIcon(trial.code, false),
        title: `${trial.code} — ${trial.estate}`
      });

      const popupContent = buildPopupContent(trial, geo);
      marker.bindPopup(popupContent, { maxWidth: 320 });

      marker.on('click', () => {
        selectTrial(trial.code, false);
      });

      marker.addTo(state.map);
      state.markers[trial.code] = marker;
    });
  }

  function buildPopupContent(trial, geo) {
    const hasData = trial.plotTreatments && trial.plotTreatments.length > 0;
    const factorCount = trial.factorsCount || (trial.factors ? trial.factors.length : 0);

    return `
      <div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 2px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px;">
          <div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a; line-height: 1.2;">
              ${trial.code}
            </div>
            <div style="font-size: 0.76rem; color: #166534; font-weight: 600;">
              ${trial.estate}
            </div>
          </div>
          <span style="font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 12px; ${hasData ? 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;' : 'background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;'}">
            ${hasData ? 'Saved Records' : 'Registered'}
          </span>
        </div>

        <div style="font-size: 0.74rem; color: #475569; line-height: 1.5; margin-bottom: 10px;">
          <div><strong>Station:</strong> ${geo.station}</div>
          <div><strong>Planting Year:</strong> ${trial.plantingYear || 'N/A'}</div>
          <div><strong>Soil Series:</strong> ${geo.soilSeries}</div>
          <div><strong>Factors:</strong> ${factorCount} factors evaluated</div>
          <div><strong>GPS Coordinates:</strong> <span style="font-family: monospace; color: #0284c7;">${geo.lat.toFixed(4)}°N, ${geo.lng.toFixed(4)}°E</span></div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #f1f5f9; padding-top: 8px;">
          <div style="display: flex; gap: 6px;">
            <a href="trial-main-info.html?trial=${encodeURIComponent(trial.code)}" target="_blank" style="flex: 1; text-align: center; background: #0f172a; color: #ffffff; padding: 5px 8px; font-size: 0.72rem; font-weight: 600; border-radius: 4px; text-decoration: none;">
              Main Info ↗
            </a>
            <a href="yield-recording.html?trial=${encodeURIComponent(trial.code)}" target="_blank" style="flex: 1; text-align: center; background: #166534; color: #ffffff; padding: 5px 8px; font-size: 0.72rem; font-weight: 600; border-radius: 4px; text-decoration: none;">
              Yield Data ↗
            </a>
          </div>
          <button type="button" onclick="window.trialMapController.startDrawingForTrial('${trial.code}')" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; background: #f0fdf4; border: 1px dashed #22c55e; color: #15803d; padding: 5px 8px; font-size: 0.72rem; font-weight: 700; border-radius: 4px; cursor: pointer;">
            ✏️ Draw Block Boundary on Map
          </button>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Sidebar List Rendering & Search
  // --------------------------------------------------------------------------
  function renderTrialsSidebar() {
    const listEl = document.getElementById('map-trials-list');
    const searchVal = (document.getElementById('map-search-input')?.value || '').toLowerCase();
    const countBadge = document.getElementById('map-trial-count-badge');

    if (!listEl) return;

    const filtered = state.trials.filter(t => {
      const code = (t.code || '').toLowerCase();
      const estate = (t.estate || '').toLowerCase();
      const yr = String(t.plantingYear || '');
      return code.includes(searchVal) || estate.includes(searchVal) || yr.includes(searchVal);
    });

    if (countBadge) {
      countBadge.textContent = `${filtered.length} Trials`;
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 30px 16px; color: #64748b; font-size: 0.78rem;">
          No trials match your search filter.<br>
          <span style="font-size: 0.72rem;">Try searching by Trial code (e.g. DTP1) or Estate name.</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(t => {
      const trialLat = (t.latitude !== null && t.latitude !== undefined && !isNaN(t.latitude)) ? Number(t.latitude) : null;
      const trialLng = (t.longitude !== null && t.longitude !== undefined && !isNaN(t.longitude)) ? Number(t.longitude) : null;
      const fallback = MPOB_COORDINATES[t.code] || { lat: 4.0042, lng: 101.0205 };
      const geo = {
        lat: trialLat !== null ? trialLat : fallback.lat,
        lng: trialLng !== null ? trialLng : fallback.lng
      };
      const hasData = t.plotTreatments && t.plotTreatments.length > 0;
      const isActive = t.code === state.activeTrialCode;
      const factorCount = t.factorsCount || (t.factors ? t.factors.length : 0);

      return `
        <div class="map-trial-card ${isActive ? 'active' : ''}" onclick="window.trialMapController.selectTrial('${t.code}', true)" data-code="${t.code}">
          <div class="map-trial-card-top">
            <div class="map-trial-code">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px; color: ${isActive ? '#166534' : '#64748b'};"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
              <span>${t.code}</span>
            </div>
            <span class="map-trial-badge ${hasData ? 'badge-has-data' : 'badge-registered'}">
              ${hasData ? 'Saved Records' : 'Registered'}
            </span>
          </div>

          <div class="map-trial-estate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 13px; height: 13px; color: #166534;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${t.estate}</span>
          </div>

          <div class="map-trial-meta">
            <span>Planting: <strong>${t.plantingYear || 'N/A'}</strong></span>
            <span>Factors: <strong>${factorCount}</strong></span>
          </div>

          <div class="map-trial-coords">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 11px; height: 11px;"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
            ${geo.lat.toFixed(4)}°N, ${geo.lng.toFixed(4)}°E
          </div>
        </div>
      `;
    }).join('');
  }

  // --------------------------------------------------------------------------
  // Select & Center Trial
  // --------------------------------------------------------------------------
  function selectTrial(code, panToMap = true) {
    state.activeTrialCode = code;

    // Update sidebar active classes
    const cards = document.querySelectorAll('.map-trial-card');
    cards.forEach(c => {
      if (c.getAttribute('data-code') === code) {
        c.classList.add('active');
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        c.classList.remove('active');
      }
    });

    // Update marker icon states
    Object.entries(state.markers).forEach(([tCode, marker]) => {
      const isSelected = tCode === code;
      marker.setIcon(createCustomPinIcon(tCode, isSelected));
    });

    // Pan and zoom map
    const marker = state.markers[code];
    if (marker) {
      if (panToMap) {
        state.map.flyTo(marker.getLatLng(), 15, {
          duration: 1.2,
          easeLinearity: 0.25
        });
      }
      marker.openPopup();
    }
  }

  // --------------------------------------------------------------------------
  // Interactive Polygon Boundary Drawing Tool
  // --------------------------------------------------------------------------
  function startDrawingForTrial(trialCode) {
    if (trialCode) {
      selectTrial(trialCode, true);
    }
    startDrawingMode();
  }

  function startDrawingMode() {
    if (state.isDrawing) return;
    state.isDrawing = true;
    state.drawingPoints = [];

    // Show drawing HUD
    const hud = document.getElementById('map-drawing-hud');
    if (hud) hud.style.display = 'flex';

    // Change map cursor
    document.getElementById('map-canvas').style.cursor = 'crosshair';

    // Update HUD text
    updateDrawingHud();

    // Map click listener for adding vertices
    state.map.on('click', onMapDrawClick);
    state.map.on('mousemove', onMapDrawMove);
    state.map.on('dblclick', finishDrawing);
  }

  function onMapDrawClick(e) {
    if (!state.isDrawing) return;
    const latLng = e.latlng;
    state.drawingPoints.push(latLng);

    // Add visible vertex guide pin
    const guideMarker = L.circleMarker(latLng, {
      radius: 5,
      color: '#ffffff',
      weight: 2,
      fillColor: '#22c55e',
      fillOpacity: 1
    }).addTo(state.map);
    state.tempGuideMarkers.push(guideMarker);

    renderTempDrawing();
    updateDrawingHud();
  }

  function onMapDrawMove(e) {
    if (!state.isDrawing || state.drawingPoints.length === 0) return;
    // Realtime rubber-band polygon preview
    const previewPoints = [...state.drawingPoints, e.latlng];
    if (state.tempPolygon) {
      state.tempPolygon.setLatLngs(previewPoints);
    } else {
      state.tempPolygon = L.polygon(previewPoints, {
        color: '#22c55e',
        weight: 2,
        dashArray: '4, 4',
        fillColor: '#4ade80',
        fillOpacity: 0.25
      }).addTo(state.map);
    }

    const currentHa = calculatePolygonAreaHectares(previewPoints);
    const badge = document.getElementById('map-hud-area-val');
    if (badge) {
      badge.textContent = `${currentHa.toFixed(2)} ha`;
    }
  }

  function renderTempDrawing() {
    if (state.drawingPoints.length < 2) return;
    if (state.tempPolyline) {
      state.tempPolyline.setLatLngs(state.drawingPoints);
    } else {
      state.tempPolyline = L.polyline(state.drawingPoints, {
        color: '#22c55e',
        weight: 3
      }).addTo(state.map);
    }
  }

  function updateDrawingHud() {
    const ptsCount = state.drawingPoints.length;
    const descEl = document.getElementById('map-hud-instruction');
    const badge = document.getElementById('map-hud-area-val');

    if (ptsCount === 0) {
      if (descEl) descEl.textContent = 'Click on the map canopy to place the first boundary vertex.';
      if (badge) badge.textContent = '0.00 ha';
    } else if (ptsCount < 3) {
      if (descEl) descEl.textContent = `Point ${ptsCount} placed. Click at least ${3 - ptsCount} more points to enclose a trial block.`;
      if (badge) badge.textContent = '0.00 ha';
    } else {
      const ha = calculatePolygonAreaHectares(state.drawingPoints);
      if (descEl) descEl.textContent = `${ptsCount} vertices placed. Double-click or click "Finish & Save" to finalize block.`;
      if (badge) badge.textContent = `${ha.toFixed(2)} ha`;
    }
  }

  function undoLastDrawingPoint() {
    if (!state.isDrawing || state.drawingPoints.length === 0) return;
    state.drawingPoints.pop();
    const lastMarker = state.tempGuideMarkers.pop();
    if (lastMarker) state.map.removeLayer(lastMarker);

    if (state.tempPolyline) {
      state.tempPolyline.setLatLngs(state.drawingPoints);
    }
    updateDrawingHud();
  }

  function cancelDrawing() {
    cleanupDrawingArtifacts();
  }

  function cleanupDrawingArtifacts() {
    state.isDrawing = false;
    state.drawingPoints = [];

    if (state.tempPolyline) {
      state.map.removeLayer(state.tempPolyline);
      state.tempPolyline = null;
    }
    if (state.tempPolygon) {
      state.map.removeLayer(state.tempPolygon);
      state.tempPolygon = null;
    }
    state.tempGuideMarkers.forEach(m => state.map.removeLayer(m));
    state.tempGuideMarkers = [];

    state.map.off('click', onMapDrawClick);
    state.map.off('mousemove', onMapDrawMove);
    state.map.off('dblclick', finishDrawing);

    const hud = document.getElementById('map-drawing-hud');
    if (hud) hud.style.display = 'none';
    document.getElementById('map-canvas').style.cursor = '';
  }

  function finishDrawing() {
    if (!state.isDrawing) return;
    if (state.drawingPoints.length < 3) {
      alert('A trial block boundary polygon requires at least 3 corner points.');
      return;
    }

    const areaHa = calculatePolygonAreaHectares(state.drawingPoints);
    const trialCode = state.activeTrialCode || 'Trial Plot';
    const defaultName = `${trialCode} Block Boundary (${areaHa.toFixed(2)} ha)`;

    const boundaryName = prompt('Enter a label for this trial block boundary:', defaultName);
    if (!boundaryName) {
      cleanupDrawingArtifacts();
      return;
    }

    // Create permanent polygon
    const polygon = L.polygon(state.drawingPoints, {
      color: '#16a34a',
      weight: 2.5,
      fillColor: '#22c55e',
      fillOpacity: 0.35
    }).addTo(state.map);

    polygon.bindPopup(`
      <div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 4px;">
        <strong style="color: #14532d; font-size: 0.85rem;">${boundaryName}</strong><br>
        <span style="font-size: 0.74rem; color: #475569;">Trial: <strong>${trialCode}</strong></span><br>
        <span style="font-size: 0.74rem; color: #475569;">Calculated Area: <strong style="color: #15803d;">${areaHa.toFixed(2)} ha</strong></span><br>
        <div style="margin-top: 8px;">
          <button type="button" onclick="window.trialMapController.deleteBoundary('${polygon._leaflet_id}')" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; font-size: 0.70rem; padding: 3px 8px; border-radius: 4px; cursor: pointer;">
            Delete Boundary
          </button>
        </div>
      </div>
    `);

    state.drawnLayers.push({
      id: polygon._leaflet_id,
      name: boundaryName,
      trialCode: trialCode,
      areaHa: areaHa,
      latLngs: state.drawingPoints.map(p => ({ lat: p.lat, lng: p.lng })),
      layer: polygon
    });

    saveBoundariesToStorage();
    cleanupDrawingArtifacts();
    polygon.openPopup();
  }

  function deleteBoundary(layerId) {
    const idx = state.drawnLayers.findIndex(d => String(d.id) === String(layerId) || String(d.layer?._leaflet_id) === String(layerId));
    if (idx !== -1) {
      const removed = state.drawnLayers.splice(idx, 1)[0];
      if (removed.layer) {
        state.map.removeLayer(removed.layer);
      }
      saveBoundariesToStorage();
    }
  }

  async function saveBoundariesToStorage() {
    try {
      const serializable = state.drawnLayers.map(d => ({
        id: d.id,
        name: d.name,
        trialCode: d.trialCode,
        areaHa: d.areaHa,
        latLngs: d.latLngs
      }));
      localStorage.setItem('palmnex_trial_boundaries', JSON.stringify(serializable));

      if (window.ReadaSync) {
        for (const b of serializable) {
          await window.ReadaSync.saveBoundary(b.trialCode, b.name, b.areaHa, b.latLngs);
        }
      }
    } catch (e) {
      console.warn('Could not save boundaries:', e);
    }
  }

  async function loadSavedBoundaries() {
    try {
      let parsed = [];
      const client = window.ReadaSync ? window.ReadaSync.getClient() : null;
      if (client) {
        const { data } = await client.from('trial_boundaries').select('*');
        if (data && data.length > 0) {
          parsed = data.map(r => ({
            id: r.id,
            name: r.boundary_name,
            trialCode: r.trial_code,
            areaHa: Number(r.area_hectares) || 0,
            latLngs: r.coordinates
          }));
        }
      }

      if (parsed.length === 0) {
        const saved = localStorage.getItem('palmnex_trial_boundaries');
        if (saved) {
          const lParsed = JSON.parse(saved);
          if (Array.isArray(lParsed)) parsed = lParsed;
        }
      }

      parsed.forEach(item => {
        if (!item.latLngs || item.latLngs.length < 3) return;
        const polygon = L.polygon(item.latLngs, {
          color: '#16a34a',
          weight: 2.5,
          fillColor: '#22c55e',
          fillOpacity: 0.35
        }).addTo(state.map);

        polygon.bindPopup(`
          <div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 4px;">
            <strong style="color: #14532d; font-size: 0.85rem;">${item.name}</strong><br>
            <span style="font-size: 0.74rem; color: #475569;">Trial: <strong>${item.trialCode}</strong></span><br>
            <span style="font-size: 0.74rem; color: #475569;">Calculated Area: <strong style="color: #15803d;">${item.areaHa.toFixed(2)} ha</strong></span><br>
            <div style="margin-top: 8px;">
              <button type="button" onclick="window.trialMapController.deleteBoundary('${polygon._leaflet_id}')" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; font-size: 0.70rem; padding: 3px 8px; border-radius: 4px; cursor: pointer;">
                Delete Boundary
              </button>
            </div>
          </div>
        `);

        state.drawnLayers.push({
          id: polygon._leaflet_id,
          name: item.name,
          trialCode: item.trialCode,
          areaHa: item.areaHa,
          latLngs: item.latLngs,
          layer: polygon
        });
      });
    } catch (e) {
      console.warn('Error loading saved boundaries:', e);
    }
  }

  // --------------------------------------------------------------------------
  // Shapefile & DBF File / GeoJSON Parser
  // --------------------------------------------------------------------------
  function openUploadModal() {
    const modal = document.getElementById('map-upload-modal');
    if (modal) modal.classList.add('active');
  }

  function closeUploadModal() {
    const modal = document.getElementById('map-upload-modal');
    if (modal) modal.classList.remove('active');
    const input = document.getElementById('shp-file-input');
    if (input) input.value = '';
    const status = document.getElementById('shp-upload-status');
    if (status) status.innerHTML = '';
  }

  async function handleShapefileUpload(files) {
    if (!files || files.length === 0) return;
    const statusEl = document.getElementById('shp-upload-status');
    if (statusEl) {
      statusEl.innerHTML = `<span style="color: #0284c7;">Reading shapefile geometry...</span>`;
    }

    try {
      let geojson = null;
      const file = files[0];

      // Case 1: Direct GeoJSON file (.json / .geojson)
      if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
        const text = await file.text();
        geojson = JSON.parse(text);
      }
      // Case 2: Zipped Shapefile (.zip containing .shp, .dbf, .shx)
      else if (file.name.endsWith('.zip')) {
        const buffer = await file.arrayBuffer();
        if (typeof window.shp === 'function') {
          geojson = await window.shp(buffer);
        } else {
          throw new Error('Shapefile parser engine (shpjs) is still loading. Please check network connection.');
        }
      }
      // Case 3: Multiple files (.shp + .dbf selected together)
      else if (files.length > 1) {
        let shpFile = null;
        let dbfFile = null;
        for (let i = 0; i < files.length; i++) {
          if (files[i].name.endsWith('.shp')) shpFile = files[i];
          if (files[i].name.endsWith('.dbf')) dbfFile = files[i];
        }

        if (shpFile && typeof window.shp === 'function' && window.shp.combine) {
          const shpBuffer = await shpFile.arrayBuffer();
          const dbfBuffer = dbfFile ? await dbfFile.arrayBuffer() : null;
          const geometries = window.shp.parseShp(shpBuffer);
          const properties = dbfBuffer ? window.shp.parseDbf(dbfBuffer) : [];
          geojson = window.shp.combine([geometries, properties]);
        } else {
          throw new Error('Please select both .shp and .dbf files, or a single .zip archive containing both.');
        }
      } else {
        throw new Error('Unsupported format. Please upload a .zip archive containing .shp and .dbf, or a .geojson file.');
      }

      if (!geojson) {
        throw new Error('No valid spatial boundaries found in uploaded shapefile.');
      }

      // Add GeoJSON to map
      let loadedCount = 0;
      let totalHa = 0;

      const layer = L.geoJSON(geojson, {
        style: function (feature) {
          return {
            color: '#0284c7',
            weight: 2,
            fillColor: '#38bdf8',
            fillOpacity: 0.35
          };
        },
        onEachFeature: function (feature, l) {
          loadedCount++;
          let propHtml = '<div style="font-family: ui-sans-serif, system-ui; max-height: 200px; overflow-y: auto;">';
          propHtml += '<strong style="color: #0369a1; font-size: 0.85rem;">Shapefile Boundary Block</strong><br>';
          
          if (feature.properties) {
            propHtml += '<table style="width: 100%; font-size: 0.70rem; border-collapse: collapse; margin-top: 4px;">';
            Object.entries(feature.properties).forEach(([k, v]) => {
              propHtml += `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; padding: 2px 4px; color: #475569;">${k}:</td><td style="padding: 2px 4px; color: #0f172a;">${v}</td></tr>`;
            });
            propHtml += '</table>';
          }
          propHtml += '</div>';
          l.bindPopup(propHtml);

          if (l.getLatLngs) {
            const ha = calculatePolygonAreaHectares(l.getLatLngs()[0] || l.getLatLngs());
            totalHa += ha;
          }
        }
      }).addTo(state.map);

      state.uploadedLayers.push(layer);

      // Zoom to fit uploaded shapefile boundaries
      state.map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 17 });

      if (statusEl) {
        statusEl.innerHTML = `
          <div style="color: #166534; font-weight: 600; margin-top: 8px;">
            ✓ Successfully loaded ${loadedCount} boundary feature(s) (${totalHa.toFixed(2)} ha total)!
          </div>
        `;
      }

      setTimeout(() => {
        closeUploadModal();
      }, 1500);

    } catch (err) {
      console.error(err);
      if (statusEl) {
        statusEl.innerHTML = `<span style="color: #dc2626; font-weight: 600;">Upload Error: ${err.message}</span>`;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Export Boundaries as CSV ONLY (No JSON / No DBF)
  // --------------------------------------------------------------------------
  function exportBoundariesCSV() {
    if (state.drawnLayers.length === 0 && state.uploadedLayers.length === 0) {
      alert('No boundaries have been drawn or uploaded yet.');
      return;
    }

    let csvContent = 'TRIAL_CODE,BOUNDARY_NAME,AREA_HECTARES,POINT_INDEX,LATITUDE,LONGITUDE\n';

    state.drawnLayers.forEach(d => {
      d.latLngs.forEach((pt, idx) => {
        csvContent += `"${d.trialCode || ''}","${(d.name || '').replace(/"/g, '""')}",${d.areaHa.toFixed(4)},${idx + 1},${pt.lat.toFixed(6)},${pt.lng.toFixed(6)}\n`;
      });
    });

    state.uploadedLayers.forEach((layer, lIdx) => {
      if (layer.eachLayer) {
        layer.eachLayer(subLayer => {
          if (subLayer.getLatLngs) {
            const rawPts = subLayer.getLatLngs()[0] || subLayer.getLatLngs();
            const pts = Array.isArray(rawPts) ? rawPts : [rawPts];
            pts.forEach((pt, idx) => {
              if (pt && pt.lat !== undefined) {
                csvContent += `"IMPORTED","Uploaded Boundary ${lIdx + 1}",0,${idx + 1},${pt.lat.toFixed(6)},${pt.lng.toFixed(6)}\n`;
              }
            });
          }
        });
      }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mpob_trial_boundaries_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --------------------------------------------------------------------------
  // Event Listeners
  // --------------------------------------------------------------------------
  function setupEventListeners() {
    // Search Filter
    const searchInput = document.getElementById('map-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderTrialsSidebar();
      });
    }

    // Shapefile File Input
    const fileInput = document.getElementById('shp-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', e => {
        handleShapefileUpload(e.target.files);
      });
    }

    // Drag and drop for upload zone
    const dropZone = document.getElementById('shp-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleShapefileUpload(e.dataTransfer.files);
      });
    }

    // URL parameter: if opened with ?trial=DTP1, automatically select it!
    const params = new URLSearchParams(window.location.search);
    const targetTrial = params.get('trial');
    if (targetTrial) {
      setTimeout(() => {
        selectTrial(targetTrial, true);
      }, 500);
    }
  }

  // Export public controller for HTML buttons
  window.trialMapController = {
    selectTrial,
    startDrawingForTrial,
    startDrawingMode,
    undoLastDrawingPoint,
    cancelDrawing,
    finishDrawing,
    deleteBoundary,
    openUploadModal,
    closeUploadModal,
    exportBoundariesCSV,
    exportBoundariesGeoJSON: exportBoundariesCSV
  };

})();
