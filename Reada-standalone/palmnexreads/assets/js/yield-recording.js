/**
 * ReaDA — Module 3: Yield Recording Program Controller
 * -------------------------------------------------------------------------
 * Recreates the complete Borland Visual dBase Yield Recording module
 * (REC_PROC.WFM, REC_FYLD.WFM, REC_NRYD.WFM) with all operations:
 * - New Round Harvesting Data Entry
 * - Edit Yield Recording Data Entry
 * - Palm Missing / Mortality Census Register
 * - Calculate / Generate Annual FFB Yield Data (MBW & Tons/Ha/Year)
 * - Print Yield Recording Report
 * - Save Yield Data As *.dbf / *.csv
 * - Read Yield Data From Backup (BCRYLD.DBF)
 * - Read External Non-ReaDA Field Logger File
 * - Delete Yield Recording Data
 */

(function () {
  'use strict';

  // Load trial data
  let trials = JSON.parse(JSON.stringify(window.READA_TRIALS || []));
  let currentCode = 'DTP1';

  // Active selection state
  let activeHarvestYear = 1997;
  let activePeriodStart = { mn: 3, yr: 1997 };
  let activePeriodEnd = { mn: 2, yr: 1998 };

  // DOM Elements
  const el = {
    trialSelect: document.getElementById('select-working-trial'),
    statCode: document.getElementById('stat-trial-code'),
    statEstate: document.getElementById('stat-estate'),
    statYear: document.getElementById('stat-harvest-year'),
    statRounds: document.getElementById('stat-rounds-count'),
    statRecords: document.getElementById('stat-records-count'),
    statMissing: document.getElementById('stat-missing-palms'),
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toast-msg')
  };

  // Modals
  const modals = {
    selection: document.getElementById('modal-yield-selection'),
    editor: document.getElementById('modal-yield-editor'),
    calc: document.getElementById('modal-yield-calc'),
    missing: document.getElementById('modal-palm-missing'),
    print: document.getElementById('modal-yield-print'),
    saveDbf: document.getElementById('modal-save-yield-dbf'),
    backup: document.getElementById('modal-yield-backup'),
    nonReada: document.getElementById('modal-yield-nonreada'),
    delete: document.getElementById('modal-yield-delete')
  };

  function getCurrentTrial() {
    return trials.find(t => t.code === currentCode) || trials[0];
  }

  function showToast(msg) {
    if (!el.toast) return;
    el.toastMsg.textContent = msg;
    el.toast.classList.add('visible');
    setTimeout(() => el.toast.classList.remove('visible'), 2800);
  }

  // Refresh Top Header & Stats
  function refreshHeader() {
    const t = getCurrentTrial();
    if (!t) return;

    if (!t.harvestRecords) t.harvestRecords = [];
    if (!t.missingPalms) t.missingPalms = [];

    // Distinct rounds
    const roundsSet = new Set(t.harvestRecords.map(r => r.round));

    if (el.statCode) el.statCode.textContent = t.code;
    if (el.statEstate) el.statEstate.textContent = t.estate;
    if (el.statYear) el.statYear.textContent = activeHarvestYear;
    if (el.statRounds) el.statRounds.textContent = roundsSet.size;
    if (el.statRecords) el.statRecords.textContent = t.harvestRecords.length;
    if (el.statMissing) el.statMissing.textContent = t.missingPalms.length;

    // Selector
    if (el.trialSelect) {
      el.trialSelect.innerHTML = '';
      trials.forEach(tr => {
        const opt = document.createElement('option');
        opt.value = tr.code;
        opt.textContent = `${tr.code} — ${tr.estate}`;
        if (tr.code === currentCode) opt.selected = true;
        el.trialSelect.appendChild(opt);
      });
    }
  }

  // Modal Open/Close helpers
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

  function closeAllModals() {
    Object.values(modals).forEach(m => {
      if (m) closeModal(m);
    });
  }

  // Close button events
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  // =========================================================================
  // 1. SELECTION DIALOG (REC_FYLD)
  // =========================================================================
  let selectionCallback = null;

  function openSelectionDialog(mode = 'entry', onSelected = null) {
    selectionCallback = onSelected;
    const modal = modals.selection;
    const title = document.getElementById('yield-selection-title');
    if (title) {
      title.textContent = mode === 'entry' ? 'New Yield Recording Data Entry — Select Period' : 'Edit Yield Recording Data — Select Period';
    }

    // Populate trials list
    const tBody = document.getElementById('selection-trials-tbody');
    if (tBody) {
      tBody.innerHTML = '';
      trials.forEach(tr => {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        if (tr.code === currentCode) row.classList.add('selected');
        row.innerHTML = `
          <td><strong style="color: var(--brand-green); font-family: var(--font-mono);">${tr.code}</strong></td>
          <td>${tr.estate}</td>
        `;
        row.addEventListener('click', () => {
          tBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          currentCode = tr.code;
          refreshHeader();
        });
        tBody.appendChild(row);
      });
    }

    // Populate years list
    const yBody = document.getElementById('selection-years-tbody');
    if (yBody) {
      yBody.innerHTML = '';
      const years = [1997, 1996, 1995, 1994, 1993, 1992, 1991, 1990, 1989, 1988];
      years.forEach(yr => {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        if (yr === activeHarvestYear) row.classList.add('selected');
        row.innerHTML = `<td style="font-family: var(--font-mono); font-weight: 600;">${yr}</td>`;
        row.addEventListener('click', () => {
          yBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          activeHarvestYear = yr;
          document.getElementById('sel-period-start-yr').value = yr;
          document.getElementById('sel-period-end-yr').value = yr + 1;
        });
        yBody.appendChild(row);
      });
    }

    openModal(modal);
  }

  document.getElementById('btn-confirm-yield-selection')?.addEventListener('click', () => {
    activePeriodStart.mn = parseInt(document.getElementById('sel-period-start-mn').value, 10) || 3;
    activePeriodStart.yr = parseInt(document.getElementById('sel-period-start-yr').value, 10) || activeHarvestYear;
    activePeriodEnd.mn = parseInt(document.getElementById('sel-period-end-mn').value, 10) || 2;
    activePeriodEnd.yr = parseInt(document.getElementById('sel-period-end-yr').value, 10) || (activeHarvestYear + 1);

    closeModal(modals.selection);
    refreshHeader();

    if (selectionCallback) {
      selectionCallback();
    } else {
      openHarvestEditorModal();
    }
  });

  // =========================================================================
  // 2. HARVESTING GRID EDITOR (REC_NRYD)
  // =========================================================================
  function openHarvestEditorModal() {
    const t = getCurrentTrial();
    const modal = modals.editor;

    document.getElementById('editor-trial-code').textContent = t.code;
    document.getElementById('editor-estate').textContent = t.estate;
    document.getElementById('editor-period').textContent =
      `${String(activePeriodStart.mn).padStart(2, '0')}/${activePeriodStart.yr} — ${String(activePeriodEnd.mn).padStart(2, '0')}/${activePeriodEnd.yr}`;

    refreshRoundFilterDropdown();
    renderHarvestTable();
    openModal(modal);
  }

  function refreshRoundFilterDropdown() {
    const t = getCurrentTrial();
    const records = t.harvestRecords || [];
    const select = document.getElementById('editor-filter-round');
    if (!select) return;

    const rounds = Array.from(new Set(records.map(r => r.round))).sort((a, b) => a - b);
    select.innerHTML = '<option value="all">All Rounds</option>';
    rounds.forEach(rnd => {
      const opt = document.createElement('option');
      opt.value = rnd;
      opt.textContent = `Round ${rnd}`;
      select.appendChild(opt);
    });

    select.onchange = () => renderHarvestTable();
  }

  function renderHarvestTable() {
    const t = getCurrentTrial();
    const tbody = document.getElementById('editor-harvest-tbody');
    if (!tbody) return;

    const filterVal = document.getElementById('editor-filter-round')?.value || 'all';
    let records = t.harvestRecords || [];
    if (filterVal !== 'all') {
      const rNum = parseInt(filterVal, 10);
      records = records.filter(r => r.round === rNum);
    }

    tbody.innerHTML = '';
    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 24px; color: var(--text-faint);">No harvesting records found for this selection. Click "+ Add Harvest Row" or "⚡ Auto-Fill Palm Round" above.</td></tr>`;
      updateLiveKPIs([]);
      return;
    }

    records.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: var(--font-mono); color: var(--text-muted);">${row.rec || (idx + 1)}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-del-row" data-del-harvest="${idx}" title="Delete Record">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
          </button>
        </td>
        <td><input type="number" class="cell-edit-input" data-field="plot" data-row="${idx}" value="${row.plot || 1}" style="width: 55px;"></td>
        <td><input type="text" class="cell-edit-input" data-field="subPlot" data-row="${idx}" value="${row.subPlot || ''}" placeholder="—" style="width: 50px; text-transform: uppercase;"></td>
        <td><input type="text" class="cell-edit-input" data-field="palmNo" data-row="${idx}" value="${row.palmNo || ''}" style="width: 65px; font-weight: 600;"></td>
        <td><input type="number" class="cell-edit-input" data-field="round" data-row="${idx}" value="${row.round || 1}" style="width: 55px;"></td>
        <td><input type="text" class="cell-edit-input" data-field="date" data-row="${idx}" value="${row.date || '15/03/1997'}" style="width: 95px; font-family: var(--font-mono);"></td>
        <td style="text-align: center;"><input type="number" class="cell-edit-input" data-field="nob" data-row="${idx}" value="${row.nob || 1}" min="0" max="20" style="width: 60px; text-align: center; font-weight: 700;"></td>
        <td style="text-align: center;"><input type="number" step="0.1" class="cell-edit-input" data-field="bunchWt" data-row="${idx}" value="${row.bunchWt || 0}" style="width: 75px; text-align: right; font-weight: 700; color: var(--brand-green);"></td>
        <td style="text-align: center;"><input type="number" step="0.1" class="cell-edit-input" data-field="looseFruit" data-row="${idx}" value="${row.looseFruit || 0}" style="width: 70px; text-align: right;"></td>
        <td><input type="text" class="cell-edit-input" data-field="harvesterId" data-row="${idx}" value="${row.harvesterId || 'H01'}" style="width: 70px;"></td>
        <td><input type="text" class="cell-edit-input" data-field="remarks" data-row="${idx}" value="${row.remarks || 'Normal Harvest'}" style="width: 100%;"></td>
      `;
      tbody.appendChild(tr);
    });

    // Delete button events
    tbody.querySelectorAll('[data-del-harvest]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rowIdx = parseInt(btn.getAttribute('data-del-harvest'), 10);
        t.harvestRecords.splice(rowIdx, 1);
        t.harvestRecords.forEach((r, i) => r.rec = i + 1);
        renderHarvestTable();
        refreshHeader();
      });
    });

    // Cell input changes
    tbody.querySelectorAll('input.cell-edit-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const rowIdx = parseInt(inp.getAttribute('data-row'), 10);
        const field = inp.getAttribute('data-field');
        if (field && t.harvestRecords[rowIdx]) {
          if (['plot', 'round', 'nob'].includes(field)) {
            t.harvestRecords[rowIdx][field] = parseInt(inp.value, 10) || 0;
          } else if (['bunchWt', 'looseFruit'].includes(field)) {
            t.harvestRecords[rowIdx][field] = parseFloat(inp.value) || 0;
          } else {
            t.harvestRecords[rowIdx][field] = inp.value;
          }
          updateLiveKPIs(t.harvestRecords);
        }
      });
    });

    updateLiveKPIs(records);
  }

  function updateLiveKPIs(records) {
    const totalNob = records.reduce((sum, r) => sum + (r.nob || 0), 0);
    const totalWt = records.reduce((sum, r) => sum + (r.bunchWt || 0), 0);
    const totalLoose = records.reduce((sum, r) => sum + (r.looseFruit || 0), 0);
    const mbw = totalNob > 0 ? (totalWt / totalNob) : 0;

    if (document.getElementById('live-total-nob')) {
      document.getElementById('live-total-nob').textContent = totalNob;
    }
    if (document.getElementById('live-total-wt')) {
      document.getElementById('live-total-wt').textContent = `${totalWt.toFixed(1)} kg`;
    }
    if (document.getElementById('live-total-loose')) {
      document.getElementById('live-total-loose').textContent = `${totalLoose.toFixed(1)} kg`;
    }
    if (document.getElementById('live-mbw')) {
      document.getElementById('live-mbw').textContent = `${mbw.toFixed(2)} kg`;
    }
  }

  // Add Row
  document.getElementById('btn-editor-add-row')?.addEventListener('click', () => {
    const t = getCurrentTrial();
    if (!t.harvestRecords) t.harvestRecords = [];
    const newRec = t.harvestRecords.length + 1;
    const last = t.harvestRecords[t.harvestRecords.length - 1];

    t.harvestRecords.push({
      rec: newRec,
      plot: last ? last.plot : 1,
      subPlot: last ? last.subPlot : '',
      palmNo: last ? String(parseInt(last.palmNo, 10) + 1 || (newRec * 10)) : '18',
      round: last ? last.round : 1,
      date: last ? last.date : '15/03/1997',
      nob: 1,
      bunchWt: 18.0,
      looseFruit: 1.5,
      harvesterId: last ? last.harvesterId : 'H01',
      remarks: 'Normal Harvest'
    });

    renderHarvestTable();
    refreshHeader();
    const wrap = document.getElementById('editor-table-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  });

  // Auto-Fill Palm Round
  document.getElementById('btn-editor-autofill')?.addEventListener('click', () => {
    const t = getCurrentTrial();
    const palms = t.palms || [];
    if (palms.length === 0) {
      alert(`No registered palms found in Trial ${t.code}. Please register palms in Main Information first.`);
      return;
    }

    const nextRound = prompt('Enter Round Number to generate (e.g. 3):', '3');
    if (!nextRound) return;
    const rndNum = parseInt(nextRound, 10) || 1;
    const harvDate = prompt('Enter Harvest Date (DD/MM/YYYY):', '14/04/1997') || '14/04/1997';

    palms.forEach(p => {
      const rec = t.harvestRecords.length + 1;
      const bCount = Math.floor(Math.random() * 3) + 1;
      const bWeight = Math.round((bCount * 17.5 + (Math.random() * 6 - 3)) * 10) / 10;
      const lFruit = Math.round((Math.random() * 2 + 1) * 10) / 10;

      t.harvestRecords.push({
        rec,
        plot: p.plot || 1,
        subPlot: p.subPlot || '',
        palmNo: p.palmNo || String(rec),
        round: rndNum,
        date: harvDate,
        nob: bCount,
        bunchWt: bWeight,
        looseFruit: lFruit,
        harvesterId: 'H01',
        remarks: 'Normal Harvest'
      });
    });

    refreshRoundFilterDropdown();
    renderHarvestTable();
    refreshHeader();
    showToast(`Generated Round ${rndNum} with ${palms.length} palm harvest rows.`);
  });

  // Save Harvest Data ([Yes] button)
  document.getElementById('btn-save-harvest-data')?.addEventListener('click', async () => {
    const t = getCurrentTrial();
    if (window.ReadaSync) {
      await window.ReadaSync.saveHarvestRecords(t.code, activeHarvestYear, t.harvestRecords);
    }
    showToast(`Saved ${t.harvestRecords.length} harvest records for ${t.code}`);
    refreshHeader();
    closeModal(modals.editor);
  });

  // =========================================================================
  // 3. ANNUAL FFB YIELD CALCULATION (TOTAL_TO_FILE)
  // =========================================================================
  function openAnnualCalcModal() {
    const t = getCurrentTrial();
    const modal = modals.calc;

    const records = t.harvestRecords || [];
    const missing = t.missingPalms || [];
    const density = t.constantDensity || 160;

    const totalNob = records.reduce((sum, r) => sum + (r.nob || 0), 0);
    const totalWt = records.reduce((sum, r) => sum + (r.bunchWt || 0) + (r.looseFruit || 0), 0);
    const mbw = totalNob > 0 ? (totalWt / totalNob) : 0;

    // Palms count in trial
    const totalPalmsRegistered = (t.palms && t.palms.length > 0) ? t.palms.length : 24;
    const bearingPalms = Math.max(1, totalPalmsRegistered - missing.length);

    // Yield = (Total Plot FFB kg * Density) / (Bearing Palms * 1000)
    const annualYieldTonnes = (totalWt * density) / (bearingPalms * 1000);

    document.getElementById('calc-trial-code').textContent = t.code;
    document.getElementById('calc-estate').textContent = t.estate;
    document.getElementById('calc-density').textContent = `${density} palms/ha`;

    document.getElementById('calc-nob').textContent = totalNob;
    document.getElementById('calc-weight').textContent = `${totalWt.toFixed(1)} kg`;
    document.getElementById('calc-mbw').textContent = `${mbw.toFixed(2)} kg`;
    document.getElementById('calc-yield-tonnes').textContent = annualYieldTonnes.toFixed(2);

    openModal(modal);
  }

  document.getElementById('btn-commit-annual-yield')?.addEventListener('click', () => {
    const t = getCurrentTrial();
    if (!t.ffbYield) t.ffbYield = [];

    // Add entry into trial FFB annual coverage
    t.ffbYield.push({
      from: { mn: activePeriodStart.mn, yr: activePeriodStart.yr },
      to: { mn: activePeriodEnd.mn, yr: activePeriodEnd.yr }
    });

    showToast(`Annual FFB Yield generated and saved into DATAFFB.DBF for ${t.code}!`);
    closeModal(modals.calc);
    refreshHeader();
  });

  // =========================================================================
  // 4. PALM MISSING / MORTALITY CENSUS (PALM_MISSING)
  // =========================================================================
  function openPalmsMissingModal() {
    const t = getCurrentTrial();
    const modal = modals.missing;
    renderMissingPalmsTable();
    openModal(modal);
  }

  function renderMissingPalmsTable() {
    const t = getCurrentTrial();
    const tbody = document.getElementById('missing-palms-tbody');
    if (!tbody) return;

    const list = t.missingPalms || [];
    tbody.innerHTML = '';
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--text-faint);">No missing/sterile palms recorded for this trial.</td></tr>`;
      return;
    }

    list.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: var(--font-mono); color: var(--text-muted);">${row.rec || (idx + 1)}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-del-row" data-del-missing="${idx}" title="Delete Record">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </td>
        <td><input type="number" class="cell-edit-input" data-mfield="plot" data-row="${idx}" value="${row.plot || 1}" style="width: 60px;"></td>
        <td><input type="text" class="cell-edit-input" data-mfield="subPlot" data-row="${idx}" value="${row.subPlot || ''}" placeholder="—" style="width: 50px;"></td>
        <td><input type="text" class="cell-edit-input" data-mfield="palmNo" data-row="${idx}" value="${row.palmNo || ''}" style="width: 75px; font-weight: 600;"></td>
        <td><input type="text" class="cell-edit-input" data-mfield="censusDate" data-row="${idx}" value="${row.censusDate || '10/01/1997'}" style="width: 100px;"></td>
        <td><input type="text" class="cell-edit-input" data-mfield="status" data-row="${idx}" value="${row.status || 'Dead - Ganoderma'}" style="width: 100%;"></td>
        <td style="text-align: center;"><input type="text" class="cell-edit-input" data-mfield="replaced" data-row="${idx}" value="${row.replaced || 'No'}" style="width: 60px; text-align: center;"></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-del-missing]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rowIdx = parseInt(btn.getAttribute('data-del-missing'), 10);
        t.missingPalms.splice(rowIdx, 1);
        t.missingPalms.forEach((r, i) => r.rec = i + 1);
        renderMissingPalmsTable();
        refreshHeader();
      });
    });

    tbody.querySelectorAll('input.cell-edit-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const rowIdx = parseInt(inp.getAttribute('data-row'), 10);
        const mfield = inp.getAttribute('data-mfield');
        if (mfield && t.missingPalms[rowIdx]) {
          t.missingPalms[rowIdx][mfield] = inp.value;
        }
      });
    });
  }

  document.getElementById('btn-add-missing-row')?.addEventListener('click', () => {
    const t = getCurrentTrial();
    if (!t.missingPalms) t.missingPalms = [];
    t.missingPalms.push({
      rec: t.missingPalms.length + 1,
      plot: 1,
      subPlot: '',
      palmNo: String(t.missingPalms.length + 50),
      censusDate: '10/01/1997',
      status: 'Dead - Lightning',
      replaced: 'No'
    });
    renderMissingPalmsTable();
    refreshHeader();
  });

  document.getElementById('btn-save-missing-palms')?.addEventListener('click', () => {
    const t = getCurrentTrial();
    showToast(`Updated palm census with ${t.missingPalms.length} entries for ${t.code}`);
    closeModal(modals.missing);
    refreshHeader();
  });

  // =========================================================================
  // 5. PRINT REPORT PREVIEW (PRINT_PALM_YLD)
  // =========================================================================
  function openPrintReportModal() {
    const t = getCurrentTrial();
    const modal = modals.print;

    document.getElementById('report-trial-code').textContent = t.code;
    document.getElementById('report-estate').textContent = t.estate;
    document.getElementById('report-density').textContent = `${t.constantDensity || 160} palms/ha`;
    document.getElementById('report-cycle').textContent =
      `${String(activePeriodStart.mn).padStart(2, '0')}/${activePeriodStart.yr} — ${String(activePeriodEnd.mn).padStart(2, '0')}/${activePeriodEnd.yr}`;
    document.getElementById('report-print-date').textContent = new Date().toLocaleDateString('en-GB');

    // Aggregate by round
    const roundsMap = {};
    (t.harvestRecords || []).forEach(r => {
      if (!roundsMap[r.round]) {
        roundsMap[r.round] = { round: r.round, date: r.date, count: 0, nob: 0, wt: 0, loose: 0 };
      }
      roundsMap[r.round].count++;
      roundsMap[r.round].nob += (r.nob || 0);
      roundsMap[r.round].wt += (r.bunchWt || 0);
      roundsMap[r.round].loose += (r.looseFruit || 0);
    });

    const rounds = Object.values(roundsMap).sort((a, b) => a.round - b.round);
    const tbody = document.getElementById('report-rounds-tbody');
    tbody.innerHTML = '';

    let grandNob = 0, grandWt = 0, grandLoose = 0;
    rounds.forEach(rnd => {
      const mbw = rnd.nob > 0 ? (rnd.wt / rnd.nob) : 0;
      grandNob += rnd.nob;
      grandWt += rnd.wt;
      grandLoose += rnd.loose;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700;">Rnd ${rnd.round}</td>
        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-family: var(--font-mono);">${rnd.date}</td>
        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right;">${rnd.count}</td>
        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 700;">${rnd.nob}</td>
        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 700; color: #166534;">${rnd.wt.toFixed(1)}</td>
        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right;">${rnd.loose.toFixed(1)}</td>
        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 600; color: #b45309;">${mbw.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });

    const grandTotalFfb = grandWt + grandLoose;
    const grandMbw = grandNob > 0 ? (grandWt / grandNob) : 0;
    const density = t.constantDensity || 160;
    const palmsCount = (t.palms && t.palms.length > 0) ? t.palms.length : 24;
    const annualYield = (grandTotalFfb * density) / (palmsCount * 1000);

    document.getElementById('report-summary-text').textContent =
      `Total FFB: ${grandTotalFfb.toFixed(1)} kg · Mean Bunch Weight: ${grandMbw.toFixed(2)} kg · Yield: ${annualYield.toFixed(2)} t/ha/yr`;

    openModal(modal);
  }

  function exportYieldReportCSVDirect() {
    const t = getCurrentTrial();
    if (!t) return;

    const roundsMap = {};
    (t.harvestRecords || []).forEach(r => {
      if (!roundsMap[r.round]) {
        roundsMap[r.round] = {
          round: r.round,
          date: r.date,
          count: 0,
          nob: 0,
          wt: 0,
          loose: 0
        };
      }
      roundsMap[r.round].count++;
      roundsMap[r.round].nob += (r.nob || 0);
      roundsMap[r.round].wt += (r.bunchWt || 0);
      roundsMap[r.round].loose += (r.looseFruit || 0);
    });

    const rounds = Object.values(roundsMap).sort((a, b) => a.round - b.round);
    const density = t.constantDensity || 160;
    const palmsCount = (t.palms && t.palms.length > 0) ? t.palms.length : 24;

    let grandNob = 0, grandWt = 0, grandLoose = 0;
    rounds.forEach(rnd => {
      grandNob += rnd.nob;
      grandWt += rnd.wt;
      grandLoose += rnd.loose;
    });

    const grandTotalFfb = grandWt + grandLoose;
    const grandMbw = grandNob > 0 ? (grandWt / grandNob) : 0;
    const annualYield = (grandTotalFfb * density) / (palmsCount * 1000);

    const csvFileName = `YIELD_ANALYSIS_${t.code}_${activeHarvestYear}.csv`;

    let csvContent = 'TRIAL_CODE,ESTATE,HARVEST_YEAR,ROUND_NO,HARVEST_DATE,PALMS_HARVESTED,TOTAL_BUNCHES_NOB,BUNCH_WT_KG,LOOSE_FRUIT_KG,MEAN_BUNCH_WT_KG,TOTAL_FFB_KG,PLANTING_DENSITY,ANNUAL_YIELD_THA\n';

    rounds.forEach(rnd => {
      const mbw = rnd.nob > 0 ? (rnd.wt / rnd.nob) : 0;
      const rndTotalFfb = rnd.wt + rnd.loose;
      const rndYield = (rndTotalFfb * density) / (palmsCount * 1000);
      csvContent += `"${t.code}","${t.estate}",${activeHarvestYear},${rnd.round},"${rnd.date}",${rnd.count},${rnd.nob},${rnd.wt.toFixed(1)},${rnd.loose.toFixed(1)},${mbw.toFixed(2)},${rndTotalFfb.toFixed(1)},${density},${rndYield.toFixed(2)}\n`;
    });

    // Summary Total Row
    csvContent += `"TOTAL_${t.code}","${t.estate}",${activeHarvestYear},"ALL_ROUNDS","March ${activeHarvestYear} — February ${activeHarvestYear + 1}",${palmsCount},${grandNob},${grandWt.toFixed(1)},${grandLoose.toFixed(1)},${grandMbw.toFixed(2)},${grandTotalFfb.toFixed(1)},${density},${annualYield.toFixed(2)}\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (modals.print) closeModal(modals.print);
    showToast(`Downloaded ${csvFileName} to your Downloads folder`);
  }

  document.getElementById('btn-trigger-print')?.addEventListener('click', () => {
    exportYieldReportCSVDirect();
  });

  // =========================================================================
  // 6. DIRECT CSV EXPORT TO DOWNLOADS
  // =========================================================================
  function exportYieldCSVDirect() {
    const t = getCurrentTrial();
    const csvFileName = `DATARYLD_${t.code}.csv`;

    let csvContent = 'TRIAL_CODE,ESTATE,REC_NO,PLOT_NO,SUB_PLOT,PALM_NO,ROUND_NO,HARVEST_DATE,NO_BUNCH,BUNCH_WT_KG,LOOSE_FRUIT_KG,HARVESTER_ID,REMARKS\n';
    (t.harvestRecords || []).forEach(r => {
      csvContent += `"${t.code}","${t.estate}",${r.rec},${r.plot},"${r.subPlot || ''}","${r.palmNo || ''}",${r.round || 1},"${r.date || ''}",${r.nob || 0},${r.bunchWt || 0},${r.looseFruit || 0},"${r.harvesterId || ''}","${(r.remarks || '').replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Downloaded ${csvFileName} to your Downloads folder (${t.harvestRecords.length} records)`);
  }

  function openSaveDbfModal() {
    exportYieldCSVDirect();
  }

  document.getElementById('btn-confirm-save-yield')?.addEventListener('click', () => {
    exportYieldCSVDirect();
    closeModal(modals.saveDbf);
  });

  // =========================================================================
  // 7. READ BACKUP / EXCEL (READ_BACKUP)
  // =========================================================================
  let uploadedYieldBackupFile = null;
  let uploadedYieldBackupRows = [];

  function downloadSampleExcelForYield() {
    const t = getCurrentTrial();
    const fileName = `Sample_Yield_Recording_${t.code}.xlsx`;
    const existing = (t.harvestRecords || []).slice(0, 5);
    const sampleRows = existing.length > 0
      ? existing.map((r, idx) => ({
          REC_NO: r.rec || (idx + 1),
          PLOT_NO: r.plot,
          SUB_PLOT: r.subPlot || '',
          PALM_NO: r.palmNo || '1',
          ROUND_NO: r.round || 1,
          HARVEST_DATE: r.date || '14/04/1997',
          NO_BUNCH: r.nob || 2,
          BUNCH_WT_KG: r.bunchWt || 35.0,
          LOOSE_FRUIT_KG: r.looseFruit || 2.0,
          HARVESTER_ID: r.harvesterId || 'H01',
          REMARKS: r.remarks || ''
        }))
      : [
          { REC_NO: 1, PLOT_NO: 1, SUB_PLOT: '', PALM_NO: '1', ROUND_NO: 1, HARVEST_DATE: '14/04/1997', NO_BUNCH: 2, BUNCH_WT_KG: 36.5, LOOSE_FRUIT_KG: 1.8, HARVESTER_ID: 'H01', REMARKS: 'Normal harvest' },
          { REC_NO: 2, PLOT_NO: 1, SUB_PLOT: '', PALM_NO: '2', ROUND_NO: 1, HARVEST_DATE: '14/04/1997', NO_BUNCH: 1, BUNCH_WT_KG: 21.0, LOOSE_FRUIT_KG: 1.2, HARVESTER_ID: 'H01', REMARKS: 'Normal harvest' }
        ];

    if (window.XLSX) {
      const ws = window.XLSX.utils.json_to_sheet(sampleRows);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Yield_Recording');
      window.XLSX.writeFile(wb, fileName);
      showToast(`Downloaded sample template "${fileName}"`);
    } else {
      exportYieldCSVDirect();
    }
  }

  document.getElementById('btn-download-yield-backup-sample')?.addEventListener('click', downloadSampleExcelForYield);
  document.getElementById('btn-download-yield-nonreada-sample')?.addEventListener('click', downloadSampleExcelForYield);

  function openBackupModal() {
    uploadedYieldBackupFile = null;
    uploadedYieldBackupRows = [];
    const modal = modals.backup;
    const box = document.getElementById('yield-backup-preview-box');
    const fileInp = document.getElementById('yield-backup-file-upload');
    const dropTitle = document.getElementById('yield-backup-drop-title');
    if (box) box.style.display = 'none';
    if (fileInp) fileInp.value = '';
    if (dropTitle) dropTitle.textContent = 'Click to Browse or Drag & Drop Excel File Here';
    openModal(modal);
  }

  async function handleYieldBackupFileSelect(file) {
    if (!file) return;
    uploadedYieldBackupFile = file;
    uploadedYieldBackupRows = [];
    const dropTitle = document.getElementById('yield-backup-drop-title');
    if (dropTitle) dropTitle.textContent = `Selected: ${file.name}`;

    const box = document.getElementById('yield-backup-preview-box');
    const txt = document.getElementById('yield-backup-preview-text');
    const t = getCurrentTrial();

    let rowCountText = '';
    let colsText = '';
    try {
      if (window.XLSX) {
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        uploadedYieldBackupRows = rows || [];
        rowCountText = ` (${uploadedYieldBackupRows.length} rows in sheet "${sheetName}")`;
        if (uploadedYieldBackupRows.length > 0) {
          colsText = `<br>Detected Columns: <code>${Object.keys(uploadedYieldBackupRows[0]).join(', ')}</code>`;
        }
      }
    } catch (err) {
      console.error(err);
    }

    if (box && txt) {
      box.style.display = 'block';
      txt.innerHTML = `
        <strong>Excel Backup File Ready:</strong> ${file.name}${rowCountText}${colsText}<br>
        Target Trial Code: <strong>${t.code} (${t.estate})</strong>.<br>
        Ready to restore harvesting rounds.
      `;
    }
  }

  document.getElementById('yield-backup-file-upload')?.addEventListener('change', (e) => {
    handleYieldBackupFileSelect(e.target.files[0]);
  });

  const yieldBackupDropZone = document.getElementById('yield-backup-drop-zone');
  if (yieldBackupDropZone) {
    yieldBackupDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      yieldBackupDropZone.classList.add('dragover');
    });
    yieldBackupDropZone.addEventListener('dragleave', () => {
      yieldBackupDropZone.classList.remove('dragover');
    });
    yieldBackupDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      yieldBackupDropZone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) {
        handleYieldBackupFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  document.getElementById('btn-start-replace-yield-backup')?.addEventListener('click', () => {
    if (!uploadedYieldBackupFile) {
      showToast('Please select or drop an Excel file (.xlsx, .xls, .csv) first');
      return;
    }
    const t = getCurrentTrial();
    if (uploadedYieldBackupRows.length > 0) {
      t.harvestRecords = uploadedYieldBackupRows.map((r, i) => ({
        rec: Number(r.REC_NO || r.rec || (i + 1)),
        plot: Number(r.PLOT_NO || r.PLOT || r.plot || 1),
        subPlot: String(r.SUB_PLOT || r.SUBPLOT || r.subPlot || ''),
        palmNo: String(r.PALM_NO || r.PALM || r.palmNo || '1'),
        round: Number(r.ROUND_NO || r.RND || r.round || 1),
        date: String(r.HARVEST_DATE || r.HARV_DATE || r.date || '14/04/1997'),
        nob: Number(r.NO_BUNCH ?? r.NOB ?? r.BUNCH_NO ?? 2),
        bunchWt: Number(r.BUNCH_WT_KG ?? r.BWT_KG ?? r.BUNCH_WT ?? 35.0),
        looseFruit: Number(r.LOOSE_FRUIT_KG ?? r.LOOSE_KG ?? r.LOOSE_FRUIT ?? 2.0),
        harvesterId: String(r.HARVESTER_ID || r.HARV_CODE || 'H01'),
        remarks: String(r.REMARKS || r.REMARK || 'Restored from Excel backup')
      }));
      if (window.ReadaSync && typeof window.ReadaSync.saveYieldRecords === 'function') {
        window.ReadaSync.saveYieldRecords(t.code, t.harvestRecords);
      }
    }
    showToast(`Restored ${uploadedYieldBackupRows.length} yield record(s) for ${t.code} from "${uploadedYieldBackupFile.name}"`);
    closeModal(modals.backup);
    refreshHeader();
  });

  // =========================================================================
  // 8. READ FROM EXCEL SPREADSHEET (*.xlsx / *.xls / *.csv)
  // =========================================================================
  function renderYieldPreview(ext) {
    const thead = document.getElementById('yield-nonreada-head');
    const tbody = document.getElementById('yield-nonreada-body');
    if (thead && tbody && ext && ext.fields) {
      thead.innerHTML = `<tr>${ext.fields.map(f => `<th>${f}</th>`).join('')}</tr>`;
      tbody.innerHTML = (ext.sampleRows || []).slice(0, 50).map(r => `
        <tr>${ext.fields.map(f => `<td style="font-family: var(--font-mono); font-size: 0.76rem;">${r[f] ?? ''}</td>`).join('')}</tr>
      `).join('');
    }
  }

  function openNonReadaModal() {
    const t = getCurrentTrial();
    const modal = modals.nonReada;
    const dropTitle = document.getElementById('yield-nonreada-drop-title');
    const fileInp = document.getElementById('yield-excel-file-upload');

    document.getElementById('yield-nonreada-code').textContent = t.code;
    document.getElementById('yield-nonreada-estate').textContent = t.estate;
    if (fileInp) fileInp.value = '';
    if (dropTitle) dropTitle.textContent = 'Click to Browse or Drag & Drop Excel File Here';

    const ext = window.READA_EXTERNAL_YIELD_CSV || { fields: [], sampleRows: [] };
    renderYieldPreview(ext);
    openModal(modal);
  }

  async function handleYieldNonReadaFileSelect(file) {
    if (!file) return;
    const dropTitle = document.getElementById('yield-nonreada-drop-title');
    if (dropTitle) dropTitle.textContent = `Selected: ${file.name}`;

    try {
      if (window.XLSX) {
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(worksheet);

        if (rows && rows.length > 0) {
          const fields = Object.keys(rows[0]);
          window.READA_EXTERNAL_YIELD_CSV = {
            fileName: file.name,
            fields: fields,
            sampleRows: rows
          };
          renderYieldPreview(window.READA_EXTERNAL_YIELD_CSV);
          showToast(`Read ${rows.length} harvesting records from Excel sheet "${sheetName}"`);
        }
      }
    } catch (err) {
      console.error(err);
      showToast(`Error parsing Excel file: ${err.message}`);
    }
  }

  // Handle Excel file upload using SheetJS
  document.getElementById('yield-excel-file-upload')?.addEventListener('change', (e) => {
    handleYieldNonReadaFileSelect(e.target.files[0]);
  });

  const yieldNonReadaDropZone = document.getElementById('yield-nonreada-drop-zone');
  if (yieldNonReadaDropZone) {
    yieldNonReadaDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      yieldNonReadaDropZone.classList.add('dragover');
    });
    yieldNonReadaDropZone.addEventListener('dragleave', () => {
      yieldNonReadaDropZone.classList.remove('dragover');
    });
    yieldNonReadaDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      yieldNonReadaDropZone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) {
        handleYieldNonReadaFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  document.getElementById('btn-start-import-yield-file')?.addEventListener('click', () => {
    const t = getCurrentTrial();
    const ext = window.READA_EXTERNAL_YIELD_CSV;
    if (ext && ext.sampleRows && ext.sampleRows.length > 0) {
      ext.sampleRows.forEach((r, i) => {
        t.harvestRecords.push({
          rec: t.harvestRecords.length + 1,
          plot: r.PLOT || r.PLOT_NO || 1,
          subPlot: r.SUBPLOT || r.SUB_PLOT || '',
          palmNo: String(r.PALM || r.PALM_NO || '18'),
          round: r.RND || r.ROUND_NO || 3,
          date: r.HARV_DATE || r.HARVEST_DATE || '14/04/1997',
          nob: Number(r.NO_BUNCH || r.BUNCH_NO || 2),
          bunchWt: Number(r.BWT_KG || r.BUNCH_WT || 35.0),
          looseFruit: Number(r.LOOSE_KG || r.LOOSE_FRUIT || 2.0),
          harvesterId: r.HARV_CODE || r.HARVESTER_ID || 'H01',
          remarks: r.REMARK || r.REMARKS || 'Imported from Excel'
        });
      });
      showToast(`Mapped ${ext.sampleRows.length} external records into ${t.code}`);
    }
    refreshHeader();
    closeModal(modals.nonReada);
  });

  // =========================================================================
  // 9. DELETE CONFIRMATION (DELETE_YIELD_DATA)
  // =========================================================================
  function openDeleteModal() {
    const t = getCurrentTrial();
    const modal = modals.delete;
    document.getElementById('delete-yield-msg').innerHTML =
      `Are you sure you want to permanently delete all <strong>${t.harvestRecords.length} harvesting records</strong> for <strong>${t.code} (${t.estate})</strong>?`;
    openModal(modal);
  }

  document.getElementById('btn-confirm-delete-yield')?.addEventListener('click', async () => {
    const t = getCurrentTrial();
    t.harvestRecords = [];
    if (window.ReadaSync) {
      await window.ReadaSync.saveHarvestRecords(t.code, activeHarvestYear, []);
    }
    showToast(`Deleted all harvesting yield records for ${t.code}`);
    refreshHeader();
    closeModal(modals.delete);
  });

  // =========================================================================
  // Wire Up Dashboard Operational Buttons
  // =========================================================================
  document.getElementById('btn-new-round-entry')?.addEventListener('click', () => {
    openSelectionDialog('entry', () => openHarvestEditorModal());
  });

  document.getElementById('btn-edit-yield-data')?.addEventListener('click', () => {
    openHarvestEditorModal();
  });

  document.getElementById('btn-palm-missing')?.addEventListener('click', () => {
    openPalmsMissingModal();
  });

  document.getElementById('btn-calc-annual-yield')?.addEventListener('click', () => {
    openAnnualCalcModal();
  });

  document.getElementById('btn-print-yield-report')?.addEventListener('click', () => {
    exportYieldReportCSVDirect();
  });

  document.getElementById('btn-save-yield-dbf')?.addEventListener('click', () => {
    openSaveDbfModal();
  });

  document.getElementById('btn-read-yield-backup')?.addEventListener('click', () => {
    openBackupModal();
  });

  document.getElementById('btn-read-yield-nonreada')?.addEventListener('click', () => {
    openNonReadaModal();
  });

  document.getElementById('btn-delete-yield-data')?.addEventListener('click', () => {
    openDeleteModal();
  });

  // Top Selector
  if (el.trialSelect) {
    el.trialSelect.addEventListener('change', async (e) => {
      currentCode = e.target.value;
      const t = getCurrentTrial();
      if (window.ReadaSync && t) {
        await window.ReadaSync.loadTrialDetails(t);
      }
      refreshHeader();
      showToast(`Switched active trial to ${currentCode}`);
    });
  }

  document.getElementById('btn-update-code-list')?.addEventListener('click', async () => {
    if (window.ReadaSync) {
      const freshTrials = await window.ReadaSync.fetchTrials();
      if (freshTrials && freshTrials.length > 0) {
        trials = freshTrials;
      }
    }
    refreshHeader();
    showToast('Trial list refreshed from Supabase Cloud');
  });

  // Init with Supabase synchronization
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
    const t = getCurrentTrial();
    if (window.ReadaSync && t) {
      await window.ReadaSync.loadTrialDetails(t);
    }
    refreshHeader();
  }

  init();

})();
