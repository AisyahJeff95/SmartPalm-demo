/**
 * ReaDA - Relational Database for Agronomy Trial Data
 * Module 5: Annual Plot Data Controller (ANNUAL_P.WFM / ANN_DATA.WFM)
 * 
 * Features:
 * 1. Multi-disciplinary annual plot summaries:
 *    - FFB Yield (DATAFFB.DBF)
 *    - Palms Tissue Nutrients (DATALEAF.DBF)
 *    - Vegetative Morphometrics (DATAVM.DBF)
 *    - Soil Pedology & Chemistry (DATASOIL.DBF)
 * 2. All 10 PORIM manual procedures:
 *    - New Annual Data Entry (Screenshots 20 & 21)
 *    - Edit Annual Plot Data selection & in-place spreadsheet editor
 *    - View multi-disciplinary plot records
 *    - Print Annual Plot Data Report preview & printing
 *    - Create ASCII scientific data export (*.dat, *.prn)
 *    - Save DBF / CSV export (DATAFFB.CSV, etc.)
 *    - Make Trial BackUp archive (BCANN.DBF)
 *    - Read Data from BackUp archive
 *    - Read 'Non-ReaDA' dBase / CSV file (B:\ANNDAT95.DBF)
 *    - Safe delete with confirmation check
 * 3. Dynamic UI state management, calculations, filtering, and persistence
 */

(function () {
  'use strict';

  // State
  let trials = window.READA_TRIALS || [];
  let currentCode = localStorage.getItem('reada_active_trial') || 'DTP1';
  let activeCategory = 'ffb'; // 'ffb' | 'leaf' | 'veg' | 'soil'
  let activePlotFilter = 'all';
  let chartActiveMetric = 'ffb'; // 'ffb' | 'leaf' | 'veg' | 'soil'
  let isChartCollapsed = false;

  // Category Configuration & Labels
  const categoryConfig = {
    ffb: {
      name: 'Fresh Fruit Bunch (FFB) Yield',
      tableName: 'DATAFFB.DBF',
      badgeClass: 'badge-ffb',
      badgeLabel: 'DATAFFB',
      defaultPeriod: '03/1996 — 02/1997'
    },
    leaf: {
      name: 'Palms Tissue Nutrients',
      tableName: 'DATALEAF.DBF',
      badgeClass: 'badge-leaf',
      badgeLabel: 'DATALEAF',
      defaultPeriod: '10/09/1996'
    },
    veg: {
      name: 'Vegetative Measurements',
      tableName: 'DATAVM.DBF',
      badgeClass: 'badge-veg',
      badgeLabel: 'DATAVM',
      defaultPeriod: '22/07/1996'
    },
    soil: {
      name: 'Soil Nutrient Analysis',
      tableName: 'DATASOIL.DBF',
      badgeClass: 'badge-soil',
      badgeLabel: 'DATASOIL',
      defaultPeriod: '15/11/1996'
    }
  };

  // Shared Plot Grid Editor Working State
  let editorWorkingTrialCode = currentCode;
  let editorWorkingCategory = 'ffb';
  let editorWorkingRows = [];

  // Temporary selection state for New Annual Entry and Edit Selection dialogs
  let selectedTrialForNewEntry = currentCode;
  let selectedTrialForEdit = currentCode;

  // DOM Elements cache
  const el = {
    trialSelect: document.getElementById('select-working-trial'),
    btnUpdateCodeList: document.getElementById('btn-update-code-list'),
    statTrialCode: document.getElementById('stat-trial-code'),
    statEstate: document.getElementById('stat-estate'),
    statAnnualPeriod: document.getElementById('stat-annual-period'),
    statFfbYield: document.getElementById('stat-ffb-yield'),
    statLeafN: document.getElementById('stat-leaf-n'),
    statMeanLai: document.getElementById('stat-mean-lai'),
    activeSummaryTrial: document.getElementById('active-summary-trial'),
    activeSummaryPeriod: document.getElementById('active-summary-period'),
    summaryFilterPlot: document.getElementById('summary-filter-plot'),
    btnQuickEditCategory: document.getElementById('btn-quick-edit-category'),
    categoryTabBtns: document.querySelectorAll('.category-tab-btn'),
    tableSummary: document.getElementById('table-annual-summary'),
    theadSummary: document.getElementById('thead-annual-summary'),
    tbodySummary: document.getElementById('tbody-annual-summary'),
    tfootSummary: document.getElementById('tfoot-annual-summary'),
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toast-msg'),
    annualChartCard: document.getElementById('annual-chart-card'),
    chartTrialBadge: document.getElementById('chart-trial-badge'),
    chartPillBtns: document.querySelectorAll('.chart-pill-btn'),
    btnToggleChartCollapse: document.getElementById('btn-toggle-chart-collapse'),
    chartCollapseIcon: document.getElementById('chart-collapse-icon'),
    chartCollapseLabel: document.getElementById('chart-collapse-label'),
    annualChartKpiBar: document.getElementById('annual-chart-kpi-bar'),
    annualPlotSvg: document.getElementById('annual-plot-svg'),
    annualChartSvgContainer: document.getElementById('annual-chart-svg-container'),
    annualChartTooltip: document.getElementById('annual-chart-tooltip'),
    annualChartLegend: document.getElementById('annual-chart-legend')
  };

  // Modals cache
  const modals = {
    newEntry: document.getElementById('modal-new-annual-entry'),
    editSelection: document.getElementById('modal-edit-annual-selection'),
    gridEditor: document.getElementById('modal-plot-grid-editor'),
    print: document.getElementById('modal-print-annual'),
    createAscii: document.getElementById('modal-create-ascii'),
    saveDbf: document.getElementById('modal-save-annual-dbf'),
    makeBackup: document.getElementById('modal-make-backup'),
    readBackup: document.getElementById('modal-read-backup'),
    readNonReada: document.getElementById('modal-read-nonreada'),
    deleteData: document.getElementById('modal-delete-annual')
  };

  // ================= Helpers & Data Normalization =================

  function getCurrentTrial() {
    if (!trials || trials.length === 0) return null;
    let found = trials.find(t => t.code === currentCode);
    if (!found) found = trials[0];
    ensureTrialAnnualData(found);
    return found;
  }

  function getTrialByCode(code) {
    let t = trials.find(x => x.code === code);
    if (t) ensureTrialAnnualData(t);
    return t;
  }

  function getTrialDensity(trial, plotNo) {
    if (!trial) return 148;
    if (trial.densityType === 'constant' && trial.constantDensity) {
      return trial.constantDensity;
    }
    if (trial.plotTreatments && trial.plotTreatments.length > 0) {
      const pt = trial.plotTreatments.find(p => p.plot === plotNo);
      if (pt && pt.density) return pt.density;
    }
    return 148;
  }

  /**
   * Ensure annualPlotData exists with sensible agronomic defaults for all 4 categories
   */
  function ensureTrialAnnualData(trial) {
    if (!trial) return;

    // Load from localStorage if present
    const storageKey = 'reada_annual_plot_data_' + trial.code;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        trial.annualPlotData = JSON.parse(saved);
        return;
      }
    } catch (e) {
      console.warn('Could not load cached annual plot data', e);
    }

    if (!trial.annualPlotData) {
      trial.annualPlotData = {};
    }

    // Default plot count based on treatments, default 6 plots
    const plotCount = (trial.plotTreatments && trial.plotTreatments.length > 0) ? trial.plotTreatments.length : 6;
    const plots = [];
    for (let i = 1; i <= Math.min(plotCount, 12); i++) {
      plots.push(i);
    }

    // 1. DATAFFB
    if (!trial.annualPlotData.ffb || !Array.isArray(trial.annualPlotData.ffb)) {
      trial.annualPlotData.ffb = plots.map(p => {
        const bwt = Number((17.5 + (p * 0.45) % 3.5).toFixed(1));
        const nob = Number((14.2 + (p * 0.38) % 2.8).toFixed(1));
        const palms = 16;
        const palmYield = Number((bwt * nob).toFixed(1));
        const density = getTrialDensity(trial, p);
        const ffbYield = Number(((palmYield * density) / 1000).toFixed(1));
        const bwtTotal = Math.round(palmYield * palms);
        const bnoTotal = Math.round(nob * palms);
        return {
          rec: p,
          plot: p,
          palms: palms,
          bwt: bwt,
          nob: nob,
          palmYield: palmYield,
          ffbYield: ffbYield,
          bwtTotal: bwtTotal,
          bnoTotal: bnoTotal
        };
      });
    }

    // 2. DATALEAF
    if (!trial.annualPlotData.leaf || !Array.isArray(trial.annualPlotData.leaf)) {
      trial.annualPlotData.leaf = plots.map(p => {
        return {
          rec: p,
          plot: p,
          sampleType: 'Frond 17',
          n: Number((2.65 + (p * 0.05) % 0.35).toFixed(2)),
          p: Number((0.160 + (p * 0.003) % 0.025).toFixed(3)),
          k: Number((1.10 + (p * 0.04) % 0.28).toFixed(2)),
          ca: Number((0.50 + (p * 0.02) % 0.15).toFixed(2)),
          mg: Number((0.32 + (p * 0.015) % 0.12).toFixed(2)),
          s: Number((0.18 + (p * 0.008) % 0.05).toFixed(2)),
          cl: Number((0.52 + (p * 0.02) % 0.16).toFixed(2)),
          b: Number((15.5 + (p * 0.7) % 5.0).toFixed(1)),
          cu: Number((4.8 + (p * 0.2) % 1.2).toFixed(1)),
          zn: Number((15.0 + (p * 0.6) % 3.5).toFixed(1)),
          mn: Math.round(105 + (p * 6) % 40),
          fe: Math.round(72 + (p * 3) % 22)
        };
      });
    }

    // 3. DATAVM
    if (!trial.annualPlotData.veg || !Array.isArray(trial.annualPlotData.veg)) {
      trial.annualPlotData.veg = plots.map(p => {
        const rachisLen = Number((530.0 + (p * 7) % 50).toFixed(1));
        const petioleW = Number((5.0 + (p * 0.1) % 0.8).toFixed(1));
        const petioleD = Number((3.7 + (p * 0.08) % 0.5).toFixed(1));
        const petioleArea = Number((petioleW * petioleD).toFixed(2));
        const pinnae = Math.round(300 + (p * 4) % 30);
        const leafArea = Number(((2 * pinnae * 85 * 4.9 * 0.55) / 10000).toFixed(2));
        const fdw = Number((0.1023 * Math.pow(petioleArea, 0.749)).toFixed(2));
        const density = getTrialDensity(trial, p);
        const lai = Number(((leafArea * 40 * density) / 10000).toFixed(2));
        const trunkHt = Number((3.30 + (p * 0.12) % 0.8).toFixed(2));
        return {
          rec: p,
          plot: p,
          frond: 17,
          rachisLen: rachisLen,
          petioleW: petioleW,
          petioleD: petioleD,
          petioleArea: petioleArea,
          pinnae: pinnae,
          leafArea: leafArea,
          fdw: fdw,
          lai: lai,
          trunkHt: trunkHt
        };
      });
    }

    // 4. DATASOIL
    if (!trial.annualPlotData.soil || !Array.isArray(trial.annualPlotData.soil)) {
      trial.annualPlotData.soil = plots.map(p => {
        return {
          rec: p,
          plot: p,
          depth: '0-15 cm',
          ph: Number((4.20 + (p * 0.06) % 0.40).toFixed(2)),
          orgC: Number((1.35 + (p * 0.05) % 0.35).toFixed(2)),
          totalN: Number((0.12 + (p * 0.007) % 0.05).toFixed(2)),
          extrP: Number((16.0 + (p * 1.3) % 9.0).toFixed(1)),
          exchK: Number((0.24 + (p * 0.02) % 0.14).toFixed(2)),
          exchCa: Number((1.70 + (p * 0.1) % 0.7).toFixed(2)),
          exchMg: Number((0.36 + (p * 0.03) % 0.25).toFixed(2)),
          cec: Number((8.0 + (p * 0.4) % 2.6).toFixed(1))
        };
      });
    }
  }

  async function saveTrialAnnualData(trial) {
    if (!trial) return;
    try {
      const storageKey = 'reada_annual_plot_data_' + trial.code;
      localStorage.setItem(storageKey, JSON.stringify(trial.annualPlotData));
    } catch (e) {
      console.warn('Failed to save annual plot data to localStorage', e);
    }

    if (window.ReadaSync && trial.annualPlotData) {
      for (const [cat, rows] of Object.entries(trial.annualPlotData)) {
        if (Array.isArray(rows) && rows.length > 0) {
          window.ReadaSync.saveAnnualPlotData(trial.code, cat, 'ANNUAL', rows);
        }
      }
    }
  }

  function showToast(msg) {
    if (!el.toast || !el.toastMsg) return;
    el.toastMsg.textContent = msg;
    el.toast.classList.add('visible');
    setTimeout(() => {
      el.toast.classList.remove('visible');
    }, 2800);
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    const firstInput = modal.querySelector('input:not([readonly]):not([type="radio"]), button.btn-primary');
    if (firstInput) setTimeout(() => firstInput.focus(), 60);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function formatAverage(arr, prop, decimals = 1) {
    if (!arr || arr.length === 0) return '0.0';
    let sum = 0;
    let count = 0;
    arr.forEach(item => {
      const val = parseFloat(item[prop]);
      if (!isNaN(val)) {
        sum += val;
        count++;
      }
    });
    return count > 0 ? (sum / count).toFixed(decimals) : '0.0';
  }

  function formatSum(arr, prop) {
    if (!arr || arr.length === 0) return '0';
    let sum = 0;
    arr.forEach(item => {
      const val = parseFloat(item[prop]);
      if (!isNaN(val)) sum += val;
    });
    return Math.round(sum).toLocaleString();
  }

  // ================= UI Renderers =================

  function populateTrialDropdown() {
    if (!el.trialSelect) return;
    el.trialSelect.innerHTML = '';
    trials.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.code;
      opt.textContent = `${t.code} — ${t.estate} (${t.plantingYear || 'MPOB'})`;
      if (t.code === currentCode) opt.selected = true;
      el.trialSelect.appendChild(opt);
    });
  }

  function updateMetricsStrip() {
    const trial = getCurrentTrial();
    if (!trial) return;

    if (el.statTrialCode) el.statTrialCode.textContent = trial.code;
    if (el.statEstate) el.statEstate.textContent = trial.estate || '-';
    
    // Period text
    const period = categoryConfig[activeCategory] ? categoryConfig[activeCategory].defaultPeriod : '1996/1997';
    if (el.statAnnualPeriod) el.statAnnualPeriod.textContent = period;
    if (el.activeSummaryTrial) el.activeSummaryTrial.textContent = trial.code;
    if (el.activeSummaryPeriod) el.activeSummaryPeriod.textContent = period;

    // FFB mean
    const ffbRows = trial.annualPlotData.ffb || [];
    const meanFfb = formatAverage(ffbRows, 'ffbYield', 1);
    if (el.statFfbYield) el.statFfbYield.textContent = `${meanFfb} t/ha`;

    // Leaf N% mean
    const leafRows = trial.annualPlotData.leaf || [];
    const meanLeafN = formatAverage(leafRows, 'n', 2);
    if (el.statLeafN) el.statLeafN.textContent = `${meanLeafN}%`;

    // Veg LAI mean
    const vegRows = trial.annualPlotData.veg || [];
    const meanLai = formatAverage(vegRows, 'lai', 2);
    if (el.statMeanLai) el.statMeanLai.textContent = meanLai;

    // Backup & export scope labels
    const exportTrialLabel = document.getElementById('export-scope-trial');
    if (exportTrialLabel) exportTrialLabel.textContent = trial.code;

    const makeBackupTrialLabel = document.getElementById('make-backup-trial');
    if (makeBackupTrialLabel) makeBackupTrialLabel.textContent = trial.code;

    const totalRecords = (trial.annualPlotData.ffb?.length || 0) +
                         (trial.annualPlotData.leaf?.length || 0) +
                         (trial.annualPlotData.veg?.length || 0) +
                         (trial.annualPlotData.soil?.length || 0);
    const makeBackupRecordsLabel = document.getElementById('make-backup-records');
    if (makeBackupRecordsLabel) makeBackupRecordsLabel.textContent = `${totalRecords} Plot Records`;

    const deleteTrialLabel = document.getElementById('delete-annual-trial-label');
    if (deleteTrialLabel) deleteTrialLabel.textContent = trial.code;

    const deleteCatLabel = document.getElementById('delete-annual-cat-label');
    if (deleteCatLabel) deleteCatLabel.textContent = categoryConfig[activeCategory].name;
  }

  function populatePlotFilter() {
    if (!el.summaryFilterPlot) return;
    const trial = getCurrentTrial();
    const rows = trial.annualPlotData[activeCategory] || [];
    const currentVal = el.summaryFilterPlot.value;

    el.summaryFilterPlot.innerHTML = '<option value="all">All Plots</option>';
    rows.forEach(r => {
      const opt = document.createElement('option');
      opt.value = String(r.plot);
      opt.textContent = `Plot ${r.plot}`;
      if (String(r.plot) === currentVal) opt.selected = true;
      el.summaryFilterPlot.appendChild(opt);
    });
  }

  function renderSummaryTable() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const allRows = trial.annualPlotData[activeCategory] || [];
    const filteredRows = (activePlotFilter === 'all')
      ? allRows
      : allRows.filter(r => String(r.plot) === activePlotFilter);

    // 1. Render Header based on category
    if (activeCategory === 'ffb') {
      el.theadSummary.innerHTML = `
        <tr>
          <th style="width: 50px;">REC</th>
          <th style="width: 60px;">PLOT</th>
          <th style="text-align: right; width: 70px;">PALMS</th>
          <th style="text-align: right;">BWT (kg)</th>
          <th style="text-align: right;">NOB / PALM</th>
          <th style="text-align: right;">PALM YIELD (kg)</th>
          <th style="text-align: right; background-color: #f0fdf4; color: var(--brand-green);">FFB YIELD (t/ha)</th>
          <th style="text-align: right;">TOTAL BWT (kg)</th>
          <th style="text-align: right;">TOTAL BNO</th>
        </tr>
      `;
    } else if (activeCategory === 'leaf') {
      el.theadSummary.innerHTML = `
        <tr>
          <th style="width: 50px;">REC</th>
          <th style="width: 60px;">PLOT</th>
          <th>SAMPLE TYPE</th>
          <th style="text-align: right; background-color: #f0fdf4; color: #15803d;">N (%)</th>
          <th style="text-align: right;">P (%)</th>
          <th style="text-align: right;">K (%)</th>
          <th style="text-align: right;">Ca (%)</th>
          <th style="text-align: right;">Mg (%)</th>
          <th style="text-align: right;">S (%)</th>
          <th style="text-align: right;">Cl (%)</th>
          <th style="text-align: right;">B (ppm)</th>
          <th style="text-align: right;">Cu (ppm)</th>
          <th style="text-align: right;">Zn (ppm)</th>
          <th style="text-align: right;">Mn (ppm)</th>
          <th style="text-align: right;">Fe (ppm)</th>
        </tr>
      `;
    } else if (activeCategory === 'veg') {
      el.theadSummary.innerHTML = `
        <tr>
          <th style="width: 50px;">REC</th>
          <th style="width: 60px;">PLOT</th>
          <th style="text-align: center; width: 60px;">FROND</th>
          <th style="text-align: right;">RACHIS (cm)</th>
          <th style="text-align: right;">PET W (cm)</th>
          <th style="text-align: right;">PET D (cm)</th>
          <th style="text-align: right;">P x D (cm²)</th>
          <th style="text-align: right;">PINNAE</th>
          <th style="text-align: right;">LEAF AREA (m²)</th>
          <th style="text-align: right;">FDW (kg)</th>
          <th style="text-align: right; background-color: #f0fdf4; color: var(--brand-green);">CANOPY LAI</th>
          <th style="text-align: right;">TRUNK HT (m)</th>
        </tr>
      `;
    } else if (activeCategory === 'soil') {
      el.theadSummary.innerHTML = `
        <tr>
          <th style="width: 50px;">REC</th>
          <th style="width: 60px;">PLOT</th>
          <th>SAMPLING DEPTH</th>
          <th style="text-align: right; background-color: #fefce8; color: #a16207;">pH (H₂O)</th>
          <th style="text-align: right;">ORG C (%)</th>
          <th style="text-align: right;">TOTAL N (%)</th>
          <th style="text-align: right;">EXTR P (ppm)</th>
          <th style="text-align: right;">EXCH K (cmol)</th>
          <th style="text-align: right;">EXCH Ca (cmol)</th>
          <th style="text-align: right;">EXCH Mg (cmol)</th>
          <th style="text-align: right;">CEC (cmol)</th>
        </tr>
      `;
    }

    // 2. Render Body
    if (filteredRows.length === 0) {
      el.tbodySummary.innerHTML = `
        <tr>
          <td colspan="15" style="text-align: center; padding: 28px; color: var(--text-muted);">
            No annual plot records found for Trial ${trial.code} in this category.
          </td>
        </tr>
      `;
      el.tfootSummary.innerHTML = '';
      return;
    }

    let tbodyHtml = '';
    filteredRows.forEach((r, idx) => {
      const rec = r.rec || (idx + 1);
      if (activeCategory === 'ffb') {
        tbodyHtml += `
          <tr>
            <td>${rec}</td>
            <td style="font-weight: 700;">Plot ${r.plot}</td>
            <td style="text-align: right;">${r.palms || 16}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.bwt || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.nob || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.palmYield || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: #c2410c; background-color: #fff7ed;">${Number(r.ffbYield || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.bwtTotal || 0).toLocaleString()}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.bnoTotal || 0).toLocaleString()}</td>
          </tr>
        `;
      } else if (activeCategory === 'leaf') {
        tbodyHtml += `
          <tr>
            <td>${rec}</td>
            <td style="font-weight: 700;">Plot ${r.plot}</td>
            <td><span class="badge-tag" style="background: #f1f5f9; font-size: 0.72rem;">${r.sampleType || 'Frond 17'}</span></td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: #15803d; background-color: #f0fdf4;">${Number(r.n || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.p || 0).toFixed(3)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.k || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.ca || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.mg || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.s || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.cl || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.b || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.cu || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.zn || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Math.round(r.mn || 0)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Math.round(r.fe || 0)}</td>
          </tr>
        `;
      } else if (activeCategory === 'veg') {
        tbodyHtml += `
          <tr>
            <td>${rec}</td>
            <td style="font-weight: 700;">Plot ${r.plot}</td>
            <td style="text-align: center;"><span class="badge-tag" style="background: #f1f5f9; font-size: 0.72rem;">F${r.frond || 17}</span></td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.rachisLen || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.petioleW || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.petioleD || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.petioleArea || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Math.round(r.pinnae || 0)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.leafArea || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.fdw || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--brand-green); background-color: #f0fdf4;">${Number(r.lai || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.trunkHt || 0).toFixed(2)}</td>
          </tr>
        `;
      } else if (activeCategory === 'soil') {
        tbodyHtml += `
          <tr>
            <td>${rec}</td>
            <td style="font-weight: 700;">Plot ${r.plot}</td>
            <td><span class="badge-tag" style="background: #fefce8; color: #854d0e; font-size: 0.72rem;">${r.depth || '0-15 cm'}</span></td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: #a16207; background-color: #fefce8;">${Number(r.ph || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.orgC || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.totalN || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.extrP || 0).toFixed(1)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.exchK || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.exchCa || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${Number(r.exchMg || 0).toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 600;">${Number(r.cec || 0).toFixed(1)}</td>
          </tr>
        `;
      }
    });
    el.tbodySummary.innerHTML = tbodyHtml;

    // 3. Render Footer (Means / Totals)
    if (activeCategory === 'ffb') {
      const avgBwt = formatAverage(filteredRows, 'bwt', 1);
      const avgNob = formatAverage(filteredRows, 'nob', 1);
      const avgPalmYield = formatAverage(filteredRows, 'palmYield', 1);
      const avgFfbYield = formatAverage(filteredRows, 'ffbYield', 1);
      const totBwt = formatSum(filteredRows, 'bwtTotal');
      const totBno = formatSum(filteredRows, 'bnoTotal');

      el.tfootSummary.innerHTML = `
        <tr class="table-footer-stat">
          <td colspan="3" style="text-align: left; padding-left: 12px;">ANNUAL MEAN / TOTAL (${filteredRows.length} PLOTS)</td>
          <td style="text-align: right; font-family: var(--font-mono);">${avgBwt}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${avgNob}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${avgPalmYield}</td>
          <td style="text-align: right; font-family: var(--font-mono); color: #c2410c; background-color: #fff7ed;">${avgFfbYield}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${totBwt}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${totBno}</td>
        </tr>
      `;
    } else if (activeCategory === 'leaf') {
      el.tfootSummary.innerHTML = `
        <tr class="table-footer-stat">
          <td colspan="3" style="text-align: left; padding-left: 12px;">TISSUE MEAN (${filteredRows.length} PLOTS)</td>
          <td style="text-align: right; font-family: var(--font-mono); color: #15803d; background-color: #f0fdf4;">${formatAverage(filteredRows, 'n', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'p', 3)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'k', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'ca', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'mg', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 's', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'cl', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'b', 1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'cu', 1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'zn', 1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'mn', 0)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'fe', 0)}</td>
        </tr>
      `;
    } else if (activeCategory === 'veg') {
      el.tfootSummary.innerHTML = `
        <tr class="table-footer-stat">
          <td colspan="3" style="text-align: left; padding-left: 12px;">CANOPY MEAN (${filteredRows.length} PLOTS)</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'rachisLen', 1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'petioleW', 1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'petioleD', 1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'petioleArea', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'pinnae', 0)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'leafArea', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'fdw', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono); color: var(--brand-green); background-color: #f0fdf4;">${formatAverage(filteredRows, 'lai', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'trunkHt', 2)}</td>
        </tr>
      `;
    } else if (activeCategory === 'soil') {
      el.tfootSummary.innerHTML = `
        <tr class="table-footer-stat">
          <td colspan="3" style="text-align: left; padding-left: 12px;">SOIL MEAN (${filteredRows.length} PLOTS)</td>
          <td style="text-align: right; font-family: var(--font-mono); color: #a16207; background-color: #fefce8;">${formatAverage(filteredRows, 'ph', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'orgC', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'totalN', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'extrP', 1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'exchK', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'exchCa', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'exchMg', 2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${formatAverage(filteredRows, 'cec', 1)}</td>
        </tr>
      `;
    }
  }

  // ================= Annual Plot Performance Analytics & Visualization =================

  function showTooltip(e, html) {
    if (!el.annualChartTooltip || !el.annualChartSvgContainer) return;
    el.annualChartTooltip.innerHTML = html;
    moveTooltip(e);
    el.annualChartTooltip.style.display = 'block';
  }

  function moveTooltip(e) {
    if (!el.annualChartTooltip || !el.annualChartSvgContainer) return;
    const rect = el.annualChartSvgContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.annualChartTooltip.style.left = `${x}px`;
    el.annualChartTooltip.style.top = `${y}px`;
  }

  function hideTooltip() {
    if (el.annualChartTooltip) {
      el.annualChartTooltip.style.display = 'none';
    }
  }

  function renderAnnualChart() {
    const trial = getCurrentTrial();
    if (!trial) return;

    if (el.chartTrialBadge) {
      el.chartTrialBadge.textContent = trial.code;
    }

    if (!el.annualPlotSvg || !el.annualChartKpiBar) return;

    // Reset container contents
    el.annualPlotSvg.innerHTML = '';
    el.annualChartKpiBar.innerHTML = '';
    if (el.annualChartLegend) el.annualChartLegend.innerHTML = '';

    const width = 940;
    const height = 310;
    const padLeft = 55;
    const padRight = 125; // Dedicated right-margin zone for reference line badges
    const padTop = 32;
    const padBottom = 45;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    function createSvgElem(tag, attrs = {}) {
      const elem = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [k, v] of Object.entries(attrs)) {
        elem.setAttribute(k, v);
      }
      return elem;
    }

    // Gradients definition
    const defs = createSvgElem('defs');
    defs.innerHTML = `
      <linearGradient id="grad-bar-green" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#16a34a" />
        <stop offset="100%" stop-color="#15803d" />
      </linearGradient>
      <linearGradient id="grad-bar-amber" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#d97706" />
      </linearGradient>
      <linearGradient id="grad-bar-teal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#14b8a6" />
        <stop offset="100%" stop-color="#0f766e" />
      </linearGradient>
      <linearGradient id="grad-bar-blue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3b82f6" />
        <stop offset="100%" stop-color="#1d4ed8" />
      </linearGradient>
      <linearGradient id="grad-bar-soil" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#a16207" />
        <stop offset="100%" stop-color="#854d0e" />
      </linearGradient>
    `;
    el.annualPlotSvg.appendChild(defs);

    // Background panel
    const bgRect = createSvgElem('rect', {
      x: padLeft,
      y: padTop,
      width: plotW,
      height: plotH,
      fill: '#fcfdfd',
      rx: 4
    });
    el.annualPlotSvg.appendChild(bgRect);

    // Helper: Draw horizontal reference line with a dedicated right-margin badge (Zero overlap with bars/numbers)
    function drawRefLine(yVal, yMax, color, strokeWidth, dashArray, badgeText, badgeBg, badgeTextColor, badgeBorder) {
      if (yVal > yMax || yVal < 0) return;
      const yPos = padTop + plotH - (yVal / yMax) * plotH;

      // Dashed line across plot area
      const line = createSvgElem('line', {
        x1: padLeft,
        y1: yPos,
        x2: padLeft + plotW + 5,
        y2: yPos,
        stroke: color,
        'stroke-width': strokeWidth,
        'stroke-dasharray': dashArray
      });
      el.annualPlotSvg.appendChild(line);

      // Badge in right margin
      const badgeW = 110;
      const badgeH = 19;
      const badgeX = padLeft + plotW + 8;
      const badgeY = yPos - badgeH / 2;

      const pill = createSvgElem('rect', {
        x: badgeX,
        y: badgeY,
        width: badgeW,
        height: badgeH,
        rx: 4,
        fill: badgeBg,
        stroke: badgeBorder,
        'stroke-width': 1.1
      });
      el.annualPlotSvg.appendChild(pill);

      const txt = createSvgElem('text', {
        x: badgeX + badgeW / 2,
        y: yPos + 3.5,
        'text-anchor': 'middle',
        fill: badgeTextColor,
        'font-size': '10px',
        'font-weight': '700',
        'font-family': 'var(--font-sans)'
      });
      txt.textContent = badgeText;
      el.annualPlotSvg.appendChild(txt);
    }

    // Helper: Draw floating bar value badge with opaque background to prevent lines cutting through text
    function drawBarValueBadge(centerX, topY, valueText, textColor, strokeColor) {
      const badgeW = Math.max(34, String(valueText).length * 7.5 + 8);
      const badgeH = 16;
      const badgeX = centerX - badgeW / 2;
      const badgeY = topY - badgeH - 3;

      const pill = createSvgElem('rect', {
        x: badgeX,
        y: badgeY,
        width: badgeW,
        height: badgeH,
        rx: 3,
        fill: '#ffffff',
        stroke: strokeColor,
        'stroke-width': 0.9
      });
      el.annualPlotSvg.appendChild(pill);

      const txt = createSvgElem('text', {
        x: centerX,
        y: badgeY + 11.5,
        'text-anchor': 'middle',
        fill: textColor,
        'font-size': '10.5px',
        'font-weight': '700',
        'font-family': 'var(--font-mono)'
      });
      txt.textContent = valueText;
      el.annualPlotSvg.appendChild(txt);
    }

    if (chartActiveMetric === 'ffb') {
      const ffbData = trial.annualPlotData.ffb || [];
      if (ffbData.length === 0) return;

      const yields = ffbData.map(d => parseFloat(d.ffbYield) || 0);
      const meanYield = Number((yields.reduce((a, b) => a + b, 0) / yields.length).toFixed(1));
      let maxItem = ffbData[0];
      let minItem = ffbData[0];
      ffbData.forEach(d => {
        if ((parseFloat(d.ffbYield) || 0) > (parseFloat(maxItem.ffbYield) || 0)) maxItem = d;
        if ((parseFloat(d.ffbYield) || 0) < (parseFloat(minItem.ffbYield) || 0)) minItem = d;
      });

      const maxVal = Math.max(...yields, 50);
      const yMax = Math.ceil((maxVal * 1.18) / 10) * 10; // Extra headroom so bars never crowd ceiling
      const benchmark = 30.0;

      // KPI chips
      el.annualChartKpiBar.innerHTML = `
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Trial Mean FFB Yield</span>
          <span class="chart-kpi-val" style="color: var(--brand-green);">${meanYield} <span style="font-size: 0.72rem; font-weight: 500;">t/ha</span></span>
          <span class="chart-kpi-sub">Across ${ffbData.length} recording plots</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Top Performing Plot</span>
          <span class="chart-kpi-val" style="color: #15803d;">Plot ${maxItem.plot} · ${maxItem.ffbYield} <span style="font-size: 0.72rem; font-weight: 500;">t/ha</span></span>
          <span class="chart-kpi-sub">+${(((maxItem.ffbYield - meanYield) / meanYield) * 100).toFixed(1)}% vs trial mean</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Lowest Performing Plot</span>
          <span class="chart-kpi-val" style="color: #d97706;">Plot ${minItem.plot} · ${minItem.ffbYield} <span style="font-size: 0.72rem; font-weight: 500;">t/ha</span></span>
          <span class="chart-kpi-sub">${(((minItem.ffbYield - meanYield) / meanYield) * 100).toFixed(1)}% vs trial mean</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Commercial Benchmark</span>
          <span class="chart-kpi-val" style="color: var(--text);">${benchmark.toFixed(1)} <span style="font-size: 0.72rem; font-weight: 500;">t/ha</span></span>
          <span class="chart-kpi-sub">All plots exceeding standard</span>
        </div>
      `;

      // Y-axis grid
      for (let yVal = 0; yVal <= yMax; yVal += 10) {
        const yPos = padTop + plotH - (yVal / yMax) * plotH;
        const grid = createSvgElem('line', {
          x1: padLeft,
          y1: yPos,
          x2: padLeft + plotW,
          y2: yPos,
          stroke: '#e2e8f0',
          'stroke-dasharray': yVal === 0 ? 'none' : '3 3'
        });
        el.annualPlotSvg.appendChild(grid);

        const txt = createSvgElem('text', {
          x: padLeft - 10,
          y: yPos + 4,
          'text-anchor': 'end',
          fill: '#64748b',
          'font-size': '11px',
          'font-family': 'var(--font-mono)'
        });
        txt.textContent = yVal;
        el.annualPlotSvg.appendChild(txt);
      }

      // Draw reference lines with dedicated non-overlapping right margin badges
      drawRefLine(benchmark, yMax, '#f59e0b', 1.5, '5 4', `Target: ${benchmark} t/ha`, '#fffbeb', '#b45309', '#fde68a');
      drawRefLine(meanYield, yMax, '#16a34a', 2, '6 4', `Mean: ${meanYield} t/ha`, '#f0fdf4', '#15803d', '#bbf7d0');

      // Bars
      const n = ffbData.length;
      const slotW = plotW / n;
      const barW = Math.min(Math.max(slotW * 0.55, 24), 56);

      ffbData.forEach((d, idx) => {
        const yVal = parseFloat(d.ffbYield) || 0;
        const barH = (yVal / yMax) * plotH;
        const barX = padLeft + (idx * slotW) + (slotW - barW) / 2;
        const barY = padTop + plotH - barH;
        const isAboveMean = yVal >= meanYield;

        const rect = createSvgElem('rect', {
          x: barX,
          y: barY,
          width: barW,
          height: barH,
          fill: isAboveMean ? 'url(#grad-bar-green)' : 'url(#grad-bar-amber)',
          rx: 4,
          ry: 4,
          style: 'cursor: pointer; transition: opacity 0.15s ease;'
        });

        rect.addEventListener('mouseenter', (e) => {
          rect.style.opacity = '0.85';
          showTooltip(e, `
            <div class="chart-tooltip-title">Plot ${d.plot} · FFB Annual Yield</div>
            <div class="chart-tooltip-row"><span>FFB Yield:</span><strong>${d.ffbYield} t/ha</strong></div>
            <div class="chart-tooltip-row"><span>Bunch Weight (BWT):</span><strong>${d.bwt} kg</strong></div>
            <div class="chart-tooltip-row"><span>Bunch Number (NOB):</span><strong>${d.nob} b/p</strong></div>
            <div class="chart-tooltip-row"><span>Palm Yield:</span><strong>${d.palmYield} kg/palm</strong></div>
            <div class="chart-tooltip-row"><span>Density:</span><strong>${getTrialDensity(trial, d.plot)} palms/ha</strong></div>
          `);
        });
        rect.addEventListener('mousemove', moveTooltip);
        rect.addEventListener('mouseleave', () => {
          rect.style.opacity = '1';
          hideTooltip();
        });

        el.annualPlotSvg.appendChild(rect);

        // Value badge above bar (opaque white pill, fully visible)
        drawBarValueBadge(
          barX + barW / 2,
          barY,
          d.ffbYield,
          isAboveMean ? '#15803d' : '#b45309',
          isAboveMean ? '#bbf7d0' : '#fde68a'
        );

        // X label
        const xText = createSvgElem('text', {
          x: barX + barW / 2,
          y: padTop + plotH + 20,
          'text-anchor': 'middle',
          fill: '#334155',
          'font-size': '11px',
          'font-weight': '600'
        });
        xText.textContent = `Plot ${d.plot}`;
        el.annualPlotSvg.appendChild(xText);
      });

      // Legend
      el.annualChartLegend.innerHTML = `
        <div class="legend-item">
          <span class="legend-swatch" style="background: linear-gradient(135deg, #16a34a, #15803d);"></span>
          <span>Yield &ge; Mean (${meanYield} t/ha)</span>
        </div>
        <div class="legend-item">
          <span class="legend-swatch" style="background: linear-gradient(135deg, #f59e0b, #d97706);"></span>
          <span>Yield &lt; Mean</span>
        </div>
        <div class="legend-item">
          <span class="legend-line" style="border-color: #16a34a; border-width: 2px;"></span>
          <span>Trial Mean</span>
        </div>
        <div class="legend-item">
          <span class="legend-line" style="border-color: #f59e0b; border-width: 1.5px;"></span>
          <span>Commercial Target (30 t/ha)</span>
        </div>
      `;

    } else if (chartActiveMetric === 'leaf') {
      const leafData = trial.annualPlotData.leaf || [];
      if (leafData.length === 0) return;

      const meanN = formatAverage(leafData, 'n', 2);
      const meanK = formatAverage(leafData, 'k', 2);
      const meanP = formatAverage(leafData, 'p', 3);
      const meanMg = formatAverage(leafData, 'mg', 2);

      const yMax = 3.6; // Clean headroom above 2.91
      const critN = 2.60;
      const critK = 1.00;

      el.annualChartKpiBar.innerHTML = `
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Mean F17 Leaf Nitrogen</span>
          <span class="chart-kpi-val" style="color: #15803d;">${meanN}%</span>
          <span class="chart-kpi-sub">Critical threshold &ge; 2.60% (Optimal)</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Mean Foliar Potassium</span>
          <span class="chart-kpi-val" style="color: #2563eb;">${meanK}%</span>
          <span class="chart-kpi-sub">Critical threshold &ge; 1.00% (Adequate)</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Mean Foliar Phosphorus</span>
          <span class="chart-kpi-val" style="color: var(--text);">${meanP}%</span>
          <span class="chart-kpi-sub">Optimum: 0.150% — 0.180%</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Mean Foliar Magnesium</span>
          <span class="chart-kpi-val" style="color: #0d9488;">${meanMg}%</span>
          <span class="chart-kpi-sub">Optimum threshold &ge; 0.25%</span>
        </div>
      `;

      // Y-axis grid
      const steps = [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6];
      steps.forEach(yVal => {
        const yPos = padTop + plotH - (yVal / yMax) * plotH;
        const grid = createSvgElem('line', {
          x1: padLeft,
          y1: yPos,
          x2: padLeft + plotW,
          y2: yPos,
          stroke: '#e2e8f0',
          'stroke-dasharray': yVal === 0 ? 'none' : '3 3'
        });
        el.annualPlotSvg.appendChild(grid);

        const txt = createSvgElem('text', {
          x: padLeft - 10,
          y: yPos + 4,
          'text-anchor': 'end',
          fill: '#64748b',
          'font-size': '11px',
          'font-family': 'var(--font-mono)'
        });
        txt.textContent = yVal.toFixed(1) + '%';
        el.annualPlotSvg.appendChild(txt);
      });

      // Draw reference lines with dedicated non-overlapping right margin badges
      drawRefLine(critN, yMax, '#16a34a', 1.5, '5 4', `N Crit: 2.60%`, '#f0fdf4', '#15803d', '#bbf7d0');
      drawRefLine(critK, yMax, '#3b82f6', 1.5, '5 4', `K Crit: 1.00%`, '#eff6ff', '#1d4ed8', '#bfdbfe');

      // Grouped bars
      const n = leafData.length;
      const slotW = plotW / n;
      const barW = Math.min(slotW * 0.32, 24);

      leafData.forEach((d, idx) => {
        const nVal = parseFloat(d.n) || 0;
        const kVal = parseFloat(d.k) || 0;
        const nH = (nVal / yMax) * plotH;
        const kH = (kVal / yMax) * plotH;

        const slotCenter = padLeft + (idx * slotW) + slotW / 2;
        const nX = slotCenter - barW - 3;
        const kX = slotCenter + 3;
        const nY = padTop + plotH - nH;
        const kY = padTop + plotH - kH;

        const rectN = createSvgElem('rect', {
          x: nX,
          y: nY,
          width: barW,
          height: nH,
          fill: 'url(#grad-bar-green)',
          rx: 3,
          ry: 3,
          style: 'cursor: pointer;'
        });

        const rectK = createSvgElem('rect', {
          x: kX,
          y: kY,
          width: barW,
          height: kH,
          fill: 'url(#grad-bar-blue)',
          rx: 3,
          ry: 3,
          style: 'cursor: pointer;'
        });

        const showLeafTip = (e) => {
          showTooltip(e, `
            <div class="chart-tooltip-title">Plot ${d.plot} · Foliar Nutrients (Frond 17)</div>
            <div class="chart-tooltip-row"><span>Nitrogen (N):</span><strong>${d.n}%</strong></div>
            <div class="chart-tooltip-row"><span>Phosphorus (P):</span><strong>${d.p}%</strong></div>
            <div class="chart-tooltip-row"><span>Potassium (K):</span><strong>${d.k}%</strong></div>
            <div class="chart-tooltip-row"><span>Magnesium (Mg):</span><strong>${d.mg}%</strong></div>
            <div class="chart-tooltip-row"><span>Calcium (Ca):</span><strong>${d.ca}%</strong></div>
            <div class="chart-tooltip-row"><span>Boron (B):</span><strong>${d.b} ppm</strong></div>
          `);
        };

        [rectN, rectK].forEach(r => {
          r.addEventListener('mouseenter', showLeafTip);
          r.addEventListener('mousemove', moveTooltip);
          r.addEventListener('mouseleave', hideTooltip);
        });

        el.annualPlotSvg.appendChild(rectN);
        el.annualPlotSvg.appendChild(rectK);

        // Opaque value badges above each bar
        drawBarValueBadge(nX + barW / 2, nY, Number(d.n).toFixed(2), '#15803d', '#bbf7d0');
        drawBarValueBadge(kX + barW / 2, kY, Number(d.k).toFixed(2), '#1d4ed8', '#bfdbfe');

        // X label
        const xText = createSvgElem('text', {
          x: slotCenter,
          y: padTop + plotH + 20,
          'text-anchor': 'middle',
          fill: '#334155',
          'font-size': '11px',
          'font-weight': '600'
        });
        xText.textContent = `Plot ${d.plot}`;
        el.annualPlotSvg.appendChild(xText);
      });

      // Legend
      el.annualChartLegend.innerHTML = `
        <div class="legend-item">
          <span class="legend-swatch" style="background: linear-gradient(135deg, #16a34a, #15803d);"></span>
          <span>Leaf N% (Critical &ge; 2.60%)</span>
        </div>
        <div class="legend-item">
          <span class="legend-swatch" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8);"></span>
          <span>Leaf K% (Critical &ge; 1.00%)</span>
        </div>
        <div class="legend-item">
          <span class="legend-line" style="border-color: #16a34a; border-width: 1.5px;"></span>
          <span>N Critical (2.60%)</span>
        </div>
        <div class="legend-item">
          <span class="legend-line" style="border-color: #3b82f6; border-width: 1.5px;"></span>
          <span>K Critical (1.00%)</span>
        </div>
      `;

    } else if (chartActiveMetric === 'veg') {
      const vegData = trial.annualPlotData.veg || [];
      if (vegData.length === 0) return;

      const laiVals = vegData.map(d => parseFloat(d.lai) || 0);
      const meanLai = formatAverage(vegData, 'lai', 2);
      const meanFdw = formatAverage(vegData, 'fdw', 2);
      const meanArea = formatAverage(vegData, 'leafArea', 2);
      const meanRachis = formatAverage(vegData, 'rachisLen', 1);

      const maxLai = Math.max(...laiVals, 6.0);
      const yMax = Number((Math.ceil(maxLai) + 1.5).toFixed(1)); // e.g. 7.5 or 8.0, leaves clean space above 5.95
      const targetLai = 5.50;

      el.annualChartKpiBar.innerHTML = `
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Mean Canopy LAI</span>
          <span class="chart-kpi-val" style="color: #0d9488;">${meanLai}</span>
          <span class="chart-kpi-sub">Target: ~5.50 full interception</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Frond Dry Weight (FDW)</span>
          <span class="chart-kpi-val" style="color: var(--brand-green);">${meanFdw} <span style="font-size: 0.72rem; font-weight: 500;">kg</span></span>
          <span class="chart-kpi-sub">Mean petiole area biomass</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Individual Leaf Area</span>
          <span class="chart-kpi-val" style="color: var(--text);">${meanArea} <span style="font-size: 0.72rem; font-weight: 500;">m²</span></span>
          <span class="chart-kpi-sub">Calculated for Frond 17</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Mean Rachis Length</span>
          <span class="chart-kpi-val" style="color: var(--text);">${meanRachis} <span style="font-size: 0.72rem; font-weight: 500;">cm</span></span>
          <span class="chart-kpi-sub">Vigorous frond elongation</span>
        </div>
      `;

      // Y-axis grid
      const steps = [];
      for (let s = 0; s <= yMax; s += 1) steps.push(s);
      steps.forEach(yVal => {
        const yPos = padTop + plotH - (yVal / yMax) * plotH;
        const grid = createSvgElem('line', {
          x1: padLeft,
          y1: yPos,
          x2: padLeft + plotW,
          y2: yPos,
          stroke: '#e2e8f0',
          'stroke-dasharray': yVal === 0 ? 'none' : '3 3'
        });
        el.annualPlotSvg.appendChild(grid);

        const txt = createSvgElem('text', {
          x: padLeft - 10,
          y: yPos + 4,
          'text-anchor': 'end',
          fill: '#64748b',
          'font-size': '11px',
          'font-family': 'var(--font-mono)'
        });
        txt.textContent = yVal.toFixed(1);
        el.annualPlotSvg.appendChild(txt);
      });

      // Dedicated non-overlapping right margin badge for target LAI
      drawRefLine(targetLai, yMax, '#0d9488', 2, '5 4', `Target LAI: ${targetLai}`, '#f0fdfa', '#0f766e', '#99f6e4');

      // Bars
      const n = vegData.length;
      const slotW = plotW / n;
      const barW = Math.min(Math.max(slotW * 0.55, 24), 56);

      vegData.forEach((d, idx) => {
        const yVal = parseFloat(d.lai) || 0;
        const barH = (yVal / yMax) * plotH;
        const barX = padLeft + (idx * slotW) + (slotW - barW) / 2;
        const barY = padTop + plotH - barH;

        const rect = createSvgElem('rect', {
          x: barX,
          y: barY,
          width: barW,
          height: barH,
          fill: 'url(#grad-bar-teal)',
          rx: 4,
          ry: 4,
          style: 'cursor: pointer;'
        });

        rect.addEventListener('mouseenter', (e) => {
          rect.style.opacity = '0.85';
          showTooltip(e, `
            <div class="chart-tooltip-title">Plot ${d.plot} · Vegetative Morphometrics</div>
            <div class="chart-tooltip-row"><span>Canopy LAI:</span><strong>${d.lai}</strong></div>
            <div class="chart-tooltip-row"><span>Frond Dry Weight (FDW):</span><strong>${d.fdw} kg</strong></div>
            <div class="chart-tooltip-row"><span>Leaf Area:</span><strong>${d.leafArea} m²</strong></div>
            <div class="chart-tooltip-row"><span>Rachis Length:</span><strong>${d.rachisLen} cm</strong></div>
            <div class="chart-tooltip-row"><span>Petiole Area:</span><strong>${d.petioleArea} cm²</strong></div>
            <div class="chart-tooltip-row"><span>Pinnae Count:</span><strong>${d.pinnae}</strong></div>
          `);
        });
        rect.addEventListener('mousemove', moveTooltip);
        rect.addEventListener('mouseleave', () => {
          rect.style.opacity = '1';
          hideTooltip();
        });

        el.annualPlotSvg.appendChild(rect);

        // Opaque value badge above bar
        drawBarValueBadge(barX + barW / 2, barY, Number(d.lai).toFixed(2), '#0f766e', '#99f6e4');

        // X label
        const xText = createSvgElem('text', {
          x: barX + barW / 2,
          y: padTop + plotH + 20,
          'text-anchor': 'middle',
          fill: '#334155',
          'font-size': '11px',
          'font-weight': '600'
        });
        xText.textContent = `Plot ${d.plot}`;
        el.annualPlotSvg.appendChild(xText);
      });

      // Legend
      el.annualChartLegend.innerHTML = `
        <div class="legend-item">
          <span class="legend-swatch" style="background: linear-gradient(135deg, #14b8a6, #0f766e);"></span>
          <span>Canopy Leaf Area Index (LAI)</span>
        </div>
        <div class="legend-item">
          <span class="legend-line" style="border-color: #0d9488; border-width: 2px;"></span>
          <span>Optimal Commercial Canopy Target (5.50)</span>
        </div>
      `;

    } else if (chartActiveMetric === 'soil') {
      const soilData = trial.annualPlotData.soil || [];
      if (soilData.length === 0) return;

      const meanPh = formatAverage(soilData, 'ph', 2);
      const meanCec = formatAverage(soilData, 'cec', 1);
      const meanOrgC = formatAverage(soilData, 'orgC', 2);
      const meanExtrP = formatAverage(soilData, 'extrP', 1);

      const yMax = 6.0; // Plenty of headroom above pH 4.52

      el.annualChartKpiBar.innerHTML = `
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Mean Soil pH (H₂O)</span>
          <span class="chart-kpi-val" style="color: #854d0e;">${meanPh}</span>
          <span class="chart-kpi-sub">Typical mineral soil range: 4.2 — 5.0</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Cation Exchange Capacity (CEC)</span>
          <span class="chart-kpi-val" style="color: var(--brand-green);">${meanCec} <span style="font-size: 0.72rem; font-weight: 500;">cmol/kg</span></span>
          <span class="chart-kpi-sub">Nutrient retention buffer</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Organic Carbon (C)</span>
          <span class="chart-kpi-val" style="color: var(--text);">${meanOrgC}%</span>
          <span class="chart-kpi-sub">Surface topsoil (0-15 cm)</span>
        </div>
        <div class="chart-kpi-chip">
          <span class="chart-kpi-label">Extractable Phosphorus</span>
          <span class="chart-kpi-val" style="color: #ea580c;">${meanExtrP} <span style="font-size: 0.72rem; font-weight: 500;">ppm</span></span>
          <span class="chart-kpi-sub">Available P (Bray II)</span>
        </div>
      `;

      // Y-axis grid
      const steps = [0, 1, 2, 3, 4, 5, 6];
      steps.forEach(yVal => {
        const yPos = padTop + plotH - (yVal / yMax) * plotH;
        const grid = createSvgElem('line', {
          x1: padLeft,
          y1: yPos,
          x2: padLeft + plotW,
          y2: yPos,
          stroke: '#e2e8f0',
          'stroke-dasharray': yVal === 0 ? 'none' : '3 3'
        });
        el.annualPlotSvg.appendChild(grid);

        const txt = createSvgElem('text', {
          x: padLeft - 10,
          y: yPos + 4,
          'text-anchor': 'end',
          fill: '#64748b',
          'font-size': '11px',
          'font-family': 'var(--font-mono)'
        });
        txt.textContent = yVal.toFixed(1);
        el.annualPlotSvg.appendChild(txt);
      });

      // Dedicated non-overlapping right margin badge for Target pH
      drawRefLine(4.5, yMax, '#854d0e', 1.5, '5 4', `Target pH: 4.5`, '#fefce8', '#854d0e', '#fde68a');

      // Bars
      const n = soilData.length;
      const slotW = plotW / n;
      const barW = Math.min(Math.max(slotW * 0.55, 24), 56);

      soilData.forEach((d, idx) => {
        const yVal = parseFloat(d.ph) || 0;
        const barH = (yVal / yMax) * plotH;
        const barX = padLeft + (idx * slotW) + (slotW - barW) / 2;
        const barY = padTop + plotH - barH;

        const rect = createSvgElem('rect', {
          x: barX,
          y: barY,
          width: barW,
          height: barH,
          fill: 'url(#grad-bar-soil)',
          rx: 4,
          ry: 4,
          style: 'cursor: pointer;'
        });

        rect.addEventListener('mouseenter', (e) => {
          rect.style.opacity = '0.85';
          showTooltip(e, `
            <div class="chart-tooltip-title">Plot ${d.plot} · Soil Pedology (0-15 cm)</div>
            <div class="chart-tooltip-row"><span>Soil pH (H₂O):</span><strong>${d.ph}</strong></div>
            <div class="chart-tooltip-row"><span>CEC:</span><strong>${d.cec} cmol/kg</strong></div>
            <div class="chart-tooltip-row"><span>Organic Carbon:</span><strong>${d.orgC}%</strong></div>
            <div class="chart-tooltip-row"><span>Total Nitrogen:</span><strong>${d.totalN}%</strong></div>
            <div class="chart-tooltip-row"><span>Extractable P:</span><strong>${d.extrP} ppm</strong></div>
            <div class="chart-tooltip-row"><span>Exchangeable K:</span><strong>${d.exchK} cmol/kg</strong></div>
            <div class="chart-tooltip-row"><span>Exchangeable Mg:</span><strong>${d.exchMg} cmol/kg</strong></div>
          `);
        });
        rect.addEventListener('mousemove', moveTooltip);
        rect.addEventListener('mouseleave', () => {
          rect.style.opacity = '1';
          hideTooltip();
        });

        el.annualPlotSvg.appendChild(rect);

        // Opaque value badge above bar
        drawBarValueBadge(barX + barW / 2, barY, Number(d.ph).toFixed(2), '#854d0e', '#fde68a');

        // X label
        const xText = createSvgElem('text', {
          x: barX + barW / 2,
          y: padTop + plotH + 20,
          'text-anchor': 'middle',
          fill: '#334155',
          'font-size': '11px',
          'font-weight': '600'
        });
        xText.textContent = `Plot ${d.plot}`;
        el.annualPlotSvg.appendChild(xText);
      });

      // Legend
      el.annualChartLegend.innerHTML = `
        <div class="legend-item">
          <span class="legend-swatch" style="background: linear-gradient(135deg, #a16207, #854d0e);"></span>
          <span>Soil pH (H₂O)</span>
        </div>
        <div class="legend-item">
          <span class="legend-line" style="border-color: #854d0e; border-width: 1.5px;"></span>
          <span>Target Acid Soil pH (4.50)</span>
        </div>
      `;
    }
  }

  function renderAll() {
    updateMetricsStrip();
    populatePlotFilter();
    renderSummaryTable();
    renderAnnualChart();
  }

  // ================= Modal 1: New Annual Data Entry (Screenshots 20 & 21) =================

  function openNewAnnualEntryDialog() {
    selectedTrialForNewEntry = currentCode;
    const tbody = document.getElementById('new-entry-trials-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      trials.forEach(t => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        if (t.code === selectedTrialForNewEntry) {
          tr.style.backgroundColor = 'var(--brand-green-bg)';
          tr.style.fontWeight = '700';
        }
        tr.innerHTML = `
          <td><strong>${t.code}</strong></td>
          <td>${t.estate || '-'}</td>
          <td>${t.plantingYear || '-'}</td>
        `;
        tr.addEventListener('click', () => {
          selectedTrialForNewEntry = t.code;
          Array.from(tbody.querySelectorAll('tr')).forEach(row => {
            row.style.backgroundColor = '';
            row.style.fontWeight = '';
          });
          tr.style.backgroundColor = 'var(--brand-green-bg)';
          tr.style.fontWeight = '700';
        });
        tbody.appendChild(tr);
      });
    }

    // Reset radio selection to activeCategory or 'ffb'
    const radios = document.querySelectorAll('input[name="new-entry-cat"]');
    radios.forEach(r => {
      r.checked = (r.value === activeCategory);
    });
    updateNewEntryButtons();
    openModal(modals.newEntry);
  }

  function updateNewEntryButtons() {
    const selectedRadio = document.querySelector('input[name="new-entry-cat"]:checked');
    const cat = selectedRadio ? selectedRadio.value : 'ffb';

    const btnFfb = document.getElementById('btn-cont-ffb');
    const btnLeaf = document.getElementById('btn-cont-leaf');
    const btnVeg = document.getElementById('btn-cont-veg');
    const btnSoil = document.getElementById('btn-cont-soil');

    const updateBtn = (btn, isAct) => {
      if (!btn) return;
      btn.disabled = !isAct;
      if (isAct) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    };

    updateBtn(btnFfb, cat === 'ffb');
    updateBtn(btnLeaf, cat === 'leaf');
    updateBtn(btnVeg, cat === 'veg');
    updateBtn(btnSoil, cat === 'soil');
  }

  function handleContinueNewEntry(category) {
    closeModal(modals.newEntry);

    // Apply trial selection if changed
    currentCode = selectedTrialForNewEntry;
    localStorage.setItem('reada_active_trial', currentCode);
    populateTrialDropdown();

    // Read configured dates
    let periodText = '1996/1997';
    if (category === 'ffb') {
      const sMn = document.getElementById('new-ffb-start-mn')?.value || '3';
      const sYr = document.getElementById('new-ffb-start-yr')?.value || '1997';
      const eMn = document.getElementById('new-ffb-end-mn')?.value || '2';
      const eYr = document.getElementById('new-ffb-end-yr')?.value || '1998';
      periodText = `${String(sMn).padStart(2, '0')}/${sYr} — ${String(eMn).padStart(2, '0')}/${eYr}`;
    } else if (category === 'leaf') {
      const dy = document.getElementById('new-leaf-dy')?.value || '10';
      const mn = document.getElementById('new-leaf-mn')?.value || '9';
      const yr = document.getElementById('new-leaf-yr')?.value || '1997';
      periodText = `${String(dy).padStart(2, '0')}/${String(mn).padStart(2, '0')}/${yr}`;
    } else if (category === 'veg') {
      const dy = document.getElementById('new-veg-dy')?.value || '22';
      const mn = document.getElementById('new-veg-mn')?.value || '7';
      const yr = document.getElementById('new-veg-yr')?.value || '1997';
      periodText = `${String(dy).padStart(2, '0')}/${String(mn).padStart(2, '0')}/${yr}`;
    } else if (category === 'soil') {
      const dy = document.getElementById('new-soil-dy')?.value || '15';
      const mn = document.getElementById('new-soil-mn')?.value || '11';
      const yr = document.getElementById('new-soil-yr')?.value || '1997';
      periodText = `${String(dy).padStart(2, '0')}/${String(mn).padStart(2, '0')}/${yr}`;
    }

    // Set active category tab
    setCategoryTab(category);

    // Open plot grid editor for new entry
    openPlotGridEditor(currentCode, category, periodText, true);
  }

  // ================= Modal 2: Edit Annual Plot Data Selector =================

  function openEditSelectionDialog() {
    selectedTrialForEdit = currentCode;
    const tbody = document.getElementById('edit-selection-trials-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      trials.forEach(t => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        if (t.code === selectedTrialForEdit) {
          tr.style.backgroundColor = 'var(--brand-green-bg)';
          tr.style.fontWeight = '700';
        }
        tr.innerHTML = `
          <td><strong>${t.code}</strong></td>
          <td>${t.estate || '-'}</td>
        `;
        tr.addEventListener('click', () => {
          selectedTrialForEdit = t.code;
          Array.from(tbody.querySelectorAll('tr')).forEach(row => {
            row.style.backgroundColor = '';
            row.style.fontWeight = '';
          });
          tr.style.backgroundColor = 'var(--brand-green-bg)';
          tr.style.fontWeight = '700';
        });
        tbody.appendChild(tr);
      });
    }

    // Set category radio
    const radios = document.querySelectorAll('input[name="edit-cat-choice"]');
    radios.forEach(r => {
      r.checked = (r.value === activeCategory);
    });

    openModal(modals.editSelection);
  }

  function handleConfirmEditSelection() {
    closeModal(modals.editSelection);

    currentCode = selectedTrialForEdit;
    localStorage.setItem('reada_active_trial', currentCode);
    populateTrialDropdown();

    const selectedRadio = document.querySelector('input[name="edit-cat-choice"]:checked');
    const cat = selectedRadio ? selectedRadio.value : activeCategory;
    setCategoryTab(cat);

    openPlotGridEditor(currentCode, cat, categoryConfig[cat].defaultPeriod, false);
  }

  // ================= Modal 3: Shared In-Place Plot Grid Editor =================

  function openPlotGridEditor(trialCode, category, periodText, isNewEntry = false) {
    editorWorkingTrialCode = trialCode;
    editorWorkingCategory = category;

    const trial = getTrialByCode(trialCode);
    if (!trial) return;

    // Load clone of rows into memory
    const sourceRows = trial.annualPlotData[category] || [];
    editorWorkingRows = JSON.parse(JSON.stringify(sourceRows));

    // Update modal headers & badges
    const titleEl = document.getElementById('editor-modal-title');
    if (titleEl) {
      titleEl.textContent = isNewEntry ? 'New Annual Plot Data Entry' : 'Edit Annual Plot Data';
    }

    const badgeEl = document.getElementById('badge-editor-trial-cat');
    if (badgeEl) {
      badgeEl.textContent = `${trial.code} · ${categoryConfig[category].name}`;
    }

    const trialLabel = document.getElementById('editor-trial-label');
    if (trialLabel) trialLabel.textContent = `${trial.code} (${trial.estate || '-'})`;

    const catLabel = document.getElementById('editor-category-label');
    if (catLabel) catLabel.textContent = `${categoryConfig[category].name} [${categoryConfig[category].tableName}]`;

    const periodLabel = document.getElementById('editor-period-label');
    if (periodLabel) periodLabel.textContent = periodText || categoryConfig[category].defaultPeriod;

    renderEditorGrid();
    openModal(modals.gridEditor);
  }

  function renderEditorGrid() {
    const thead = document.getElementById('thead-plot-editor');
    const tbody = document.getElementById('tbody-plot-editor');
    if (!thead || !tbody) return;

    // Build thead based on category
    if (editorWorkingCategory === 'ffb') {
      thead.innerHTML = `
        <tr>
          <th style="width: 50px;">REC</th>
          <th style="width: 70px;">PLOT</th>
          <th style="width: 75px;">PALMS</th>
          <th style="width: 90px; text-align: right;">BWT (kg)</th>
          <th style="width: 90px; text-align: right;">NOB / PALM</th>
          <th style="width: 100px; text-align: right;">PALM YIELD</th>
          <th style="width: 100px; text-align: right;">FFB YIELD</th>
          <th style="width: 100px; text-align: right;">TOTAL BWT</th>
          <th style="width: 80px; text-align: right;">TOTAL BNO</th>
          <th style="width: 40px; text-align: center;">DEL</th>
        </tr>
      `;
    } else if (editorWorkingCategory === 'leaf') {
      thead.innerHTML = `
        <tr>
          <th style="width: 50px;">REC</th>
          <th style="width: 70px;">PLOT</th>
          <th style="width: 80px;">SAMPLE</th>
          <th style="width: 70px; text-align: right;">N (%)</th>
          <th style="width: 70px; text-align: right;">P (%)</th>
          <th style="width: 70px; text-align: right;">K (%)</th>
          <th style="width: 70px; text-align: right;">Ca (%)</th>
          <th style="width: 70px; text-align: right;">Mg (%)</th>
          <th style="width: 70px; text-align: right;">S (%)</th>
          <th style="width: 70px; text-align: right;">Cl (%)</th>
          <th style="width: 70px; text-align: right;">B (ppm)</th>
          <th style="width: 70px; text-align: right;">Cu (ppm)</th>
          <th style="width: 70px; text-align: right;">Zn (ppm)</th>
          <th style="width: 70px; text-align: right;">Mn (ppm)</th>
          <th style="width: 70px; text-align: right;">Fe (ppm)</th>
          <th style="width: 40px; text-align: center;">DEL</th>
        </tr>
      `;
    } else if (editorWorkingCategory === 'veg') {
      thead.innerHTML = `
        <tr>
          <th style="width: 50px;">REC</th>
          <th style="width: 70px;">PLOT</th>
          <th style="width: 60px; text-align: center;">FROND</th>
          <th style="width: 85px; text-align: right;">RACHIS (cm)</th>
          <th style="width: 80px; text-align: right;">PET W (cm)</th>
          <th style="width: 80px; text-align: right;">PET D (cm)</th>
          <th style="width: 85px; text-align: right;">P x D (cm²)</th>
          <th style="width: 80px; text-align: right;">PINNAE</th>
          <th style="width: 90px; text-align: right;">AREA (m²)</th>
          <th style="width: 80px; text-align: right;">FDW (kg)</th>
          <th style="width: 85px; text-align: right;">LAI</th>
          <th style="width: 85px; text-align: right;">TRUNK (m)</th>
          <th style="width: 40px; text-align: center;">DEL</th>
        </tr>
      `;
    } else if (editorWorkingCategory === 'soil') {
      thead.innerHTML = `
        <tr>
          <th style="width: 50px;">REC</th>
          <th style="width: 70px;">PLOT</th>
          <th style="width: 90px;">DEPTH</th>
          <th style="width: 80px; text-align: right;">pH (H₂O)</th>
          <th style="width: 80px; text-align: right;">ORG C (%)</th>
          <th style="width: 80px; text-align: right;">TOT N (%)</th>
          <th style="width: 85px; text-align: right;">EXTR P (ppm)</th>
          <th style="width: 85px; text-align: right;">EXCH K</th>
          <th style="width: 85px; text-align: right;">EXCH Ca</th>
          <th style="width: 85px; text-align: right;">EXCH Mg</th>
          <th style="width: 85px; text-align: right;">CEC</th>
          <th style="width: 40px; text-align: center;">DEL</th>
        </tr>
      `;
    }

    // Build tbody
    if (editorWorkingRows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="16" style="text-align: center; padding: 24px; color: var(--text-muted);">
            No plot rows in this dataset. Click "Add Plot Row" above to enter records.
          </td>
        </tr>
      `;
      return;
    }

    let tbodyHtml = '';
    editorWorkingRows.forEach((r, idx) => {
      const rec = idx + 1;
      r.rec = rec;

      if (editorWorkingCategory === 'ffb') {
        tbodyHtml += `
          <tr data-row-idx="${idx}">
            <td>${rec}</td>
            <td><input type="number" class="annual-input-cell" style="width: 55px;" data-field="plot" value="${r.plot || rec}"></td>
            <td><input type="number" class="annual-input-cell" style="width: 55px;" data-field="palms" value="${r.palms || 16}"></td>
            <td><input type="number" step="0.1" class="annual-input-cell" data-field="bwt" value="${Number(r.bwt || 0).toFixed(1)}"></td>
            <td><input type="number" step="0.1" class="annual-input-cell" data-field="nob" value="${Number(r.nob || 0).toFixed(1)}"></td>
            <td class="summary-calc-col" data-calc="palmYield">${Number(r.palmYield || 0).toFixed(1)}</td>
            <td class="summary-calc-col highlight-col" data-calc="ffbYield">${Number(r.ffbYield || 0).toFixed(1)}</td>
            <td class="summary-calc-col" data-calc="bwtTotal">${Math.round(r.bwtTotal || 0)}</td>
            <td class="summary-calc-col" data-calc="bnoTotal">${Math.round(r.bnoTotal || 0)}</td>
            <td style="text-align: center;">
              <button type="button" class="btn-delete-row" data-del-idx="${idx}" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 2px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </td>
          </tr>
        `;
      } else if (editorWorkingCategory === 'leaf') {
        tbodyHtml += `
          <tr data-row-idx="${idx}">
            <td>${rec}</td>
            <td><input type="number" class="annual-input-cell" style="width: 55px;" data-field="plot" value="${r.plot || rec}"></td>
            <td><input type="text" class="annual-input-cell" style="width: 75px; text-align: left;" data-field="sampleType" value="${r.sampleType || 'Frond 17'}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="n" value="${Number(r.n || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.001" class="annual-input-cell" data-field="p" value="${Number(r.p || 0).toFixed(3)}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="k" value="${Number(r.k || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="ca" value="${Number(r.ca || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="mg" value="${Number(r.mg || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="s" value="${Number(r.s || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="cl" value="${Number(r.cl || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.1" class="annual-input-cell" data-field="b" value="${Number(r.b || 0).toFixed(1)}"></td>
            <td><input type="number" step="0.1" class="annual-input-cell" data-field="cu" value="${Number(r.cu || 0).toFixed(1)}"></td>
            <td><input type="number" step="0.1" class="annual-input-cell" data-field="zn" value="${Number(r.zn || 0).toFixed(1)}"></td>
            <td><input type="number" step="1" class="annual-input-cell" data-field="mn" value="${Math.round(r.mn || 0)}"></td>
            <td><input type="number" step="1" class="annual-input-cell" data-field="fe" value="${Math.round(r.fe || 0)}"></td>
            <td style="text-align: center;">
              <button type="button" class="btn-delete-row" data-del-idx="${idx}" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 2px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </td>
          </tr>
        `;
      } else if (editorWorkingCategory === 'veg') {
        tbodyHtml += `
          <tr data-row-idx="${idx}">
            <td>${rec}</td>
            <td><input type="number" class="annual-input-cell" style="width: 55px;" data-field="plot" value="${r.plot || rec}"></td>
            <td><input type="number" class="annual-input-cell" style="width: 50px; text-align: center;" data-field="frond" value="${r.frond || 17}"></td>
            <td><input type="number" step="0.1" class="annual-input-cell" data-field="rachisLen" value="${Number(r.rachisLen || 0).toFixed(1)}"></td>
            <td><input type="number" step="0.1" class="annual-input-cell" data-field="petioleW" value="${Number(r.petioleW || 0).toFixed(1)}"></td>
            <td><input type="number" step="0.1" class="annual-input-cell" data-field="petioleD" value="${Number(r.petioleD || 0).toFixed(1)}"></td>
            <td class="summary-calc-col" data-calc="petioleArea">${Number(r.petioleArea || 0).toFixed(2)}</td>
            <td><input type="number" step="1" class="annual-input-cell" data-field="pinnae" value="${Math.round(r.pinnae || 310)}"></td>
            <td class="summary-calc-col" data-calc="leafArea">${Number(r.leafArea || 0).toFixed(2)}</td>
            <td class="summary-calc-col" data-calc="fdw">${Number(r.fdw || 0).toFixed(2)}</td>
            <td class="summary-calc-col highlight-col" data-calc="lai">${Number(r.lai || 0).toFixed(2)}</td>
            <td><input type="number" step="0.05" class="annual-input-cell" data-field="trunkHt" value="${Number(r.trunkHt || 0).toFixed(2)}"></td>
            <td style="text-align: center;">
              <button type="button" class="btn-delete-row" data-del-idx="${idx}" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 2px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </td>
          </tr>
        `;
      } else if (editorWorkingCategory === 'soil') {
        tbodyHtml += `
          <tr data-row-idx="${idx}">
            <td>${rec}</td>
            <td><input type="number" class="annual-input-cell" style="width: 55px;" data-field="plot" value="${r.plot || rec}"></td>
            <td><input type="text" class="annual-input-cell" style="width: 80px; text-align: left;" data-field="depth" value="${r.depth || '0-15 cm'}"></td>
            <td><input type="number" step="0.05" class="annual-input-cell" data-field="ph" value="${Number(r.ph || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="orgC" value="${Number(r.orgC || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="totalN" value="${Number(r.totalN || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.1" class="annual-input-cell" data-field="extrP" value="${Number(r.extrP || 0).toFixed(1)}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="exchK" value="${Number(r.exchK || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="exchCa" value="${Number(r.exchCa || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.01" class="annual-input-cell" data-field="exchMg" value="${Number(r.exchMg || 0).toFixed(2)}"></td>
            <td><input type="number" step="0.1" class="annual-input-cell" data-field="cec" value="${Number(r.cec || 0).toFixed(1)}"></td>
            <td style="text-align: center;">
              <button type="button" class="btn-delete-row" data-del-idx="${idx}" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 2px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </td>
          </tr>
        `;
      }
    });

    tbody.innerHTML = tbodyHtml;

    // Attach row delete handlers
    tbody.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-del-idx'), 10);
        syncEditorInputsToMemory();
        editorWorkingRows.splice(idx, 1);
        renderEditorGrid();
      });
    });

    // Attach input change handlers for real-time recalculation
    tbody.querySelectorAll('input.annual-input-cell').forEach(inp => {
      inp.addEventListener('input', () => {
        recalculateEditorRow(inp.closest('tr'));
      });
    });
  }

  function syncEditorInputsToMemory() {
    const tbody = document.getElementById('tbody-plot-editor');
    if (!tbody) return;
    const trs = tbody.querySelectorAll('tr[data-row-idx]');
    trs.forEach(tr => {
      const idx = parseInt(tr.getAttribute('data-row-idx'), 10);
      if (editorWorkingRows[idx]) {
        const inputs = tr.querySelectorAll('input[data-field]');
        inputs.forEach(inp => {
          const field = inp.getAttribute('data-field');
          const val = inp.value.trim();
          if (field === 'sampleType' || field === 'depth') {
            editorWorkingRows[idx][field] = val;
          } else {
            editorWorkingRows[idx][field] = parseFloat(val) || 0;
          }
        });
      }
    });
  }

  function recalculateEditorRow(tr) {
    if (!tr) return;
    const trial = getTrialByCode(editorWorkingTrialCode);

    if (editorWorkingCategory === 'ffb') {
      const plot = parseInt(tr.querySelector('input[data-field="plot"]')?.value || '1', 10);
      const palms = parseFloat(tr.querySelector('input[data-field="palms"]')?.value || '16') || 16;
      const bwt = parseFloat(tr.querySelector('input[data-field="bwt"]')?.value || '0') || 0;
      const nob = parseFloat(tr.querySelector('input[data-field="nob"]')?.value || '0') || 0;

      const palmYield = bwt * nob;
      const density = getTrialDensity(trial, plot);
      const ffbYield = (palmYield * density) / 1000;
      const bwtTotal = Math.round(palmYield * palms);
      const bnoTotal = Math.round(nob * palms);

      const cellPalmYield = tr.querySelector('[data-calc="palmYield"]');
      const cellFfbYield = tr.querySelector('[data-calc="ffbYield"]');
      const cellBwtTotal = tr.querySelector('[data-calc="bwtTotal"]');
      const cellBnoTotal = tr.querySelector('[data-calc="bnoTotal"]');

      if (cellPalmYield) cellPalmYield.textContent = palmYield.toFixed(1);
      if (cellFfbYield) cellFfbYield.textContent = ffbYield.toFixed(1);
      if (cellBwtTotal) cellBwtTotal.textContent = bwtTotal.toLocaleString();
      if (cellBnoTotal) cellBnoTotal.textContent = bnoTotal.toLocaleString();

    } else if (editorWorkingCategory === 'veg') {
      const plot = parseInt(tr.querySelector('input[data-field="plot"]')?.value || '1', 10);
      const petW = parseFloat(tr.querySelector('input[data-field="petioleW"]')?.value || '0') || 0;
      const petD = parseFloat(tr.querySelector('input[data-field="petioleD"]')?.value || '0') || 0;
      const pinnae = parseFloat(tr.querySelector('input[data-field="pinnae"]')?.value || '0') || 0;

      const petArea = petW * petD;
      const leafArea = (2 * pinnae * 85 * 4.9 * 0.55) / 10000;
      const fdw = 0.1023 * Math.pow(petArea, 0.749);
      const density = getTrialDensity(trial, plot);
      const lai = (leafArea * 40 * density) / 10000;

      const cellPetArea = tr.querySelector('[data-calc="petioleArea"]');
      const cellLeafArea = tr.querySelector('[data-calc="leafArea"]');
      const cellFdw = tr.querySelector('[data-calc="fdw"]');
      const cellLai = tr.querySelector('[data-calc="lai"]');

      if (cellPetArea) cellPetArea.textContent = petArea.toFixed(2);
      if (cellLeafArea) cellLeafArea.textContent = leafArea.toFixed(2);
      if (cellFdw) cellFdw.textContent = fdw.toFixed(2);
      if (cellLai) cellLai.textContent = lai.toFixed(2);
    }
  }

  function handleAddPlotRow() {
    syncEditorInputsToMemory();
    const nextPlot = editorWorkingRows.length > 0
      ? Math.max(...editorWorkingRows.map(r => r.plot || 0)) + 1
      : 1;

    const trial = getTrialByCode(editorWorkingTrialCode);

    let newRow = {};
    if (editorWorkingCategory === 'ffb') {
      newRow = {
        rec: editorWorkingRows.length + 1,
        plot: nextPlot,
        palms: 16,
        bwt: 18.0,
        nob: 15.0,
        palmYield: 270.0,
        ffbYield: Number(((270.0 * getTrialDensity(trial, nextPlot)) / 1000).toFixed(1)),
        bwtTotal: 4320,
        bnoTotal: 240
      };
    } else if (editorWorkingCategory === 'leaf') {
      newRow = {
        rec: editorWorkingRows.length + 1,
        plot: nextPlot,
        sampleType: 'Frond 17',
        n: 2.70, p: 0.165, k: 1.15, ca: 0.52, mg: 0.35, s: 0.19, cl: 0.55,
        b: 16.5, cu: 5.0, zn: 16.0, mn: 115, fe: 80
      };
    } else if (editorWorkingCategory === 'veg') {
      newRow = {
        rec: editorWorkingRows.length + 1,
        plot: nextPlot,
        frond: 17,
        rachisLen: 540.0,
        petioleW: 5.2,
        petioleD: 3.8,
        petioleArea: 19.76,
        pinnae: 310,
        leafArea: 9.10,
        fdw: 0.96,
        lai: 5.40,
        trunkHt: 3.50
      };
    } else if (editorWorkingCategory === 'soil') {
      newRow = {
        rec: editorWorkingRows.length + 1,
        plot: nextPlot,
        depth: '0-15 cm',
        ph: 4.30, orgC: 1.45, totalN: 0.13, extrP: 18.0,
        exchK: 0.28, exchCa: 1.90, exchMg: 0.42, cec: 8.5
      };
    }

    editorWorkingRows.push(newRow);
    renderEditorGrid();
  }

  function handleRecalculateAllEditorRows() {
    syncEditorInputsToMemory();
    const trial = getTrialByCode(editorWorkingTrialCode);

    editorWorkingRows.forEach(r => {
      const density = getTrialDensity(trial, r.plot);
      if (editorWorkingCategory === 'ffb') {
        r.palmYield = Number(((r.bwt || 0) * (r.nob || 0)).toFixed(1));
        r.ffbYield = Number(((r.palmYield * density) / 1000).toFixed(1));
        r.bwtTotal = Math.round(r.palmYield * (r.palms || 16));
        r.bnoTotal = Math.round((r.nob || 0) * (r.palms || 16));
      } else if (editorWorkingCategory === 'veg') {
        r.petioleArea = Number(((r.petioleW || 0) * (r.petioleD || 0)).toFixed(2));
        r.leafArea = Number(((2 * (r.pinnae || 0) * 85 * 4.9 * 0.55) / 10000).toFixed(2));
        r.fdw = Number((0.1023 * Math.pow(r.petioleArea, 0.749)).toFixed(2));
        r.lai = Number(((r.leafArea * 40 * density) / 10000).toFixed(2));
      }
    });

    renderEditorGrid();
    showToast('Biometric and yield formulas recalculated across all plots.');
  }

  function handleSavePlotEditor() {
    syncEditorInputsToMemory();
    const trial = getTrialByCode(editorWorkingTrialCode);
    if (!trial) return;

    // Run final recalculation
    handleRecalculateAllEditorRows();

    // Commit to trial data structure
    trial.annualPlotData[editorWorkingCategory] = JSON.parse(JSON.stringify(editorWorkingRows));
    saveTrialAnnualData(trial);

    closeModal(modals.gridEditor);

    // Refresh view
    if (editorWorkingTrialCode === currentCode) {
      renderAll();
    }

    showToast(`Saved ${editorWorkingRows.length} plot records to ${categoryConfig[editorWorkingCategory].tableName}`);
  }

  // ================= Modal 4: Printable Annual Report =================

  function openPrintAnnualReport() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const printTrialCode = document.getElementById('print-trial-code');
    const printEstate = document.getElementById('print-estate');
    const printPeriod = document.getElementById('print-period');
    const printGen = document.getElementById('print-generated-on');

    if (printTrialCode) printTrialCode.textContent = trial.code;
    if (printEstate) printEstate.textContent = trial.estate || '-';
    if (printPeriod) printPeriod.textContent = categoryConfig[activeCategory].defaultPeriod;
    
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    if (printGen) printGen.textContent = `Generated: ${dateStr}`;

    // KPI Badges
    const ffbRows = trial.annualPlotData.ffb || [];
    const leafRows = trial.annualPlotData.leaf || [];
    const vegRows = trial.annualPlotData.veg || [];
    const soilRows = trial.annualPlotData.soil || [];

    const printStatFfb = document.getElementById('print-stat-ffb');
    const printStatLeafN = document.getElementById('print-stat-leaf-n');
    const printStatLai = document.getElementById('print-stat-lai');
    const printStatPh = document.getElementById('print-stat-ph');

    if (printStatFfb) printStatFfb.textContent = `${formatAverage(ffbRows, 'ffbYield', 1)} t/ha`;
    if (printStatLeafN) printStatLeafN.textContent = `${formatAverage(leafRows, 'n', 2)}%`;
    if (printStatLai) printStatLai.textContent = formatAverage(vegRows, 'lai', 2);
    if (printStatPh) printStatPh.textContent = formatAverage(soilRows, 'ph', 2);

    // Title
    const titleEl = document.getElementById('print-table-title');
    if (titleEl) {
      titleEl.textContent = `${categoryConfig[activeCategory].name} Plot Summary (${categoryConfig[activeCategory].tableName})`;
    }

    // Table Header & Rows
    const thead = document.getElementById('thead-print-table');
    const tbody = document.getElementById('tbody-print-table');

    if (thead && tbody) {
      if (activeCategory === 'ffb') {
        thead.innerHTML = `
          <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 6px; text-align: left;">PLOT</th>
            <th style="padding: 6px; text-align: right;">PALMS</th>
            <th style="padding: 6px; text-align: right;">BWT (kg)</th>
            <th style="padding: 6px; text-align: right;">NOB / PALM</th>
            <th style="padding: 6px; text-align: right;">PALM YIELD (kg)</th>
            <th style="padding: 6px; text-align: right;">FFB YIELD (t/ha)</th>
            <th style="padding: 6px; text-align: right;">TOTAL BWT (kg)</th>
            <th style="padding: 6px; text-align: right;">TOTAL BNO</th>
          </tr>
        `;
        let html = '';
        ffbRows.forEach(r => {
          html += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px; font-weight: 700;">Plot ${r.plot}</td>
              <td style="padding: 6px; text-align: right;">${r.palms}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.bwt).toFixed(1)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.nob).toFixed(1)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.palmYield).toFixed(1)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace; font-weight: 700; color: #c2410c;">${Number(r.ffbYield).toFixed(1)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.bwtTotal).toLocaleString()}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.bnoTotal).toLocaleString()}</td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      } else if (activeCategory === 'leaf') {
        thead.innerHTML = `
          <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 6px; text-align: left;">PLOT</th>
            <th style="padding: 6px; text-align: left;">SAMPLE</th>
            <th style="padding: 6px; text-align: right;">N (%)</th>
            <th style="padding: 6px; text-align: right;">P (%)</th>
            <th style="padding: 6px; text-align: right;">K (%)</th>
            <th style="padding: 6px; text-align: right;">Ca (%)</th>
            <th style="padding: 6px; text-align: right;">Mg (%)</th>
            <th style="padding: 6px; text-align: right;">Cl (%)</th>
            <th style="padding: 6px; text-align: right;">B (ppm)</th>
            <th style="padding: 6px; text-align: right;">Cu (ppm)</th>
            <th style="padding: 6px; text-align: right;">Zn (ppm)</th>
          </tr>
        `;
        let html = '';
        leafRows.forEach(r => {
          html += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px; font-weight: 700;">Plot ${r.plot}</td>
              <td style="padding: 6px;">${r.sampleType}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace; font-weight: 700; color: #15803d;">${Number(r.n).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.p).toFixed(3)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.k).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.ca).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.mg).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.cl).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.b).toFixed(1)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.cu).toFixed(1)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.zn).toFixed(1)}</td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      } else if (activeCategory === 'veg') {
        thead.innerHTML = `
          <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 6px; text-align: left;">PLOT</th>
            <th style="padding: 6px; text-align: center;">FROND</th>
            <th style="padding: 6px; text-align: right;">RACHIS (cm)</th>
            <th style="padding: 6px; text-align: right;">PET W (cm)</th>
            <th style="padding: 6px; text-align: right;">PET D (cm)</th>
            <th style="padding: 6px; text-align: right;">P x D (cm²)</th>
            <th style="padding: 6px; text-align: right;">PINNAE</th>
            <th style="padding: 6px; text-align: right;">AREA (m²)</th>
            <th style="padding: 6px; text-align: right;">FDW (kg)</th>
            <th style="padding: 6px; text-align: right;">LAI</th>
            <th style="padding: 6px; text-align: right;">TRUNK (m)</th>
          </tr>
        `;
        let html = '';
        vegRows.forEach(r => {
          html += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px; font-weight: 700;">Plot ${r.plot}</td>
              <td style="padding: 6px; text-align: center;">F${r.frond}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.rachisLen).toFixed(1)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.petioleW).toFixed(1)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.petioleD).toFixed(1)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.petioleArea).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${r.pinnae}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.leafArea).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.fdw).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace; font-weight: 700; color: #166534;">${Number(r.lai).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.trunkHt).toFixed(2)}</td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      } else if (activeCategory === 'soil') {
        thead.innerHTML = `
          <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 6px; text-align: left;">PLOT</th>
            <th style="padding: 6px; text-align: left;">DEPTH</th>
            <th style="padding: 6px; text-align: right;">pH (H₂O)</th>
            <th style="padding: 6px; text-align: right;">ORG C (%)</th>
            <th style="padding: 6px; text-align: right;">TOT N (%)</th>
            <th style="padding: 6px; text-align: right;">EXTR P (ppm)</th>
            <th style="padding: 6px; text-align: right;">EXCH K</th>
            <th style="padding: 6px; text-align: right;">EXCH Ca</th>
            <th style="padding: 6px; text-align: right;">EXCH Mg</th>
            <th style="padding: 6px; text-align: right;">CEC</th>
          </tr>
        `;
        let html = '';
        soilRows.forEach(r => {
          html += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px; font-weight: 700;">Plot ${r.plot}</td>
              <td style="padding: 6px;">${r.depth}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace; font-weight: 700; color: #a16207;">${Number(r.ph).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.orgC).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.totalN).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.extrP).toFixed(1)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.exchK).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.exchCa).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.exchMg).toFixed(2)}</td>
              <td style="padding: 6px; text-align: right; font-family: monospace;">${Number(r.cec).toFixed(1)}</td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }
    }

    openModal(modals.print);
  }

  function handleTriggerPrint() {
    window.print();
  }

  // ================= Modal 5: Create ASCII Scientific Export =================

  function handleConfirmCreateAscii() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const category = activeCategory || 'ffb';
    const fileName = `ANNDATA_${trial.code}_${category.toUpperCase()}.csv`;
    const rows = trial.annualPlotData[category] || [];
    let delimiter = ',';

    let content = '';
    if (category === 'ffb') {
      content += ['TRIAL', 'ESTATE', 'PLOT', 'PALMS', 'BWT_KG', 'NOB_PALM', 'PALM_YLD', 'FFB_THA'].join(delimiter) + '\n';
      rows.forEach(r => {
        const line = [trial.code, `"${trial.estate}"`, r.plot, r.palms, r.bwt, r.nob, r.palmYield, r.ffbYield].join(delimiter);
        content += line + '\n';
      });
    } else if (category === 'leaf') {
      content += ['TRIAL', 'ESTATE', 'PLOT', 'N_PCT', 'P_PCT', 'K_PCT', 'CA_PCT', 'MG_PCT', 'S_PCT', 'CL_PCT', 'B_PPM'].join(delimiter) + '\n';
      rows.forEach(r => {
        const line = [trial.code, `"${trial.estate}"`, r.plot, r.n, r.p, r.k, r.ca, r.mg, r.s, r.cl, r.b].join(delimiter);
        content += line + '\n';
      });
    } else if (category === 'veg') {
      content += ['TRIAL', 'ESTATE', 'PLOT', 'FROND', 'RACHIS_CM', 'PET_W', 'PET_D', 'P_X_D', 'PINNAE', 'AREA_M2', 'FDW', 'LAI', 'TRUNK_M'].join(delimiter) + '\n';
      rows.forEach(r => {
        const line = [trial.code, `"${trial.estate}"`, r.plot, r.frond, r.rachisLen, r.petioleW, r.petioleD, r.petioleArea, r.pinnae, r.leafArea, r.fdw, r.lai, r.trunkHt].join(delimiter);
        content += line + '\n';
      });
    } else if (category === 'soil') {
      content += ['TRIAL', 'ESTATE', 'PLOT', 'DEPTH', 'PH_H2O', 'ORG_C', 'TOT_N', 'EXTR_P', 'EXCH_K', 'EXCH_CA', 'EXCH_MG', 'CEC'].join(delimiter) + '\n';
      rows.forEach(r => {
        const line = [trial.code, `"${trial.estate}"`, r.plot, `"${r.depth}"`, r.ph, r.orgC, r.totalN, r.extrP, r.exchK, r.exchCa, r.exchMg, r.cec].join(delimiter);
        content += line + '\n';
      });
    }

    // Trigger download as clean CSV
    downloadFile(fileName, content, 'text/csv');
    if (modals.createAscii) closeModal(modals.createAscii);
    showToast(`Downloaded ${fileName} to your Downloads folder`);
  }

  function openCreateAsciiDialog() {
    handleConfirmCreateAscii();
  }

  // ================= Modal 6: Save DBF / CSV Export =================

  function handleConfirmExportAnnual() {
    const trial = getCurrentTrial();
    if (!trial) return;
    ensureTrialAnnualData(trial);

    const fileName = `ANNDATA_${trial.code}.csv`;
    let csv = 'TRIAL,ESTATE,PLOT,FFB_THA,BWT_KG,NOB_PALM,N_PCT,P_PCT,K_PCT,LAI,PH_H2O,CEC\n';
    const ffb = trial.annualPlotData.ffb || [];
    const leaf = trial.annualPlotData.leaf || [];
    const veg = trial.annualPlotData.veg || [];
    const soil = trial.annualPlotData.soil || [];
    const maxPlots = Math.max(ffb.length, leaf.length, veg.length, soil.length);
    for (let i = 0; i < maxPlots; i++) {
      const f = ffb[i] || {};
      const l = leaf[i] || {};
      const v = veg[i] || {};
      const s = soil[i] || {};
      const plot = f.plot || l.plot || (i + 1);
      csv += `${trial.code},"${trial.estate}",${plot},${f.ffbYield || ''},${f.bwt || ''},${f.nob || ''},${l.n || ''},${l.p || ''},${l.k || ''},${v.lai || ''},${s.ph || ''},${s.cec || ''}\n`;
    }

    downloadFile(fileName, csv, 'text/csv');
    if (modals.saveDbf) closeModal(modals.saveDbf);
    showToast(`Downloaded ${fileName} to your Downloads folder`);
  }

  function openSaveDbfDialog() {
    handleConfirmExportAnnual();
  }

  // ================= Modal 7: Make Trial BackUp Data =================

  function handleConfirmMakeBackup() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const fileName = `BCANN_${trial.code}.csv`;
    let csv = 'ARCHIVE_TYPE,TRIAL_CODE,ESTATE,CATEGORY,REC_NO,PLOT_NO,PALM_COUNT,PARAM_1,PARAM_2,PARAM_3,PARAM_4,PARAM_5,PARAM_6,PARAM_7,PARAM_8,PARAM_9,PARAM_10,PARAM_11,PARAM_12\n';

    // FFB
    (trial.annualPlotData.ffb || []).forEach(r => {
      csv += `ANNUAL_ARCHIVE,${trial.code},"${trial.estate}",FFB_YIELD,${r.rec},${r.plot},${r.palms},${r.bwt},${r.nob},${r.palmYield},${r.ffbYield},${r.bwtTotal},${r.bnoTotal},,,,,,\n`;
    });
    // Leaf
    (trial.annualPlotData.leaf || []).forEach(r => {
      csv += `ANNUAL_ARCHIVE,${trial.code},"${trial.estate}",LEAF_NUTRIENT,${r.rec},${r.plot},16,"${r.sampleType}",${r.n},${r.p},${r.k},${r.ca},${r.mg},${r.s},${r.cl},${r.b},${r.cu},${r.zn}\n`;
    });
    // Veg
    (trial.annualPlotData.veg || []).forEach(r => {
      csv += `ANNUAL_ARCHIVE,${trial.code},"${trial.estate}",VEG_CANOPY,${r.rec},${r.plot},16,${r.frond},${r.rachisLen},${r.petioleW},${r.petioleD},${r.petioleArea},${r.pinnae},${r.leafArea},${r.fdw},${r.lai},${r.trunkHt},,\n`;
    });
    // Soil
    (trial.annualPlotData.soil || []).forEach(r => {
      csv += `ANNUAL_ARCHIVE,${trial.code},"${trial.estate}",SOIL_NUTRIENT,${r.rec},${r.plot},16,"${r.depth}",${r.ph},${r.orgC},${r.totalN},${r.extrP},${r.exchK},${r.exchCa},${r.exchMg},${r.cec},,\n`;
    });

    downloadFile(fileName, csv, 'text/csv');
    if (modals.makeBackup) closeModal(modals.makeBackup);
    showToast(`Downloaded ${fileName} to your Downloads folder`);
  }

  function openMakeBackupDialog() {
    handleConfirmMakeBackup();
  }

  // ================= Modal 8: Read Data From BackUp File =================
  let uploadedAnnualBackupFile = null;
  let uploadedAnnualBackupRows = [];

  function downloadSampleExcelForAnnual() {
    const trial = getCurrentTrial() || { code: 'DTP1' };
    const fileName = `Sample_Annual_Plot_Data_${trial.code}.xlsx`;
    const sampleRows = [
      { PLOT: 1, FFB_THA: 31.4, N_PCT: 2.75, P_PCT: 0.165, K_PCT: 1.18, LAI: 5.45, PH_H2O: 4.35, CEC: 8.6 },
      { PLOT: 2, FFB_THA: 33.8, N_PCT: 2.82, P_PCT: 0.171, K_PCT: 1.24, LAI: 5.62, PH_H2O: 4.42, CEC: 8.9 },
      { PLOT: 3, FFB_THA: 29.6, N_PCT: 2.68, P_PCT: 0.159, K_PCT: 1.12, LAI: 5.18, PH_H2O: 4.28, CEC: 8.2 }
    ];

    if (window.XLSX) {
      const ws = window.XLSX.utils.json_to_sheet(sampleRows);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Annual_Plot_Data');
      window.XLSX.writeFile(wb, fileName);
      showToast(`Downloaded sample template "${fileName}"`);
    } else {
      handleConfirmMakeBackup();
    }
  }

  function openReadBackupDialog() {
    uploadedAnnualBackupFile = null;
    uploadedAnnualBackupRows = [];
    const fileInp = document.getElementById('backup-excel-file-upload');
    const dropTitle = document.getElementById('annual-backup-drop-title');
    const statusText = document.getElementById('annual-backup-status-text');
    if (fileInp) fileInp.value = '';
    if (dropTitle) dropTitle.textContent = 'Click to Browse or Drag & Drop Excel File Here';
    if (statusText) statusText.textContent = 'Waiting for Excel file upload';
    openModal(modals.readBackup);
  }

  function applyAnnualRowsToTrial(trial, rawRows) {
    if (!trial || !rawRows || rawRows.length === 0) return 0;
    ensureTrialAnnualData(trial);
    rawRows.forEach((r, idx) => {
      const p = Number(r.PLOT || r.plot || r.Plot || r.PLOT_NO || (idx + 1)) || (idx + 1);
      const ffbVal = Number(r.FFB_THA ?? r.ffb_tha ?? r.YIELD ?? r.FFB ?? 30.0);
      const nVal = Number(r.N_PCT ?? r.n_pct ?? r.N ?? 2.70);
      const pVal = Number(r.P_PCT ?? r.p_pct ?? r.P ?? 0.160);
      const kVal = Number(r.K_PCT ?? r.k_pct ?? r.K ?? 1.15);
      const laiVal = Number(r.LAI ?? r.lai ?? 5.20);
      const phVal = Number(r.PH_H2O ?? r.ph_h2o ?? r.PH ?? 4.30);
      const cecVal = Number(r.CEC ?? r.cec ?? 8.5);

      let ffbRow = trial.annualPlotData.ffb.find(x => x.plot === p);
      if (!ffbRow) {
        ffbRow = { rec: idx + 1, plot: p, palms: 16, bwt: 18.0, nob: 15.0 };
        trial.annualPlotData.ffb.push(ffbRow);
      }
      ffbRow.ffbYield = Number(ffbVal.toFixed(1));
      const density = getTrialDensity(trial, p);
      ffbRow.palmYield = Number(((ffbRow.ffbYield * 1000) / density).toFixed(1));
      ffbRow.bwt = Number((ffbRow.palmYield / 15.0).toFixed(1));
      ffbRow.nob = 15.0;
      ffbRow.bwtTotal = Math.round(ffbRow.palmYield * ffbRow.palms);
      ffbRow.bnoTotal = Math.round(ffbRow.nob * ffbRow.palms);

      let leafRow = trial.annualPlotData.leaf.find(x => x.plot === p);
      if (!leafRow) {
        leafRow = { rec: idx + 1, plot: p, sampleType: 'Frond 17' };
        trial.annualPlotData.leaf.push(leafRow);
      }
      leafRow.n = Number(nVal.toFixed(2));
      leafRow.p = Number(pVal.toFixed(3));
      leafRow.k = Number(kVal.toFixed(2));

      let vegRow = trial.annualPlotData.veg.find(x => x.plot === p);
      if (!vegRow) {
        vegRow = { rec: idx + 1, plot: p, frond: 17, pinnae: 310 };
        trial.annualPlotData.veg.push(vegRow);
      }
      vegRow.lai = Number(laiVal.toFixed(2));

      let soilRow = trial.annualPlotData.soil.find(x => x.plot === p);
      if (!soilRow) {
        soilRow = { rec: idx + 1, plot: p, depth: '0-15 cm' };
        trial.annualPlotData.soil.push(soilRow);
      }
      soilRow.ph = Number(phVal.toFixed(2));
      soilRow.cec = Number(cecVal.toFixed(1));
    });
    saveTrialAnnualData(trial);
    return rawRows.length;
  }

  function handleConfirmReadBackup() {
    if (!uploadedAnnualBackupFile) {
      showToast('Please select or drop an Excel file (.xlsx, .xls, .csv) first');
      return;
    }
    const trial = getCurrentTrial();
    if (!trial) return;

    if (uploadedAnnualBackupRows.length > 0) {
      applyAnnualRowsToTrial(trial, uploadedAnnualBackupRows);
    } else {
      localStorage.removeItem('reada_annual_plot_data_' + trial.code);
      delete trial.annualPlotData;
      ensureTrialAnnualData(trial);
    }

    renderAll();
    closeModal(modals.readBackup);
    showToast(`Restored ${uploadedAnnualBackupRows.length} annual plot record(s) for ${trial.code} from "${uploadedAnnualBackupFile.name}".`);
  }

  // ================= Modal 9: Read 'Non-ReaDA' DBase File =================

  function openReadNonReadaDialog() {
    const fileInp = document.getElementById('annual-excel-file-upload');
    const dropTitle = document.getElementById('annual-nonreada-drop-title');
    if (fileInp) fileInp.value = '';
    if (dropTitle) dropTitle.textContent = 'Click to Browse or Drag & Drop Excel File Here';
    renderNonReadaPreview();
    openModal(modals.readNonReada);
  }

  function renderNonReadaPreview() {
    const extData = window.READA_EXTERNAL_ANNUAL_DBF;
    const tbody = document.getElementById('tbody-nonreada-preview');
    if (!tbody || !extData || !extData.sampleRows) return;

    let html = '';
    extData.sampleRows.forEach(r => {
      html += `
        <tr>
          <td><strong>Plot ${r.PLOT}</strong></td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: #c2410c;">${r.FFB_THA.toFixed(1)}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 600; color: #15803d;">${r.N_PCT.toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${r.P_PCT.toFixed(3)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${r.K_PCT.toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono); color: var(--brand-green);">${r.LAI.toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono); color: #a16207;">${r.PH_H2O.toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${r.CEC.toFixed(1)}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  function handleConfirmImportNonReada() {
    const trial = getCurrentTrial();
    const extData = window.READA_EXTERNAL_ANNUAL_DBF;
    if (!trial || !extData || !extData.sampleRows) return;

    applyAnnualRowsToTrial(trial, extData.sampleRows);
    renderAll();
    closeModal(modals.readNonReada);
    showToast(`Successfully imported ${extData.sampleRows.length} plot records from ${extData.fileName} into Trial ${trial.code}!`);
  }

  // Handle Backup Excel/CSV upload
  function processBackupExcelFile(file) {
    if (!file) return;
    uploadedAnnualBackupFile = file;
    uploadedAnnualBackupRows = [];

    const dropTitle = document.getElementById('annual-backup-drop-title');
    const statusText = document.getElementById('annual-backup-status-text');
    if (dropTitle) dropTitle.textContent = `Selected: ${file.name}`;

    try {
      if (window.XLSX) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          const data = new Uint8Array(evt.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rows = window.XLSX.utils.sheet_to_json(worksheet);
          uploadedAnnualBackupRows = rows || [];
          if (statusText) {
            statusText.textContent = `Verified: ${file.name} (${uploadedAnnualBackupRows.length} rows in "${sheetName}")`;
          }
          if (uploadedAnnualBackupRows.length > 0) {
            showToast(`Archive verified: ${uploadedAnnualBackupRows.length} rows loaded from Excel sheet "${sheetName}".`);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (statusText) {
        statusText.textContent = `Verified: ${file.name}`;
      }
    } catch (err) {
      console.error(err);
      showToast(`Error parsing backup file: ${err.message}`);
    }
  }

  function handleBackupExcelUpload(e) {
    processBackupExcelFile(e.target.files[0]);
  }

  // Handle Non-ReaDA Excel spreadsheet upload using SheetJS
  function processAnnualExcelFile(file) {
    if (!file) return;
    const dropTitle = document.getElementById('annual-nonreada-drop-title');
    if (dropTitle) dropTitle.textContent = `Selected: ${file.name}`;

    try {
      if (window.XLSX) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          const data = new Uint8Array(evt.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawRows = window.XLSX.utils.sheet_to_json(worksheet);

          if (rawRows && rawRows.length > 0) {
            const parsedRows = rawRows.map((r, idx) => {
              const plotVal = r.PLOT || r.plot || r.Plot || r.PLOT_NO || (idx + 1);
              const ffbVal = r.FFB_THA || r.ffb_tha || r.YIELD || r.yield || r.FFB || (28 + Math.random() * 15);
              const nVal = r.N_PCT || r.n_pct || r.N || r.n || 2.70;
              const pVal = r.P_PCT || r.p_pct || r.P || r.p || 0.160;
              const kVal = r.K_PCT || r.k_pct || r.K || r.k || 1.15;
              const laiVal = r.LAI || r.lai || 5.20;
              const phVal = r.PH_H2O || r.ph_h2o || r.PH || r.ph || 4.30;
              const cecVal = r.CEC || r.cec || 8.5;
              return {
                PLOT: Number(plotVal) || (idx + 1),
                FFB_THA: Number(Number(ffbVal).toFixed(1)),
                N_PCT: Number(Number(nVal).toFixed(2)),
                P_PCT: Number(Number(pVal).toFixed(3)),
                K_PCT: Number(Number(kVal).toFixed(2)),
                LAI: Number(Number(laiVal).toFixed(2)),
                PH_H2O: Number(Number(phVal).toFixed(2)),
                CEC: Number(Number(cecVal).toFixed(1))
              };
            });

            window.READA_EXTERNAL_ANNUAL_DBF = {
              fileName: file.name,
              sampleRows: parsedRows
            };

            const sheetTitle = document.getElementById('preview-sheet-title');
            if (sheetTitle) sheetTitle.textContent = `Excel Spreadsheet Preview (${file.name} · Sheet: ${sheetName})`;

            renderNonReadaPreview();
            showToast(`Loaded ${parsedRows.length} plot records from Excel sheet "${sheetName}"`);
          }
        };
        reader.readAsArrayBuffer(file);
      }
    } catch (err) {
      console.error(err);
      showToast(`Error parsing Excel file: ${err.message}`);
    }
  }

  function handleAnnualExcelUpload(e) {
    processAnnualExcelFile(e.target.files[0]);
  }

  // ================= Modal 10: Delete Annual Plot Data =================

  function openDeleteAnnualDialog() {
    updateMetricsStrip();
    const confirmInput = document.getElementById('delete-annual-confirm-text');
    if (confirmInput) confirmInput.value = '';
    openModal(modals.deleteData);
  }

  function handleConfirmDeleteAnnual() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const confirmInput = document.getElementById('delete-annual-confirm-text');
    if (!confirmInput || confirmInput.value.trim().toUpperCase() !== 'DELETE') {
      alert('Please type DELETE in capital letters to confirm deletion.');
      if (confirmInput) confirmInput.focus();
      return;
    }

    const scopeRadio = document.querySelector('input[name="delete-annual-scope"]:checked');
    const scope = scopeRadio ? scopeRadio.value : 'category';

    if (scope === 'all') {
      trial.annualPlotData.ffb = [];
      trial.annualPlotData.leaf = [];
      trial.annualPlotData.veg = [];
      trial.annualPlotData.soil = [];
    } else {
      trial.annualPlotData[activeCategory] = [];
    }

    saveTrialAnnualData(trial);
    renderAll();
    closeModal(modals.deleteData);
    showToast(`Annual plot data deleted for Trial ${trial.code}.`);
  }

  // ================= File Downloader Utility =================

  function downloadFile(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ================= Category Tab Switcher =================

  function setCategoryTab(category) {
    if (!categoryConfig[category]) return;
    activeCategory = category;

    el.categoryTabBtns.forEach(btn => {
      if (btn.getAttribute('data-cat') === category) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    renderAll();
  }

  // ================= Event Listeners Initialization =================

  function bindEvents() {
    // Trial selection dropdown
    if (el.trialSelect) {
      el.trialSelect.addEventListener('change', (e) => {
        currentCode = e.target.value;
        localStorage.setItem('reada_active_trial', currentCode);
        renderAll();
        showToast(`Working Trial changed to ${currentCode}`);
      });
    }

    // Refresh code list button
    if (el.btnUpdateCodeList) {
      el.btnUpdateCodeList.addEventListener('click', () => {
        populateTrialDropdown();
        renderAll();
        showToast('Trial Code list refreshed from annual plot registers');
      });
    }

    // Category Tabs
    el.categoryTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        setCategoryTab(cat);
      });
    });

    // Chart metric tab buttons
    if (el.chartPillBtns) {
      el.chartPillBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          el.chartPillBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          chartActiveMetric = btn.dataset.chartMetric;
          renderAnnualChart();
        });
      });
    }

    // Chart collapse / expand toggle
    if (el.btnToggleChartCollapse) {
      el.btnToggleChartCollapse.addEventListener('click', () => {
        isChartCollapsed = !isChartCollapsed;
        if (el.annualChartCard) {
          el.annualChartCard.classList.toggle('collapsed', isChartCollapsed);
        }
        if (el.chartCollapseLabel) {
          el.chartCollapseLabel.textContent = isChartCollapsed ? 'Expand' : 'Minimize';
        }
        if (el.chartCollapseIcon) {
          el.chartCollapseIcon.innerHTML = isChartCollapsed
            ? '<polyline points="6 9 12 15 18 9"/>'
            : '<polyline points="6 15 12 9 18 15"/>';
        }
      });
    }

    // Window resize re-render for crisp SVG responsiveness
    window.addEventListener('resize', () => {
      if (!isChartCollapsed) {
        renderAnnualChart();
      }
    });

    // Plot Filter
    if (el.summaryFilterPlot) {
      el.summaryFilterPlot.addEventListener('change', (e) => {
        activePlotFilter = e.target.value;
        renderSummaryTable();
      });
    }

    // Quick Edit Category Button
    if (el.btnQuickEditCategory) {
      el.btnQuickEditCategory.addEventListener('click', () => {
        openPlotGridEditor(currentCode, activeCategory, categoryConfig[activeCategory].defaultPeriod, false);
      });
    }

    // Groupbox 1: Procedure Buttons
    const btnNewEntry = document.getElementById('btn-new-annual-entry');
    if (btnNewEntry) btnNewEntry.addEventListener('click', openNewAnnualEntryDialog);

    const btnEditData = document.getElementById('btn-edit-annual-data');
    if (btnEditData) btnEditData.addEventListener('click', openEditSelectionDialog);

    const btnViewData = document.getElementById('btn-view-annual-data');
    if (btnViewData) {
      btnViewData.addEventListener('click', () => {
        const trial = getCurrentTrial();
        if (el.tableSummary) {
          el.tableSummary.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.tableSummary.style.transition = 'outline 0.3s ease';
          el.tableSummary.style.outline = '3px solid var(--brand-green)';
          setTimeout(() => {
            el.tableSummary.style.outline = 'none';
          }, 1400);
        }
        showToast(`Displaying multi-disciplinary annual plot records for Trial ${trial.code}`);
      });
    }

    // Groupbox 2: Reporting & ASCII Export
    const btnPrintReport = document.getElementById('btn-print-annual-report');
    if (btnPrintReport) btnPrintReport.addEventListener('click', openPrintAnnualReport);

    const btnCreateAscii = document.getElementById('btn-create-ascii');
    if (btnCreateAscii) btnCreateAscii.addEventListener('click', openCreateAsciiDialog);

    // Groupbox 3: Data Exchange & System Backups
    const btnSaveDbf = document.getElementById('btn-save-annual-dbf');
    if (btnSaveDbf) btnSaveDbf.addEventListener('click', openSaveDbfDialog);

    const btnMakeBackup = document.getElementById('btn-make-annual-backup');
    if (btnMakeBackup) btnMakeBackup.addEventListener('click', openMakeBackupDialog);

    const btnReadBackup = document.getElementById('btn-read-annual-backup');
    if (btnReadBackup) btnReadBackup.addEventListener('click', openReadBackupDialog);

    const btnReadNonReada = document.getElementById('btn-read-nonreada-annual');
    if (btnReadNonReada) btnReadNonReada.addEventListener('click', openReadNonReadaDialog);

    const btnDeleteAnnual = document.getElementById('btn-delete-annual-data');
    if (btnDeleteAnnual) btnDeleteAnnual.addEventListener('click', openDeleteAnnualDialog);

    // Modal 1: Radios & Continue Buttons
    const newEntryRadios = document.querySelectorAll('input[name="new-entry-cat"]');
    newEntryRadios.forEach(r => {
      r.addEventListener('change', updateNewEntryButtons);
    });

    document.getElementById('btn-cont-ffb')?.addEventListener('click', () => handleContinueNewEntry('ffb'));
    document.getElementById('btn-cont-leaf')?.addEventListener('click', () => handleContinueNewEntry('leaf'));
    document.getElementById('btn-cont-veg')?.addEventListener('click', () => handleContinueNewEntry('veg'));
    document.getElementById('btn-cont-soil')?.addEventListener('click', () => handleContinueNewEntry('soil'));

    // Modal 2: Edit Selection Confirm
    document.getElementById('btn-confirm-edit-selection')?.addEventListener('click', handleConfirmEditSelection);

    // Modal 3: Plot Grid Editor Controls
    document.getElementById('btn-editor-add-plot')?.addEventListener('click', handleAddPlotRow);
    document.getElementById('btn-editor-recalc')?.addEventListener('click', handleRecalculateAllEditorRows);
    document.getElementById('btn-save-plot-editor')?.addEventListener('click', handleSavePlotEditor);

    // Modal 4: Print Dialog Trigger
    document.getElementById('btn-trigger-print')?.addEventListener('click', handleTriggerPrint);

    // Modal 5: ASCII Dialog Trigger
    document.getElementById('btn-confirm-create-ascii')?.addEventListener('click', handleConfirmCreateAscii);

    // Modal 6: DBF Export Dialog Trigger
    document.getElementById('btn-confirm-export-annual')?.addEventListener('click', handleConfirmExportAnnual);

    // Modal 7: Make Backup Trigger
    document.getElementById('btn-confirm-make-backup')?.addEventListener('click', handleConfirmMakeBackup);

    // Modal 8: Read Backup Triggers
    document.getElementById('btn-download-annual-backup-sample')?.addEventListener('click', downloadSampleExcelForAnnual);
    document.getElementById('btn-confirm-read-backup')?.addEventListener('click', handleConfirmReadBackup);
    document.getElementById('backup-excel-file-upload')?.addEventListener('change', handleBackupExcelUpload);
    const annualBackupDropZone = document.getElementById('annual-backup-drop-zone');
    if (annualBackupDropZone) {
      annualBackupDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        annualBackupDropZone.classList.add('dragover');
      });
      annualBackupDropZone.addEventListener('dragleave', () => {
        annualBackupDropZone.classList.remove('dragover');
      });
      annualBackupDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        annualBackupDropZone.classList.remove('dragover');
        if (e.dataTransfer?.files?.length) {
          processBackupExcelFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Modal 9: Read Non-ReaDA Triggers
    document.getElementById('btn-download-annual-nonreada-sample')?.addEventListener('click', downloadSampleExcelForAnnual);
    document.getElementById('btn-load-nonreada-preview')?.addEventListener('click', renderNonReadaPreview);
    document.getElementById('btn-confirm-import-nonreada')?.addEventListener('click', handleConfirmImportNonReada);
    document.getElementById('annual-excel-file-upload')?.addEventListener('change', handleAnnualExcelUpload);
    const annualNonReadaDropZone = document.getElementById('annual-nonreada-drop-zone');
    if (annualNonReadaDropZone) {
      annualNonReadaDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        annualNonReadaDropZone.classList.add('dragover');
      });
      annualNonReadaDropZone.addEventListener('dragleave', () => {
        annualNonReadaDropZone.classList.remove('dragover');
      });
      annualNonReadaDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        annualNonReadaDropZone.classList.remove('dragover');
        if (e.dataTransfer?.files?.length) {
          processAnnualExcelFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Modal 10: Delete Annual Trigger
    document.getElementById('btn-confirm-delete-annual')?.addEventListener('click', handleConfirmDeleteAnnual);

    // Universal Modal Close Handlers (.modal-close-icon and .btn-modal-cancel)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      // Close on background backdrop click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeModal(overlay);
        }
      });

      // Close on close icon
      overlay.querySelectorAll('.modal-close-icon').forEach(btn => {
        btn.addEventListener('click', () => closeModal(overlay));
      });

      // Close on cancel button
      overlay.querySelectorAll('.btn-modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => closeModal(overlay));
      });
    });

    // Close modal on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openM = document.querySelector('.modal-overlay.open');
        if (openM) closeModal(openM);
      }
    });
  }

  // ================= Initialize Controller =================

  async function init() {
    if (window.ReadaSync && typeof window.ReadaSync.fetchTrials === 'function') {
      try {
        const fetched = await window.ReadaSync.fetchTrials();
        if (fetched && fetched.length > 0) {
          trials = fetched;
          if (!trials.find(t => t.code === currentCode)) {
            currentCode = trials[0].code;
          }
        }
      } catch (e) {
        console.warn('ReadaSync fetch error on init:', e);
      }
    }
    populateTrialDropdown();
    renderAll();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
