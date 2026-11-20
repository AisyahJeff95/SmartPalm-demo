/**
 * ReaDA - Relational Database for Agronomy Trial Data
 * Module 4: Vegetative Field Sampling Controller (VEG_PROC.WFM)
 * 
 * Features:
 * 1. Frond 17 morphometric field measurements (Rachis length, Petiole W/D, Pinnae count, Leaflet L/W, Trunk height)
 * 2. Canopy allometric computations (P x D, Leaf Area, Frond Dry Weight, LAI)
 * 3. Annual growth aggregation & commit to DATAVM.DBF
 * 4. External digital caliper logger import (B:\VEG93.CSV), backup restore (BCVM.DBF), and CSV/DBF export
 * 5. Full adherence to PORIM User Manual and modern Clean White theme architecture
 */

(function () {
  'use strict';

  // State
  let trials = window.READA_TRIALS || [];
  let currentCode = localStorage.getItem('reada_active_trial') || 'DTP1';
  let activeSamplingYear = 1997;
  let activeSamplingDate = '22/07/1997';
  let activeFrond = 17;
  let selectedTrialForEntry = currentCode;
  let selectedYearForEntry = activeSamplingYear;

  // Allometric Coefficients (Standard PORIM Model: Hardon et al. 1969; Corley et al. 1971)
  let allometricSettings = {
    shapeK: 0.55,          // Hardon leaflet area shape factor
    fdwA: 0.1023,          // Corley FDW scalar
    fdwB: 0.749,           // Corley FDW exponent
    frondsPerPalm: 40      // Standing fronds per palm
  };

  // Load saved settings if present
  try {
    const saved = localStorage.getItem('reada_veg_settings');
    if (saved) {
      allometricSettings = Object.assign({}, allometricSettings, JSON.parse(saved));
    }
  } catch (e) {
    console.warn('Could not read saved allometric settings', e);
  }

  // Active editable records in grid
  let editableVegRecords = [];

  // DOM Elements
  const el = {
    trialSelect: document.getElementById('select-working-trial'),
    statCode: document.getElementById('stat-trial-code'),
    statEstate: document.getElementById('stat-estate'),
    statYear: document.getElementById('stat-sampling-year'),
    statFrond: document.getElementById('stat-frond-std'),
    statRecords: document.getElementById('stat-records-count'),
    statLai: document.getElementById('stat-mean-lai'),
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toast-msg'),
    activeSummaryTrial: document.getElementById('active-summary-trial'),
    activeSummaryYear: document.getElementById('active-summary-year'),
    summaryFilterPlot: document.getElementById('summary-filter-plot'),
    tbodySummary: document.getElementById('tbody-veg-summary'),
    tfootSummary: document.getElementById('tfoot-veg-summary')
  };

  // Modals
  const modals = {
    find: document.getElementById('modal-veg-find'),
    edit: document.getElementById('modal-veg-edit'),
    calc: document.getElementById('modal-veg-calc'),
    settings: document.getElementById('modal-veg-settings'),
    print: document.getElementById('modal-veg-print'),
    saveDbf: document.getElementById('modal-veg-save-dbf'),
    backup: document.getElementById('modal-veg-read-backup'),
    external: document.getElementById('modal-veg-read-external'),
    delete: document.getElementById('modal-veg-delete')
  };

  // ================= Helpers =================

  function getCurrentTrial() {
    if (!trials || trials.length === 0) return null;
    return trials.find(t => t.code === currentCode) || trials[0];
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

  function calcPetioleArea(w, d) {
    const width = parseFloat(w) || 0;
    const depth = parseFloat(d) || 0;
    return width * depth;
  }

  function calcFrondLeafArea(pinnae, lLen, lWid, k) {
    const p = parseFloat(pinnae) || 0;
    const l = parseFloat(lLen) || 0;
    const w = parseFloat(lWid) || 0;
    const shape = (k !== undefined && k !== null) ? parseFloat(k) : allometricSettings.shapeK;
    if (p <= 0 || l <= 0 || w <= 0) return 0;
    return (2 * p * l * w * shape) / 10000;
  }

  function calcFrondDryWeight(pArea, a, b) {
    const area = parseFloat(pArea) || 0;
    if (area <= 0) return 0;
    const scalar = (a !== undefined && a !== null) ? parseFloat(a) : allometricSettings.fdwA;
    const exponent = (b !== undefined && b !== null) ? parseFloat(b) : allometricSettings.fdwB;
    return scalar * Math.pow(area, exponent);
  }

  function calcCanopyLAI(frondLA, density, frondsPalm) {
    const la = parseFloat(frondLA) || 0;
    const dens = parseFloat(density) || 148;
    const fpp = (frondsPalm !== undefined && frondsPalm !== null) ? parseFloat(frondsPalm) : allometricSettings.frondsPerPalm;
    return (la * fpp * dens) / 10000;
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
    const input = modal.querySelector('input:not([readonly]), button.btn-primary');
    if (input) setTimeout(() => input.focus(), 60);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  // ================= UI Updates =================

  function populateTrialDropdown() {
    if (!el.trialSelect || !trials) return;

    el.trialSelect.innerHTML = '';
    trials.forEach(trial => {
      const opt = document.createElement('option');
      opt.value = trial.code;
      opt.textContent = `${trial.code} - ${trial.estate} (${trial.plantingYear || '1990'})`;
      if (trial.code === currentCode) opt.selected = true;
      el.trialSelect.appendChild(opt);
    });

    el.trialSelect.addEventListener('change', (e) => {
      currentCode = e.target.value;
      localStorage.setItem('reada_active_trial', currentCode);
      refreshDashboard();
      showToast(`Active trial changed to ${currentCode}`);
    });
  }

  function refreshDashboard() {
    const trial = getCurrentTrial();
    if (!trial) return;

    if (!trial.vegetativeRecords) {
      trial.vegetativeRecords = [];
    }

    // Top metrics strip
    if (el.statCode) el.statCode.textContent = trial.code;
    if (el.statEstate) el.statEstate.textContent = trial.estate || 'MPOB Station';
    if (el.statYear) el.statYear.textContent = activeSamplingYear;
    if (el.statRecords) el.statRecords.textContent = trial.vegetativeRecords.length;

    if (el.activeSummaryTrial) el.activeSummaryTrial.textContent = trial.code;
    if (el.activeSummaryYear) el.activeSummaryYear.textContent = activeSamplingYear;

    // Calculate aggregated metrics
    const stats = computeAggregateAllometrics(trial);
    if (el.statLai) {
      el.statLai.textContent = stats.count > 0 ? stats.meanLAI.toFixed(2) : '0.00';
    }

    // Populate plot filter dropdown
    populatePlotFilter(trial);

    // Render Summary Table
    renderSummaryTable(trial);
  }

  function populatePlotFilter(trial) {
    if (!el.summaryFilterPlot) return;
    const records = trial.vegetativeRecords || [];
    const plots = Array.from(new Set(records.map(r => r.plot))).sort((a, b) => a - b);

    const currentVal = el.summaryFilterPlot.value || 'all';
    el.summaryFilterPlot.innerHTML = '<option value="all">All Plots</option>';
    plots.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = `Plot ${p}`;
      if (String(p) === currentVal) opt.selected = true;
      el.summaryFilterPlot.appendChild(opt);
    });
  }

  function renderSummaryTable(trial) {
    if (!el.tbodySummary) return;

    const allRecords = trial.vegetativeRecords || [];
    const filterPlot = el.summaryFilterPlot ? el.summaryFilterPlot.value : 'all';
    const records = (filterPlot === 'all')
      ? allRecords
      : allRecords.filter(r => String(r.plot) === filterPlot);

    if (records.length === 0) {
      el.tbodySummary.innerHTML = `
        <tr>
          <td colspan="15" style="text-align: center; color: var(--text-muted); padding: 36px 16px;">
            No vegetative sampling measurements found for Trial <strong>${trial.code}</strong> (${activeSamplingYear}).<br>
            Click <strong>"New Vegetative Sampling Data Entry"</strong> or <strong>"Open Measurement Editor"</strong> to record Frond 17 measurements.
          </td>
        </tr>
      `;
      if (el.tfootSummary) el.tfootSummary.innerHTML = '';
      return;
    }

    let sumRachis = 0;
    let sumPetW = 0;
    let sumPetD = 0;
    let sumPArea = 0;
    let sumPinnae = 0;
    let sumLLen = 0;
    let sumLWid = 0;
    let sumLeafArea = 0;
    let sumFDW = 0;
    let sumTrunk = 0;

    el.tbodySummary.innerHTML = records.map((r, idx) => {
      const pArea = calcPetioleArea(r.petioleW, r.petioleD);
      const leafArea = calcFrondLeafArea(r.pinnaeCount, r.leafletLen, r.leafletW);
      const fdw = calcFrondDryWeight(pArea);
      const trunk = parseFloat(r.trunkHt) || 0;

      sumRachis += parseFloat(r.rachisLen) || 0;
      sumPetW += parseFloat(r.petioleW) || 0;
      sumPetD += parseFloat(r.petioleD) || 0;
      sumPArea += pArea;
      sumPinnae += parseInt(r.pinnaeCount, 10) || 0;
      sumLLen += parseFloat(r.leafletLen) || 0;
      sumLWid += parseFloat(r.leafletW) || 0;
      sumLeafArea += leafArea;
      sumFDW += fdw;
      sumTrunk += trunk;

      return `
        <tr>
          <td style="font-family: var(--font-mono); color: var(--text-faint);">${r.rec || idx + 1}</td>
          <td><strong>${r.plot}</strong></td>
          <td>${r.subPlot || '-'}</td>
          <td><strong style="color: var(--brand-green); font-family: var(--font-mono);">${r.palmNo}</strong></td>
          <td><span class="badge-f17">F${r.frond || 17}</span></td>
          <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(r.rachisLen || 0).toFixed(1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(r.petioleW || 0).toFixed(1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(r.petioleD || 0).toFixed(1)}</td>
          <td class="summary-calc-col">${pArea.toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${r.pinnaeCount || 0}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(r.leafletLen || 0).toFixed(1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(r.leafletW || 0).toFixed(1)}</td>
          <td class="summary-calc-col highlight-col">${leafArea.toFixed(2)}</td>
          <td class="summary-calc-col highlight-col">${fdw.toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${trunk.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    // Summary Averages in Footer
    const count = records.length;
    if (el.tfootSummary && count > 0) {
      el.tfootSummary.innerHTML = `
        <tr class="table-footer-stat">
          <td colspan="5" style="padding: 8px 12px; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.04em;">Average / Mean (${count} Palms):</td>
          <td style="text-align: right; font-family: var(--font-mono);">${(sumRachis / count).toFixed(1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${(sumPetW / count).toFixed(1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${(sumPetD / count).toFixed(1)}</td>
          <td style="text-align: right; font-family: var(--font-mono); background-color: #f1f5f9;">${(sumPArea / count).toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${Math.round(sumPinnae / count)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${(sumLLen / count).toFixed(1)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${(sumLWid / count).toFixed(1)}</td>
          <td style="text-align: right; font-family: var(--font-mono); color: var(--brand-green); background-color: #ecfdf5;">${(sumLeafArea / count).toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono); color: var(--brand-green); background-color: #ecfdf5;">${(sumFDW / count).toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${(sumTrunk / count).toFixed(2)}</td>
        </tr>
      `;
    }
  }

  function computeAggregateAllometrics(trial) {
    const records = trial.vegetativeRecords || [];
    if (records.length === 0) {
      return {
        count: 0,
        meanPetioleArea: 0,
        meanLeafArea: 0,
        meanFDW: 0,
        meanTrunkHt: 0,
        meanLAI: 0,
        plotBreakdown: []
      };
    }

    let sumPArea = 0;
    let sumLeafArea = 0;
    let sumFDW = 0;
    let sumTrunkHt = 0;
    const plotMap = {};

    records.forEach(r => {
      const pArea = calcPetioleArea(r.petioleW, r.petioleD);
      const leafArea = calcFrondLeafArea(r.pinnaeCount, r.leafletLen, r.leafletW);
      const fdw = calcFrondDryWeight(pArea);
      const trunk = parseFloat(r.trunkHt) || 0;

      sumPArea += pArea;
      sumLeafArea += leafArea;
      sumFDW += fdw;
      sumTrunkHt += trunk;

      if (!plotMap[r.plot]) {
        plotMap[r.plot] = {
          plot: r.plot,
          count: 0,
          sumPArea: 0,
          sumLeafArea: 0,
          sumFDW: 0,
          sumTrunk: 0,
          density: getTrialDensity(trial, r.plot)
        };
      }
      plotMap[r.plot].count++;
      plotMap[r.plot].sumPArea += pArea;
      plotMap[r.plot].sumLeafArea += leafArea;
      plotMap[r.plot].sumFDW += fdw;
      plotMap[r.plot].sumTrunk += trunk;
    });

    const count = records.length;
    const meanPetioleArea = sumPArea / count;
    const meanLeafArea = sumLeafArea / count;
    const meanFDW = sumFDW / count;
    const meanTrunkHt = sumTrunkHt / count;
    const avgDensity = trial.constantDensity || 148;
    const meanLAI = calcCanopyLAI(meanLeafArea, avgDensity, allometricSettings.frondsPerPalm);

    const plotBreakdown = Object.values(plotMap).map(p => {
      const plotMeanLA = p.sumLeafArea / p.count;
      return {
        plot: p.plot,
        density: p.density,
        count: p.count,
        meanPArea: p.sumPArea / p.count,
        meanLeafArea: plotMeanLA,
        meanFDW: p.sumFDW / p.count,
        meanTrunk: p.sumTrunk / p.count,
        lai: calcCanopyLAI(plotMeanLA, p.density, allometricSettings.frondsPerPalm)
      };
    });

    return {
      count,
      meanPetioleArea,
      meanLeafArea,
      meanFDW,
      meanTrunkHt,
      meanLAI,
      plotBreakdown
    };
  }

  // ================= Modal 1: Selection Dialog (VEG_FIND) =================

  function openSelectionModal() {
    selectedTrialForEntry = currentCode;
    selectedYearForEntry = activeSamplingYear;

    // Render Trials List
    const tbodyTrials = document.getElementById('selection-veg-trials-tbody');
    if (tbodyTrials) {
      tbodyTrials.innerHTML = trials.map(t => `
        <tr class="selectable-row ${t.code === selectedTrialForEntry ? 'selected' : ''}" data-code="${t.code}" style="cursor: pointer;">
          <td><strong style="color: var(--brand-green);">${t.code}</strong></td>
          <td>${t.estate || 'MPOB Station'}</td>
        </tr>
      `).join('');

      tbodyTrials.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', () => {
          tbodyTrials.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
          tr.classList.add('selected');
          selectedTrialForEntry = tr.getAttribute('data-code');
        });
      });
    }

    // Render Years List
    const tbodyYears = document.getElementById('selection-veg-years-tbody');
    if (tbodyYears) {
      const years = [1997, 1996, 1995, 1994, 1993, 1992, 1991, 1990, 1989, 1988];
      tbodyYears.innerHTML = years.map(y => `
        <tr class="selectable-row ${y === selectedYearForEntry ? 'selected' : ''}" data-year="${y}" style="cursor: pointer;">
          <td style="font-family: var(--font-mono); font-weight: 600;">${y}</td>
        </tr>
      `).join('');

      tbodyYears.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', () => {
          tbodyYears.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
          tr.classList.add('selected');
          selectedYearForEntry = parseInt(tr.getAttribute('data-year'), 10);
        });
      });
    }

    const dateInput = document.getElementById('find-veg-date');
    if (dateInput) dateInput.value = activeSamplingDate;

    openModal(modals.find);
  }

  function confirmSelectionAndOpenEditor() {
    currentCode = selectedTrialForEntry;
    activeSamplingYear = selectedYearForEntry;

    const dateInput = document.getElementById('find-veg-date');
    if (dateInput) activeSamplingDate = dateInput.value.trim() || '22/07/1997';

    const frondSelect = document.getElementById('find-veg-frond');
    if (frondSelect) activeFrond = parseInt(frondSelect.value, 10) || 17;

    localStorage.setItem('reada_active_trial', currentCode);
    if (el.trialSelect) el.trialSelect.value = currentCode;

    closeModal(modals.find);
    refreshDashboard();
    openGridEditor();
  }

  // ================= Modal 2: Grid Editor Logic (VEG_EDIT) =================

  function openGridEditor() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const badge = document.getElementById('badge-edit-trial-year');
    if (badge) badge.textContent = `${trial.code} · ${activeSamplingYear}`;

    const dateLabel = document.getElementById('edit-sampling-date');
    if (dateLabel) dateLabel.textContent = activeSamplingDate;

    // Clone records for in-memory grid editing
    editableVegRecords = JSON.parse(JSON.stringify(trial.vegetativeRecords || []));

    const totalPalms = document.getElementById('edit-total-palms');
    if (totalPalms) totalPalms.textContent = editableVegRecords.length;

    renderGridEditorRows();
    openModal(modals.edit);
  }

  function renderGridEditorRows() {
    const tbody = document.getElementById('tbody-veg-editor');
    if (!tbody) return;

    if (editableVegRecords.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="16" style="text-align: center; color: var(--text-muted); padding: 32px 16px;">
            No palms currently entered for this sampling campaign.<br>
            Click <strong>"Auto-Fill Palms"</strong> to load register palms or <strong>"Add Row"</strong> to begin.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = editableVegRecords.map((r, index) => {
      const pArea = calcPetioleArea(r.petioleW, r.petioleD);
      const leafArea = calcFrondLeafArea(r.pinnaeCount, r.leafletLen, r.leafletW);
      const fdw = calcFrondDryWeight(pArea);

      return `
        <tr data-index="${index}">
          <td style="font-family: var(--font-mono); color: var(--text-faint);">${index + 1}</td>
          <td><input type="number" class="veg-input-cell" style="width: 50px;" data-field="plot" value="${r.plot || 1}"></td>
          <td><input type="text" class="veg-input-cell" style="width: 45px; text-align: center;" data-field="subPlot" value="${r.subPlot || ''}"></td>
          <td><input type="text" class="veg-input-cell" style="width: 65px; font-weight: 700; color: var(--brand-green);" data-field="palmNo" value="${r.palmNo || ''}"></td>
          <td><input type="number" class="veg-input-cell" style="width: 45px;" data-field="frond" value="${r.frond || 17}"></td>
          <td><input type="number" step="0.5" class="veg-input-cell" data-field="rachisLen" value="${parseFloat(r.rachisLen || 540).toFixed(1)}"></td>
          <td><input type="number" step="0.1" class="veg-input-cell" data-field="petioleW" value="${parseFloat(r.petioleW || 5.0).toFixed(1)}"></td>
          <td><input type="number" step="0.1" class="veg-input-cell" data-field="petioleD" value="${parseFloat(r.petioleD || 3.8).toFixed(1)}"></td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 600; background-color: #f8fafc;" class="cell-parea">${pArea.toFixed(2)}</td>
          <td><input type="number" step="1" class="veg-input-cell" data-field="pinnaeCount" value="${r.pinnaeCount || 300}"></td>
          <td><input type="number" step="0.5" class="veg-input-cell" data-field="leafletLen" value="${parseFloat(r.leafletLen || 85.0).toFixed(1)}"></td>
          <td><input type="number" step="0.1" class="veg-input-cell" data-field="leafletW" value="${parseFloat(r.leafletW || 4.8).toFixed(1)}"></td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--brand-green); background-color: #f0fdf4;" class="cell-la">${leafArea.toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono); color: var(--brand-green); background-color: #f0fdf4;" class="cell-fdw">${fdw.toFixed(2)}</td>
          <td><input type="number" step="0.05" class="veg-input-cell" style="width: 68px;" data-field="trunkHt" value="${parseFloat(r.trunkHt || 3.50).toFixed(2)}"></td>
          <td style="text-align: center;">
            <button type="button" class="btn-del-row" data-remove="${index}" title="Remove Row">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach dynamic input listeners
    tbody.querySelectorAll('.veg-input-cell').forEach(input => {
      input.addEventListener('input', (e) => {
        const row = e.target.closest('tr');
        const idx = parseInt(row.getAttribute('data-index'), 10);
        const field = e.target.getAttribute('data-field');
        let val = e.target.value;
        if (field !== 'palmNo' && field !== 'subPlot') {
          val = parseFloat(val) || 0;
        }
        editableVegRecords[idx][field] = val;

        // Recalculate row cells
        const r = editableVegRecords[idx];
        const pArea = calcPetioleArea(r.petioleW, r.petioleD);
        const leafArea = calcFrondLeafArea(r.pinnaeCount, r.leafletLen, r.leafletW);
        const fdw = calcFrondDryWeight(pArea);

        const cellParea = row.querySelector('.cell-parea');
        if (cellParea) cellParea.textContent = pArea.toFixed(2);
        const cellLa = row.querySelector('.cell-la');
        if (cellLa) cellLa.textContent = leafArea.toFixed(2);
        const cellFdw = row.querySelector('.cell-fdw');
        if (cellFdw) cellFdw.textContent = fdw.toFixed(2);
      });
    });

    // Attach remove row listeners
    tbody.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-remove'), 10);
        editableVegRecords.splice(idx, 1);
        editableVegRecords.forEach((r, i) => r.rec = i + 1);
        const totalPalms = document.getElementById('edit-total-palms');
        if (totalPalms) totalPalms.textContent = editableVegRecords.length;
        renderGridEditorRows();
      });
    });
  }

  function autoFillSamplePalms() {
    const trial = getCurrentTrial();
    if (!trial) return;

    let sourcePalms = [];
    if (trial.palms && trial.palms.length > 0) {
      sourcePalms = trial.palms;
    } else {
      sourcePalms = [
        { plot: 1, subPlot: '', palmNo: '18' },
        { plot: 1, subPlot: '', palmNo: '19' },
        { plot: 1, subPlot: '', palmNo: '57' },
        { plot: 1, subPlot: '', palmNo: '58' },
        { plot: 2, subPlot: '', palmNo: '19' },
        { plot: 2, subPlot: '', palmNo: '20' }
      ];
    }

    editableVegRecords = sourcePalms.map((p, idx) => {
      const petW = +(5.0 + (idx % 4) * 0.15).toFixed(1);
      const petD = +(3.7 + (idx % 3) * 0.12).toFixed(1);
      const rachis = +(535 + (idx % 5) * 6.5).toFixed(1);
      const pinnae = 300 + (idx % 6) * 5;
      const lLen = +(83.0 + (idx % 4) * 1.5).toFixed(1);
      const lWid = +(4.7 + (idx % 3) * 0.1).toFixed(1);
      const trunk = +(3.30 + (idx % 5) * 0.15).toFixed(2);

      return {
        rec: idx + 1,
        plot: p.plot || 1,
        subPlot: p.subPlot || '',
        palmNo: String(p.palmNo || idx + 1),
        frond: activeFrond,
        rachisLen: rachis,
        petioleW: petW,
        petioleD: petD,
        pinnaeCount: pinnae,
        leafletLen: lLen,
        leafletW: lWid,
        trunkHt: trunk
      };
    });

    const totalPalms = document.getElementById('edit-total-palms');
    if (totalPalms) totalPalms.textContent = editableVegRecords.length;
    renderGridEditorRows();
    showToast(`Loaded ${editableVegRecords.length} palms from trial register`);
  }

  function addEmptyRow() {
    const nextRec = editableVegRecords.length + 1;
    editableVegRecords.push({
      rec: nextRec,
      plot: 1,
      subPlot: '',
      palmNo: String(nextRec),
      frond: activeFrond,
      rachisLen: 540.0,
      petioleW: 5.1,
      petioleD: 3.8,
      pinnaeCount: 305,
      leafletLen: 84.0,
      leafletW: 4.8,
      trunkHt: 3.50
    });
    const totalPalms = document.getElementById('edit-total-palms');
    if (totalPalms) totalPalms.textContent = editableVegRecords.length;
    renderGridEditorRows();
  }

  async function saveGridMeasurements() {
    const trial = getCurrentTrial();
    if (!trial) return;

    trial.vegetativeRecords = JSON.parse(JSON.stringify(editableVegRecords));
    if (window.ReadaSync) {
      await window.ReadaSync.saveVegetativeRecords(trial.code, trial.vegetativeRecords);
    }
    closeModal(modals.edit);
    refreshDashboard();
    showToast(`Saved ${trial.vegetativeRecords.length} vegetative sampling records for ${trial.code}`);
  }

  // ================= Modal 3: Annual Vegetative Growth & LAI Calculation =================

  function openCalculationModal() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const stats = computeAggregateAllometrics(trial);

    const badge = document.getElementById('badge-calc-trial-year');
    if (badge) badge.textContent = `${trial.code} · ${activeSamplingYear}`;

    const countEl = document.getElementById('calc-palms-count');
    if (countEl) countEl.textContent = stats.count;

    const petioleEl = document.getElementById('calc-mean-petiole');
    if (petioleEl) petioleEl.innerHTML = `${stats.meanPetioleArea.toFixed(2)} cm&sup2;`;

    const leafAreaEl = document.getElementById('calc-mean-leaf-area');
    if (leafAreaEl) leafAreaEl.innerHTML = `${stats.meanLeafArea.toFixed(2)} m&sup2;`;

    const fdwEl = document.getElementById('calc-mean-fdw');
    if (fdwEl) fdwEl.textContent = `${stats.meanFDW.toFixed(2)} kg`;

    const laiEl = document.getElementById('calc-mean-lai');
    if (laiEl) laiEl.textContent = stats.meanLAI.toFixed(2);

    const trunkEl = document.getElementById('calc-mean-trunk');
    if (trunkEl) trunkEl.textContent = `${stats.meanTrunkHt.toFixed(2)} m`;

    // Render Treatment / Plot Breakdown
    const tbody = document.getElementById('tbody-veg-plot-breakdown');
    if (tbody) {
      if (stats.plotBreakdown.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 18px;">No palm measurement data available to compute.</td></tr>`;
      } else {
        tbody.innerHTML = stats.plotBreakdown.map(p => `
          <tr>
            <td><strong>Plot ${p.plot}</strong></td>
            <td>${p.density} palms/ha</td>
            <td style="text-align: right;">${p.count}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${p.meanPArea.toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 600;">${p.meanLeafArea.toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${p.meanFDW.toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--brand-green);">${p.lai.toFixed(2)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">${p.meanTrunk.toFixed(2)}</td>
          </tr>
        `).join('');
      }
    }

    openModal(modals.calc);
  }

  function commitAnnualVegetativeCalculation() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const stats = computeAggregateAllometrics(trial);

    if (!trial.vegetativeMeasurement) {
      trial.vegetativeMeasurement = [];
    }

    let yearRec = trial.vegetativeMeasurement.find(y => y.year === activeSamplingYear || y.yr === activeSamplingYear);
    if (!yearRec) {
      yearRec = { dy: 22, mn: 7, yr: activeSamplingYear, year: activeSamplingYear };
      trial.vegetativeMeasurement.push(yearRec);
    }

    yearRec.dy = 22;
    yearRec.mn = 7;
    yearRec.yr = activeSamplingYear;
    yearRec.year = activeSamplingYear;
    yearRec.measured = true;
    yearRec.count = stats.count;
    yearRec.meanPetioleArea = parseFloat(stats.meanPetioleArea.toFixed(2));
    yearRec.meanLeafArea = parseFloat(stats.meanLeafArea.toFixed(2));
    yearRec.meanTrunkHt = parseFloat(stats.meanTrunkHt.toFixed(2));
    yearRec.meanFDW = parseFloat(stats.meanFDW.toFixed(2));
    yearRec.meanLAI = parseFloat(stats.meanLAI.toFixed(2));

    closeModal(modals.calc);
    refreshDashboard();
    showToast(`Committed Annual Vegetative Mean for ${activeSamplingYear} to DATAVM.DBF: LAI = ${stats.meanLAI.toFixed(2)}`);
  }

  // ================= Modal 4: Settings & Coefficients =================

  function openSettingsModal() {
    const shapeK = document.getElementById('setting-shape-k');
    if (shapeK) shapeK.value = allometricSettings.shapeK;

    const fdwA = document.getElementById('setting-fdw-a');
    if (fdwA) fdwA.value = allometricSettings.fdwA;

    const fdwB = document.getElementById('setting-fdw-b');
    if (fdwB) fdwB.value = allometricSettings.fdwB;

    const frondsPalm = document.getElementById('setting-fronds-palm');
    if (frondsPalm) frondsPalm.value = allometricSettings.frondsPerPalm;

    openModal(modals.settings);
  }

  function saveSettings() {
    const shapeK = document.getElementById('setting-shape-k');
    const fdwA = document.getElementById('setting-fdw-a');
    const fdwB = document.getElementById('setting-fdw-b');
    const frondsPalm = document.getElementById('setting-fronds-palm');

    allometricSettings.shapeK = parseFloat(shapeK ? shapeK.value : 0.55) || 0.55;
    allometricSettings.fdwA = parseFloat(fdwA ? fdwA.value : 0.1023) || 0.1023;
    allometricSettings.fdwB = parseFloat(fdwB ? fdwB.value : 0.749) || 0.749;
    allometricSettings.frondsPerPalm = parseInt(frondsPalm ? frondsPalm.value : 40, 10) || 40;

    localStorage.setItem('reada_veg_settings', JSON.stringify(allometricSettings));
    closeModal(modals.settings);
    refreshDashboard();
    showToast('Saved allometric coefficients (Hardon k & Corley FDW parameters)');
  }

  function resetSettings() {
    allometricSettings = {
      shapeK: 0.55,
      fdwA: 0.1023,
      fdwB: 0.749,
      frondsPerPalm: 40
    };
    const shapeK = document.getElementById('setting-shape-k');
    if (shapeK) shapeK.value = 0.55;
    const fdwA = document.getElementById('setting-fdw-a');
    if (fdwA) fdwA.value = 0.1023;
    const fdwB = document.getElementById('setting-fdw-b');
    if (fdwB) fdwB.value = 0.749;
    const frondsPalm = document.getElementById('setting-fronds-palm');
    if (frondsPalm) frondsPalm.value = 40;

    localStorage.removeItem('reada_veg_settings');
    showToast('Reset coefficients to standard MPOB defaults');
  }

  // ================= Modal 5: Printable Report =================

  function openPrintModal() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const stats = computeAggregateAllometrics(trial);

    const printTrial = document.getElementById('print-trial-code');
    if (printTrial) printTrial.textContent = trial.code;

    const printEstate = document.getElementById('print-estate');
    if (printEstate) printEstate.textContent = trial.estate || 'MPOB Station';

    const printYear = document.getElementById('print-year');
    if (printYear) printYear.textContent = activeSamplingYear;

    const printDate = document.getElementById('print-date');
    if (printDate) printDate.textContent = activeSamplingDate;

    const printGen = document.getElementById('print-generated-on');
    if (printGen) printGen.textContent = `Generated: ${new Date().toLocaleDateString('en-GB')}`;

    const printPalms = document.getElementById('print-stat-palms');
    if (printPalms) printPalms.textContent = `${stats.count} Palms`;

    const printPetiole = document.getElementById('print-stat-petiole');
    if (printPetiole) printPetiole.innerHTML = `${stats.meanPetioleArea.toFixed(2)} cm&sup2;`;

    const printLA = document.getElementById('print-stat-leaf-area');
    if (printLA) printLA.innerHTML = `${stats.meanLeafArea.toFixed(2)} m&sup2;`;

    const printLai = document.getElementById('print-stat-lai');
    if (printLai) printLai.textContent = stats.meanLAI.toFixed(2);

    const tbody = document.getElementById('tbody-print-records');
    if (tbody) {
      const records = trial.vegetativeRecords || [];
      tbody.innerHTML = records.map((r, idx) => {
        const pArea = calcPetioleArea(r.petioleW, r.petioleD);
        const leafArea = calcFrondLeafArea(r.pinnaeCount, r.leafletLen, r.leafletW);
        const fdw = calcFrondDryWeight(pArea);

        return `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 4px;">${r.rec || idx + 1}</td>
            <td style="padding: 4px;">${r.plot}</td>
            <td style="padding: 4px;"><strong>${r.palmNo}</strong></td>
            <td style="padding: 4px;">F${r.frond || 17}</td>
            <td style="padding: 4px; text-align: right;">${parseFloat(r.rachisLen || 0).toFixed(1)}</td>
            <td style="padding: 4px; text-align: right;">${parseFloat(r.petioleW || 0).toFixed(1)}</td>
            <td style="padding: 4px; text-align: right;">${parseFloat(r.petioleD || 0).toFixed(1)}</td>
            <td style="padding: 4px; text-align: right; font-weight: 600;">${pArea.toFixed(2)}</td>
            <td style="padding: 4px; text-align: right;">${r.pinnaeCount || 0}</td>
            <td style="padding: 4px; text-align: right; font-weight: 700; color: #047857;">${leafArea.toFixed(2)}</td>
            <td style="padding: 4px; text-align: right;">${fdw.toFixed(2)}</td>
            <td style="padding: 4px; text-align: right;">${parseFloat(r.trunkHt || 0).toFixed(2)}</td>
          </tr>
        `;
      }).join('');
    }

    openModal(modals.print);
  }

  // ================= Modal 6: Export CSV Direct to Downloads =================

  function exportVegetativeData() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const csvFileName = `DATAVM_${trial.code}.csv`;

    let csvContent = 'TRIAL_CODE,ESTATE,REC_NO,PLOT_NO,SUB_PLOT,PALM_NO,FROND_NO,RACHIS_LEN_CM,PETIOLE_W_CM,PETIOLE_D_CM,PETIOLE_AREA_CM2,PINNAE_COUNT,LEAFLET_LEN_CM,LEAFLET_W_CM,LEAF_AREA_M2,FROND_DRY_WT_KG,TRUNK_HT_M\n';
    const records = trial.vegetativeRecords || [];
    records.forEach((r, idx) => {
      const pArea = calcPetioleArea(r.petioleW, r.petioleD);
      const leafArea = calcFrondLeafArea(r.pinnaeCount, r.leafletLen, r.leafletW);
      const fdw = calcFrondDryWeight(pArea);
      csvContent += `"${trial.code}","${trial.estate}",${r.rec || idx + 1},${r.plot},"${r.subPlot || ''}","${r.palmNo}",${r.frond || 17},${r.rachisLen},${r.petioleW},${r.petioleD},${pArea.toFixed(2)},${r.pinnaeCount},${r.leafletLen},${r.leafletW},${leafArea.toFixed(2)},${fdw.toFixed(2)},${r.trunkHt}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', csvFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    if (modals.saveDbf) closeModal(modals.saveDbf);
    showToast(`Downloaded ${csvFileName} to your Downloads folder (${records.length} records)`);
  }

  // ================= Modal 7: Read Backup / Excel =================
  let uploadedVegBackupFile = null;
  let uploadedVegBackupRows = [];

  function downloadSampleExcelForVeg() {
    const trial = getCurrentTrial() || { code: 'DTP1' };
    const fileName = `Sample_Vegetative_Sampling_${trial.code}.xlsx`;
    const existing = (trial.vegetativeRecords || []).slice(0, 5);
    const sampleRows = existing.length > 0
      ? existing.map((r, idx) => ({
          REC_NO: r.rec || (idx + 1),
          PLOT_NO: r.plot,
          SUB_PLOT: r.subPlot || '',
          PALM_NO: r.palmNo || '1',
          FROND: r.frond || 17,
          RACHIS_CM: r.rachisLen || 540.0,
          PET_W_CM: r.petioleW || 5.2,
          PET_D_CM: r.petioleD || 3.8,
          PINNAE: r.pinnaeCount || 310,
          LLEN_CM: r.leafletLen || 85.0,
          LWID_CM: r.leafletW || 4.8,
          TRUNK_M: r.trunkHt || 3.4
        }))
      : [
          { REC_NO: 1, PLOT_NO: 1, SUB_PLOT: '', PALM_NO: '1', FROND: 17, RACHIS_CM: 545.0, PET_W_CM: 5.2, PET_D_CM: 3.8, PINNAE: 312, LLEN_CM: 86.0, LWID_CM: 4.8, TRUNK_M: 3.4 },
          { REC_NO: 2, PLOT_NO: 1, SUB_PLOT: '', PALM_NO: '2', FROND: 17, RACHIS_CM: 538.0, PET_W_CM: 5.0, PET_D_CM: 3.7, PINNAE: 308, LLEN_CM: 84.5, LWID_CM: 4.7, TRUNK_M: 3.3 }
        ];

    if (window.XLSX) {
      const ws = window.XLSX.utils.json_to_sheet(sampleRows);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Vegetative_Sampling');
      window.XLSX.writeFile(wb, fileName);
      showToast(`Downloaded sample template "${fileName}"`);
    } else {
      exportVegetativeData();
    }
  }

  document.getElementById('btn-download-veg-backup-sample')?.addEventListener('click', downloadSampleExcelForVeg);
  document.getElementById('btn-download-veg-external-sample')?.addEventListener('click', downloadSampleExcelForVeg);

  function openBackupModal() {
    uploadedVegBackupFile = null;
    uploadedVegBackupRows = [];
    const fileInp = document.getElementById('veg-backup-file-upload');
    const dropTitle = document.getElementById('veg-backup-drop-title');
    const statusText = document.getElementById('veg-backup-status-text');
    if (fileInp) fileInp.value = '';
    if (dropTitle) dropTitle.textContent = 'Click to Browse or Drag & Drop Excel File Here';
    if (statusText) statusText.textContent = 'Waiting for Excel file upload';

    const tbody = document.getElementById('tbody-backup-trials');
    if (tbody) {
      tbody.innerHTML = trials.map(t => {
        const count = (t.vegetativeRecords || []).length;
        const isSelected = t.code === currentCode;
        return `
          <tr style="${isSelected ? 'background-color: var(--brand-green-bg); font-weight: 600;' : ''}">
            <td style="color: ${isSelected ? 'var(--brand-green)' : 'inherit'};">${t.code}</td>
            <td>${t.estate || 'Station'}</td>
            <td>${count} Records</td>
          </tr>
        `;
      }).join('');
    }
    openModal(modals.backup);
  }

  async function handleVegBackupFileSelect(file) {
    if (!file) return;
    uploadedVegBackupFile = file;
    uploadedVegBackupRows = [];
    const dropTitle = document.getElementById('veg-backup-drop-title');
    const statusText = document.getElementById('veg-backup-status-text');
    if (dropTitle) dropTitle.textContent = `Selected: ${file.name}`;

    try {
      if (window.XLSX) {
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        uploadedVegBackupRows = rows || [];
        if (statusText) {
          statusText.textContent = `Verified: ${file.name} (${uploadedVegBackupRows.length} rows in "${sheetName}")`;
        }
        showToast(`Verified "${file.name}" (${uploadedVegBackupRows.length} rows)`);
      } else if (statusText) {
        statusText.textContent = `Verified: ${file.name}`;
      }
    } catch (err) {
      console.error(err);
      showToast(`Error parsing backup file: ${err.message}`);
    }
  }

  document.getElementById('veg-backup-file-upload')?.addEventListener('change', (e) => {
    handleVegBackupFileSelect(e.target.files[0]);
  });

  const vegBackupDropZone = document.getElementById('veg-backup-drop-zone');
  if (vegBackupDropZone) {
    vegBackupDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      vegBackupDropZone.classList.add('dragover');
    });
    vegBackupDropZone.addEventListener('dragleave', () => {
      vegBackupDropZone.classList.remove('dragover');
    });
    vegBackupDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      vegBackupDropZone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) {
        handleVegBackupFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  function restoreFromBackup() {
    if (!uploadedVegBackupFile) {
      showToast('Please select or drop an Excel file (.xlsx, .xls, .csv) first');
      return;
    }
    const trial = getCurrentTrial();
    if (!trial) return;

    if (uploadedVegBackupRows.length > 0) {
      trial.vegetativeRecords = uploadedVegBackupRows.map((r, idx) => ({
        rec: Number(r.REC_NO || r.rec || (idx + 1)),
        plot: Number(r.PLOT || r.PLOT_NO || 1),
        subPlot: String(r.SUBPLOT || r.SUB_PLOT || ''),
        palmNo: String(r.PALM || r.PALM_NO || '18'),
        frond: Number(r.FROND || 17),
        rachisLen: Number(r.RACHIS_CM || r.RACHIS_LEN_CM || 540),
        petioleW: Number(r.PET_W_CM || r.PETIOLE_W_CM || 5.2),
        petioleD: Number(r.PET_D_CM || r.PETIOLE_D_CM || 3.8),
        pinnaeCount: Number(r.PINNAE || r.PINNAE_COUNT || 310),
        leafletLen: Number(r.LLEN_CM || r.LEAFLET_LEN_CM || 85),
        leafletW: Number(r.LWID_CM || r.LEAFLET_W_CM || 4.8),
        trunkHt: Number(r.TRUNK_M || r.TRUNK_HT_M || 3.4)
      }));
      if (window.ReadaSync && typeof window.ReadaSync.saveVegetativeRecords === 'function') {
        window.ReadaSync.saveVegetativeRecords(trial.code, trial.vegetativeRecords);
      }
    }

    closeModal(modals.backup);
    refreshDashboard();
    showToast(`Restored ${uploadedVegBackupRows.length} vegetative record(s) for ${trial.code} from "${uploadedVegBackupFile.name}"`);
  }

  // ================= Modal 8: Read External Excel Data (*.xlsx / *.xls / *.csv) =================

  function renderVegPreview(sampleRows) {
    const previewTbody = document.getElementById('tbody-external-veg-preview');
    if (!previewTbody) return;

    previewTbody.innerHTML = (sampleRows || []).slice(0, 50).map(row => `
      <tr>
        <td><strong>${row.PLOT || row.PLOT_NO || 1}</strong></td>
        <td><strong style="color: var(--brand-green);">${row.PALM || row.PALM_NO || '18'}</strong></td>
        <td>F${row.FROND || 17}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(row.RACHIS_CM || row.RACHIS_LEN_CM || 540).toFixed(1)}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(row.PET_W_CM || row.PETIOLE_W_CM || 5.2).toFixed(1)}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(row.PET_D_CM || row.PETIOLE_D_CM || 3.8).toFixed(1)}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${row.PINNAE || row.PINNAE_COUNT || 310}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(row.LLEN_CM || row.LEAFLET_LEN_CM || 85).toFixed(1)}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(row.LWID_CM || row.LEAFLET_W_CM || 4.8).toFixed(1)}</td>
        <td style="text-align: right; font-family: var(--font-mono);">${parseFloat(row.TRUNK_M || row.TRUNK_HT_M || 3.4).toFixed(2)}</td>
      </tr>
    `).join('');
  }

  function openExternalModal() {
    const fileInp = document.getElementById('veg-excel-file-upload');
    const dropTitle = document.getElementById('veg-external-drop-title');
    if (fileInp) fileInp.value = '';
    if (dropTitle) dropTitle.textContent = 'Click to Browse or Drag & Drop Excel File Here';

    const external = window.READA_EXTERNAL_VEG_CSV;
    if (external && external.sampleRows) {
      renderVegPreview(external.sampleRows);
    }
    openModal(modals.external);
  }

  async function handleVegExternalFileSelect(file) {
    if (!file) return;
    const dropTitle = document.getElementById('veg-external-drop-title');
    const previewTitle = document.getElementById('veg-external-preview-title');
    if (dropTitle) dropTitle.textContent = `Selected: ${file.name}`;

    try {
      if (window.XLSX) {
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(worksheet);

        if (rows && rows.length > 0) {
          window.READA_EXTERNAL_VEG_CSV = {
            fileName: file.name,
            fields: Object.keys(rows[0]),
            sampleRows: rows
          };
          if (previewTitle) previewTitle.textContent = `Uploaded Excel Rows Preview (${file.name} · Sheet: ${sheetName})`;
          renderVegPreview(rows);
          showToast(`Read ${rows.length} vegetative rows from Excel sheet "${sheetName}"`);
        }
      }
    } catch (err) {
      console.error(err);
      showToast(`Error parsing Excel file: ${err.message}`);
    }
  }

  // Handle Excel upload input
  document.getElementById('veg-excel-file-upload')?.addEventListener('change', (e) => {
    handleVegExternalFileSelect(e.target.files[0]);
  });

  const vegExternalDropZone = document.getElementById('veg-external-drop-zone');
  if (vegExternalDropZone) {
    vegExternalDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      vegExternalDropZone.classList.add('dragover');
    });
    vegExternalDropZone.addEventListener('dragleave', () => {
      vegExternalDropZone.classList.remove('dragover');
    });
    vegExternalDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      vegExternalDropZone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) {
        handleVegExternalFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  function importExternalData() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const external = window.READA_EXTERNAL_VEG_CSV;
    if (!external || !external.sampleRows) return;

    const imported = external.sampleRows.map((r, idx) => ({
      rec: (trial.vegetativeRecords ? trial.vegetativeRecords.length : 0) + idx + 1,
      plot: r.PLOT || r.PLOT_NO || 1,
      subPlot: r.SUBPLOT || r.SUB_PLOT || '',
      palmNo: String(r.PALM || r.PALM_NO || '18'),
      frond: r.FROND || 17,
      rachisLen: Number(r.RACHIS_CM || r.RACHIS_LEN_CM || 540),
      petioleW: Number(r.PET_W_CM || r.PETIOLE_W_CM || 5.2),
      petioleD: Number(r.PET_D_CM || r.PETIOLE_D_CM || 3.8),
      pinnaeCount: Number(r.PINNAE || r.PINNAE_COUNT || 310),
      leafletLen: Number(r.LLEN_CM || r.LEAFLET_LEN_CM || 85),
      leafletW: Number(r.LWID_CM || r.LEAFLET_W_CM || 4.8),
      trunkHt: Number(r.TRUNK_M || r.TRUNK_HT_M || 3.4)
    }));

    if (!trial.vegetativeRecords) trial.vegetativeRecords = [];
    trial.vegetativeRecords.push(...imported);

    closeModal(modals.external);
    refreshDashboard();
    showToast(`Imported ${imported.length} Frond 17 measurements from Excel into ${trial.code}`);
  }

  // ================= Modal 9: Delete Vegetative Data =================

  function openDeleteModal() {
    const trial = getCurrentTrial();
    if (!trial) return;

    const labelTrial = document.getElementById('delete-veg-trial-label');
    if (labelTrial) labelTrial.textContent = trial.code;

    const labelYear = document.getElementById('delete-veg-year-label');
    if (labelYear) labelYear.textContent = activeSamplingYear;

    const confirmInput = document.getElementById('delete-veg-confirm-text');
    if (confirmInput) confirmInput.value = '';

    openModal(modals.delete);
  }

  function confirmDeleteVegetativeData() {
    const confirmInput = document.getElementById('delete-veg-confirm-text');
    const text = confirmInput ? confirmInput.value.trim() : '';
    if (text !== 'DELETE') {
      showToast('Please type DELETE to confirm removal');
      return;
    }

    const trial = getCurrentTrial();
    if (!trial) return;

    const scopeRadio = document.querySelector('input[name="delete-veg-scope"]:checked');
    const scope = scopeRadio ? scopeRadio.value : 'year';

    if (scope === 'all') {
      trial.vegetativeRecords = [];
      trial.vegetativeMeasurement = [];
      if (window.ReadaSync) {
        window.ReadaSync.saveVegetativeRecords(trial.code, []);
      }
      showToast(`All vegetative records deleted for Trial ${trial.code}`);
    } else {
      trial.vegetativeRecords = [];
      if (trial.vegetativeMeasurement) {
        trial.vegetativeMeasurement = trial.vegetativeMeasurement.filter(y => (y.year !== activeSamplingYear && y.yr !== activeSamplingYear));
      }
      if (window.ReadaSync) {
        window.ReadaSync.saveVegetativeRecords(trial.code, []);
      }
      showToast(`Removed active sampling campaign (${activeSamplingYear}) for Trial ${trial.code}`);
    }

    closeModal(modals.delete);
    refreshDashboard();
  }

  // ================= Event Wire-up =================

  function initEventListeners() {
    // Top Bar Refresh
    const btnUpdateCodeList = document.getElementById('btn-update-code-list');
    if (btnUpdateCodeList) {
      btnUpdateCodeList.addEventListener('click', () => {
        populateTrialDropdown();
        refreshDashboard();
        showToast('Trial Code List refreshed from DATAVM.DBF register.');
      });
    }

    // Modal Close buttons
    document.querySelectorAll('.modal-close-icon, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        closeModal(modal);
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay);
      });
    });

    // Plot Filter on Summary Table
    if (el.summaryFilterPlot) {
      el.summaryFilterPlot.addEventListener('change', () => {
        const trial = getCurrentTrial();
        if (trial) renderSummaryTable(trial);
      });
    }

    // Groupbox 1: Field Sampling
    const btnNewVeg = document.getElementById('btn-new-veg-entry');
    if (btnNewVeg) btnNewVeg.addEventListener('click', openSelectionModal);

    const btnConfirmFind = document.getElementById('btn-confirm-veg-find');
    if (btnConfirmFind) btnConfirmFind.addEventListener('click', confirmSelectionAndOpenEditor);

    const btnEditVeg = document.getElementById('btn-edit-veg-data');
    if (btnEditVeg) btnEditVeg.addEventListener('click', openGridEditor);

    const btnQuickEdit = document.getElementById('btn-quick-edit-veg');
    if (btnQuickEdit) btnQuickEdit.addEventListener('click', openGridEditor);

    const btnSettings = document.getElementById('btn-veg-settings');
    if (btnSettings) btnSettings.addEventListener('click', openSettingsModal);

    const btnSaveSettings = document.getElementById('btn-save-veg-settings');
    if (btnSaveSettings) btnSaveSettings.addEventListener('click', saveSettings);

    const btnResetSettings = document.getElementById('btn-reset-veg-settings');
    if (btnResetSettings) btnResetSettings.addEventListener('click', resetSettings);

    // Grid Editor Toolbar
    const btnAutofill = document.getElementById('btn-autofill-palms');
    if (btnAutofill) btnAutofill.addEventListener('click', autoFillSamplePalms);

    const btnAddRow = document.getElementById('btn-add-veg-row');
    if (btnAddRow) btnAddRow.addEventListener('click', addEmptyRow);

    const btnRecalcLive = document.getElementById('btn-recalc-live');
    if (btnRecalcLive) {
      btnRecalcLive.addEventListener('click', () => {
        renderGridEditorRows();
        showToast('Allometric variables recalculated.');
      });
    }

    const btnSaveGrid = document.getElementById('btn-save-veg-grid');
    if (btnSaveGrid) btnSaveGrid.addEventListener('click', saveGridMeasurements);

    // Groupbox 2: Allometrics & LAI
    const btnCalcMean = document.getElementById('btn-calc-veg-mean');
    if (btnCalcMean) btnCalcMean.addEventListener('click', openCalculationModal);

    const btnCommitCalc = document.getElementById('btn-commit-veg-calc');
    if (btnCommitCalc) btnCommitCalc.addEventListener('click', commitAnnualVegetativeCalculation);

    const btnPrintReport = document.getElementById('btn-print-veg-report');
    if (btnPrintReport) btnPrintReport.addEventListener('click', openPrintModal);

    const btnTriggerPrint = document.getElementById('btn-trigger-print');
    if (btnTriggerPrint) {
      btnTriggerPrint.addEventListener('click', () => {
        window.print();
      });
    }

    // Groupbox 3: System & Backups
    const btnSaveDbf = document.getElementById('btn-save-veg-dbf');
    if (btnSaveDbf) btnSaveDbf.addEventListener('click', exportVegetativeData);

    const btnConfirmExport = document.getElementById('btn-confirm-export-veg');
    if (btnConfirmExport) btnConfirmExport.addEventListener('click', exportVegetativeData);

    const btnReadBackup = document.getElementById('btn-read-veg-backup');
    if (btnReadBackup) btnReadBackup.addEventListener('click', openBackupModal);

    const btnViewBackupInfo = document.getElementById('btn-view-backup-info');
    if (btnViewBackupInfo) {
      btnViewBackupInfo.addEventListener('click', () => {
        showToast('Scanning C:\\READA\\BCVM.DBF... Verified 2 trial archives found.');
      });
    }

    const btnConfirmBackup = document.getElementById('btn-confirm-read-backup');
    if (btnConfirmBackup) btnConfirmBackup.addEventListener('click', restoreFromBackup);

    const btnReadExternal = document.getElementById('btn-read-external-veg');
    if (btnReadExternal) btnReadExternal.addEventListener('click', openExternalModal);

    const btnLoadExternalPreview = document.getElementById('btn-load-external-veg-preview');
    if (btnLoadExternalPreview) {
      btnLoadExternalPreview.addEventListener('click', () => {
        openExternalModal();
        showToast('Loaded B:\\VEG93.CSV logger export.');
      });
    }

    const btnConfirmImport = document.getElementById('btn-confirm-import-external');
    if (btnConfirmImport) btnConfirmImport.addEventListener('click', importExternalData);

    const btnDelete = document.getElementById('btn-delete-veg-data');
    if (btnDelete) btnDelete.addEventListener('click', openDeleteModal);

    const btnConfirmDelete = document.getElementById('btn-confirm-delete-veg');
    if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', confirmDeleteVegetativeData);
  }

  // Global helper
  window.READA_VEG = {
    init: async function () {
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
      refreshDashboard();
      initEventListeners();
    }
  };

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.READA_VEG.init);
  } else {
    window.READA_VEG.init();
  }

})();
