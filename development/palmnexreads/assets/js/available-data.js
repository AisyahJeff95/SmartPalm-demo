/**
 * ReaDA — List of Available Trial Data
 * -------------------------------------------------------------------------
 * Primary Application Controller for Module 1 (Figure 2 Master-Detail View)
 * Relational Database for Agronomy Trial Data — PORIM / MPOB
 */

(function () {
  'use strict';

  let TRIALS = Array.isArray(window.READA_TRIALS) ? window.READA_TRIALS : [];

  const DATASETS = [
    { key: 'recordingYield',        title: 'Recording Yield',        kind: 'period', color: 'var(--c-recording)', note: 'Recording duration' },
    { key: 'ffbYield',              title: 'F.F.B. Yield',           kind: 'period', color: 'var(--c-ffb)',       note: 'Annual yield periods' },
    { key: 'leafNutrients',         title: 'Leaf Nutrients',         kind: 'date',   color: 'var(--c-leaf)',      note: 'Foliar diagnosis dates' },
    { key: 'vegetativeMeasurement', title: 'Vegetative',             kind: 'date',   color: 'var(--c-veg)',       note: 'Morphological measurement dates' },
    { key: 'soilNutrients',         title: 'Soil Nutrients',         kind: 'date',   color: 'var(--c-soil)',      note: 'Pedological sampling dates' }
  ];

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // DOM Elements
  const el = {
    trialList: document.getElementById('trial-list'),
    trialSearch: document.getElementById('trial-search'),
    trialCountBadge: document.getElementById('trial-count-badge'),
    detailContainer: document.getElementById('detail-container'),
    metricTrials: document.getElementById('metric-trials'),
    metricActive: document.getElementById('metric-active'),
    metricRecords: document.getElementById('metric-records'),
    metricSpan: document.getElementById('metric-span'),
    btnExport: document.getElementById('btn-export-trial'),
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toast-msg')
  };

  let selectedIndex = 0; // Default to DTP1
  let filterQuery = '';

  // Helpers
  const pad2 = (n) => String(n || 0).padStart(2, '0');
  const countRecords = (t) => DATASETS.reduce((sum, ds) => sum + ((t[ds.key] || []).length), 0);
  const yearOf = (rec, kind) => (kind === 'period' ? rec.from.yr : rec.yr);

  function getYearSpan(trialsList) {
    let min = Infinity, max = -Infinity;
    trialsList.forEach(t => {
      DATASETS.forEach(ds => {
        (t[ds.key] || []).forEach(r => {
          const y = yearOf(r, ds.kind);
          const y2 = ds.kind === 'period' ? r.to.yr : y;
          if (y && y > 1900) min = Math.min(min, y);
          if (y2 && y2 > 1900) max = Math.max(max, y2);
        });
      });
    });
    return isFinite(min) ? { min, max } : { min: 1988, max: 1998 };
  }

  function showToast(msg) {
    if (!el.toast) return;
    el.toastMsg.textContent = msg;
    el.toast.classList.add('visible');
    setTimeout(() => el.toast.classList.remove('visible'), 2800);
  }

  // Render Top KPI Metrics
  function renderMetrics() {
    const withData = TRIALS.filter(t => countRecords(t) > 0).length;
    const totalRecords = TRIALS.reduce((sum, t) => sum + countRecords(t), 0);
    const span = getYearSpan(TRIALS);

    if (el.metricTrials) el.metricTrials.textContent = TRIALS.length;
    if (el.metricActive) el.metricActive.textContent = withData;
    if (el.metricRecords) el.metricRecords.textContent = totalRecords;
    if (el.metricSpan) el.metricSpan.textContent = `${span.min} – ${span.max}`;
  }

  // Render Master Trial List (Figure 2 left pane)
  function renderMasterList() {
    if (!el.trialList) return;
    el.trialList.innerHTML = '';

    const query = filterQuery.toLowerCase().trim();
    const filtered = TRIALS.map((t, idx) => ({ t, idx })).filter(item => {
      if (!query) return true;
      return item.t.code.toLowerCase().includes(query) || (item.t.estate && item.t.estate.toLowerCase().includes(query));
    });

    if (el.trialCountBadge) {
      el.trialCountBadge.textContent = `${filtered.length} / ${TRIALS.length}`;
    }

    if (filtered.length === 0) {
      el.trialList.innerHTML = `<li style="padding: 24px 18px; text-align: center; color: var(--text-faint); font-size: 0.8rem;">No trials match "${filterQuery}"</li>`;
      return;
    }

    filtered.forEach(item => {
      const trial = item.t;
      const idx = item.idx;
      const hasData = countRecords(trial) > 0;
      const isSelected = idx === selectedIndex;

      const li = document.createElement('li');
      li.className = `trial-row ${isSelected ? 'selected' : ''}`;
      li.tabIndex = 0;
      li.dataset.index = idx;

      li.innerHTML = `
        <span class="trial-code">${trial.code}</span>
        <span class="trial-estate" title="${trial.estate || ''}">${trial.estate || '—'}${trial.truncated ? '...' : ''}</span>
        <span class="trial-dot ${hasData ? 'has-data' : ''}" title="${hasData ? 'Has recorded data' : 'No saved records'}"></span>
      `;

      li.addEventListener('click', () => selectTrial(idx));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectTrial(idx);
        }
      });

      el.trialList.appendChild(li);
    });
  }

  function selectTrial(idx) {
    selectedIndex = idx;
    renderMasterList();
    renderDetail();
  }

  // Render Detail Panel (Timeline & 5 Dataset Tables)
  function renderDetail() {
    if (!el.detailContainer) return;
    const trial = TRIALS[selectedIndex];
    if (!trial) return;

    const span = getYearSpan(TRIALS);
    const totalRecs = countRecords(trial);

    // Detail Header
    const isBase = trial.isBaseline || !trial.userId;
    const ownerText = isBase ? 'Shared PORIM Baseline' : (trial.createdByEmail || 'Private Experiment');
    const ownerColor = isBase ? '#15803d' : '#2563eb';

    let html = `
      <div class="detail-header">
        <div class="detail-title-group">
          <h3>
            <span>${trial.code}</span>
            <span style="font-weight: 400; color: var(--text-muted); font-size: 1rem;">· ${trial.estate || 'Unspecified Location'}</span>
          </h3>
          <p>Planting Year: <strong>${trial.plantingYear || '1988'}</strong> &nbsp;|&nbsp; Ownership: <strong style="color: ${ownerColor};">${ownerText}</strong></p>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="badge-tag">${totalRecs} Total Annual Records</span>
          <button type="button" class="btn" id="btn-export-trial" title="Export this trial dataset (.CSV)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export CSV
          </button>
        </div>
      </div>
    `;

    // Empty state if no data
    if (totalRecs === 0) {
      html += `
        <div class="empty-state-card">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h4>No Saved Records for ${trial.code}</h4>
          <p>
            No recording yield, FFB yield, leaf nutrients, vegetative measurements, or soil nutrients have been saved into the database files for this trial location yet.
          </p>
          <button type="button" class="btn btn-primary" id="btn-switch-dtp1">
            View Recorded Trial (DTP1)
          </button>
        </div>
      `;
      el.detailContainer.innerHTML = html;

      document.getElementById('btn-switch-dtp1')?.addEventListener('click', () => selectTrial(0));
      return;
    }

    // 1. Data Coverage Timeline (1988 - 1998)
    html += renderTimeline(trial, span);

    // 2. 5 Datasets Grid (Figure 2)
    html += `
      <div class="datasets-grid">
        ${DATASETS.map(ds => renderDatasetCard(trial, ds)).join('')}
      </div>
    `;

    el.detailContainer.innerHTML = html;

    // Attach export listener
    document.getElementById('btn-export-trial')?.addEventListener('click', () => exportTrialData(trial));
  }

  // Render 11-Year Timeline
  function renderTimeline(trial, span) {
    const years = [];
    for (let y = span.min; y <= span.max; y++) years.push(y);

    let gridCells = `<div></div>` + years.map(y => `<div class="timeline-year-label">'${String(y).slice(2)}</div>`).join('');

    DATASETS.forEach(ds => {
      const recs = trial[ds.key] || [];
      const activeYears = new Set(recs.map(r => yearOf(r, ds.kind)));

      gridCells += `<div class="timeline-row-name" style="--row-color: ${ds.color}">${ds.title}</div>`;

      years.forEach(y => {
        const isActive = activeYears.has(y);
        gridCells += `
          <div class="timeline-cell ${isActive ? 'active' : ''}" style="--row-color: ${ds.color}" title="${ds.title}: ${y} (${isActive ? 'Recorded' : 'No Record'})"></div>
        `;
      });
    });

    return `
      <div class="timeline-card">
        <div class="timeline-header">
          <span class="timeline-title">Data Coverage by Year</span>
          <span class="timeline-sub">${span.min} – ${span.max} · 11-Year Trial Timeline</span>
        </div>
        <div class="timeline-grid" style="--years: ${years.length}">
          ${gridCells}
        </div>
      </div>
    `;
  }

  // Render Single Dataset Card (Table)
  function renderDatasetCard(trial, ds) {
    const recs = trial[ds.key] || [];

    let tableContent = '';
    if (recs.length === 0) {
      tableContent = `<div class="dataset-empty-msg">No records saved</div>`;
    } else if (ds.kind === 'period') {
      tableContent = `
        <div class="dataset-table-wrap">
          <table class="dataset-table">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th style="text-align: right;">Duration</th>
              </tr>
            </thead>
            <tbody>
              ${recs.map(r => `
                <tr>
                  <td>${pad2(r.from.mn)} / ${r.from.yr}</td>
                  <td>${pad2(r.to.mn)} / ${r.to.yr}</td>
                  <td style="text-align: right; color: var(--text-muted);">12 mos</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      tableContent = `
        <div class="dataset-table-wrap">
          <table class="dataset-table">
            <thead>
              <tr>
                <th>Dy</th>
                <th>Mn</th>
                <th>Year</th>
                <th style="text-align: right;">Date</th>
              </tr>
            </thead>
            <tbody>
              ${recs.map(r => {
                const isDy0 = r.dy === 0;
                const isMn0 = r.mn === 0;
                const dateStr = (isDy0 && isMn0) ? `${r.yr}` : (isDy0 ? `${MONTHS[r.mn - 1]} ${r.yr}` : `${r.dy} ${MONTHS[r.mn - 1]} ${r.yr}`);
                return `
                  <tr>
                    <td class="${isDy0 ? 'dimmed' : ''}">${pad2(r.dy)}</td>
                    <td class="${isMn0 ? 'dimmed' : ''}">${pad2(r.mn)}</td>
                    <td>${r.yr}</td>
                    <td style="text-align: right; color: var(--text-muted); font-size: 0.74rem;">${dateStr}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    return `
      <div class="dataset-card">
        <div class="dataset-card-header">
          <span class="dataset-card-title">
            <span class="dataset-indicator" style="--card-color: ${ds.color};"></span>
            ${ds.title}
          </span>
          <span class="dataset-card-count">${recs.length} ${recs.length === 1 ? 'row' : 'rows'}</span>
        </div>
        ${tableContent}
      </div>
    `;
  }

  // Export Selected Trial Data to CSV ONLY
  function exportTrialData(trial) {
    let csv = 'TRIAL_CODE,ESTATE,PLANTING_YEAR,DATA_SERIES,PERIOD_OR_PARAM,FROM_OR_VALUE,TO_OR_REMARKS\n';

    (trial.recordingYield || []).forEach(r => {
      csv += `"${trial.code}","${trial.estate}",${trial.plantingYear || ''},"Yield Recording","Period","${r.from?.mn}/${r.from?.yr}","${r.to?.mn}/${r.to?.yr}"\n`;
    });

    (trial.ffbYield || []).forEach(r => {
      csv += `"${trial.code}","${trial.estate}",${trial.plantingYear || ''},"Annual FFB Yield","Period","${r.from?.mn}/${r.from?.yr}","${r.to?.mn}/${r.to?.yr}"\n`;
    });

    (trial.leafNutrients || []).forEach(r => {
      csv += `"${trial.code}","${trial.estate}",${trial.plantingYear || ''},"Leaf Nutrients","Sampling Date","${r.dy}/${r.mn}/${r.yr}","Frond 17"\n`;
    });

    (trial.vegetativeMeasurement || []).forEach(r => {
      csv += `"${trial.code}","${trial.estate}",${trial.plantingYear || ''},"Vegetative Sampling","Measurement Date","${r.dy}/${r.mn}/${r.yr}","Morphometrics"\n`;
    });

    (trial.soilNutrients || []).forEach(r => {
      csv += `"${trial.code}","${trial.estate}",${trial.plantingYear || ''},"Soil Nutrients","Analysis Date","${r.dy}/${r.mn}/${r.yr}","Chemical Profile"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `READA_${trial.code}_ANNUAL_DATA.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${trial.code} trial annual data to CSV`);
  }

  // Search input handler
  if (el.trialSearch) {
    el.trialSearch.addEventListener('input', (e) => {
      filterQuery = e.target.value;
      renderMasterList();
    });
  }

  // Global Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === el.trialSearch) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(TRIALS.length - 1, selectedIndex + 1);
      selectTrial(selectedIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(0, selectedIndex - 1);
      selectTrial(selectedIndex);
    }
  });

  // Init with Supabase synchronization
  async function init() {
    if (window.ReadaSync && typeof window.ReadaSync.fetchTrials === 'function') {
      try {
        const fetched = await window.ReadaSync.fetchTrials();
        if (fetched && fetched.length > 0) {
          TRIALS = fetched;
        }
      } catch (e) {
        console.warn('ReadaSync fetch error on init:', e);
      }
    }
    renderMetrics();
    renderMasterList();
    renderDetail();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Auto-refresh when user switches back to this tab
  window.addEventListener('focus', init);

})();
