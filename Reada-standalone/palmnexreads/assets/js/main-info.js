/**
 * ReaDA — Section 2: Main Information Controller
 * -------------------------------------------------------------------------
 * Recreates the complete Borland Visual dBase Main Information module
 * (PORIM Manual Figures 3 through 14) with all 15 operational pop-up windows.
 */

(function () {
  'use strict';

  // Load trial data
  let trials = JSON.parse(JSON.stringify(window.READA_TRIALS || []));
  let currentCode = 'DTP1';

  // Modals state
  let isNewMode = false;
  let currentSaveType = 'info';      // 'info' | 'treatment' | 'palm'
  let currentBackupType = 'info';    // 'info' | 'treatment' | 'palm'
  let currentDeleteType = 'info';    // 'info' | 'treatment' | 'palm'

  // DOM Elements
  const el = {
    trialSelect: document.getElementById('select-working-trial'),
    statCode: document.getElementById('stat-trial-code'),
    statEstate: document.getElementById('stat-estate'),
    statYear: document.getElementById('stat-planting-year'),
    statFactors: document.getElementById('stat-factors-count'),
    statPlots: document.getElementById('stat-plots-count'),
    statPalms: document.getElementById('stat-palms-count'),
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toast-msg')
  };

  // Modal references
  const modals = {
    trialInfo: document.getElementById('modal-trial-info'),
    plotTreatment: document.getElementById('modal-plot-treatment'),
    palmNumbering: document.getElementById('modal-palm-numbering'),
    saveDbf: document.getElementById('modal-save-dbf'),
    backup: document.getElementById('modal-backup'),
    nonReada: document.getElementById('modal-non-reada'),
    confirmDelete: document.getElementById('modal-confirm-delete')
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

  // Refresh Top Header Stats & Selector
  function refreshHeader() {
    const t = getCurrentTrial();
    if (!t) return;

    if (el.statCode) el.statCode.textContent = t.code;
    if (el.statEstate) el.statEstate.textContent = t.estate;
    if (el.statYear) el.statYear.textContent = t.plantingYear || '—';
    if (el.statFactors) el.statFactors.textContent = (t.factors || []).length || (t.factorsCount || 0);
    if (el.statPlots) el.statPlots.textContent = (t.plotTreatments || []).length;
    if (el.statPalms) el.statPalms.textContent = (t.palms || []).length;

    if (el.trialSelect) {
      el.trialSelect.innerHTML = '';
      trials.forEach(tr => {
        const opt = document.createElement('option');
        opt.value = tr.code;
        const ownerTag = tr.isBaseline ? '[Shared Baseline]' : `[${tr.createdByEmail || 'Private'}]`;
        opt.textContent = `${tr.code} — ${tr.estate} ${ownerTag}`;
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
  // FIGURE 4 (2.1 & 2.2): Trial Main Information Pop-up
  // =========================================================================
  function openTrialInfoModal(isNew = false) {
    isNewMode = isNew;
    const modal = modals.trialInfo;
    const title = document.getElementById('modal-trial-info-title');
    const codeInp = document.getElementById('info-trial-code');
    const estateInp = document.getElementById('info-estate');
    const yearInp = document.getElementById('info-planting-year');
    const factorCountInp = document.getElementById('info-factor-count');
    const factorInfoArea = document.getElementById('info-factor-details');
    const grid = document.getElementById('info-factors-grid');
    const latInp = document.getElementById('info-latitude');
    const lngInp = document.getElementById('info-longitude');
    const presetSelect = document.getElementById('select-preset-location');

    if (isNew) {
      if (title) title.textContent = 'Create New Trial Information';
      codeInp.value = 'EXP_' + (trials.length + 1);
      codeInp.removeAttribute('readonly');
      estateInp.value = '';
      yearInp.value = new Date().getFullYear();
      factorCountInp.value = '4';
      factorInfoArea.value = 'Rep = Replicate\nN = Nitrogen\nP = Phosphorus\nK = Potassium';
      renderFactorInputs(['Rep', 'N', 'P', 'K', '', '', '']);
      if (latInp) latInp.value = '4.025800';
      if (lngInp) lngInp.value = '101.018900';
      if (presetSelect) presetSelect.value = '4.0258,101.0189';
    } else {
      const t = getCurrentTrial();
      if (title) title.textContent = `Edit Trial Main Information — ${t.code}`;
      codeInp.value = t.code;
      codeInp.setAttribute('readonly', 'true');
      estateInp.value = t.estate || '';
      yearInp.value = t.plantingYear || 1988;
      factorCountInp.value = (t.factors || []).length || 6;
      factorInfoArea.value = t.factorInfo || '';
      const labels = (t.factors || []).map(f => f.label);
      while (labels.length < 7) labels.push('');
      renderFactorInputs(labels);
      if (latInp) latInp.value = (t.latitude !== null && t.latitude !== undefined) ? Number(t.latitude).toFixed(6) : '';
      if (lngInp) lngInp.value = (t.longitude !== null && t.longitude !== undefined) ? Number(t.longitude).toFixed(6) : '';
      if (presetSelect) presetSelect.value = '';
    }

    openModal(modal);
  }

  function renderFactorInputs(labels) {
    const grid = document.getElementById('info-factors-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 1; i <= 7; i++) {
      const val = labels[i - 1] || '';
      const div = document.createElement('div');
      div.className = 'form-field';
      div.innerHTML = `
        <label style="font-size: 0.74rem; font-weight: 500;">Factor ${i} Label</label>
        <input type="text" class="form-control factor-label-input" data-index="${i}" value="${val}" placeholder="—" maxlength="6" style="padding: 5px 8px; font-family: var(--font-mono); text-transform: uppercase;">
      `;
      grid.appendChild(div);
    }
  }

  // Save Trial Main Info (Figure 4 [Yes] button)
  document.getElementById('btn-save-trial-info')?.addEventListener('click', async () => {
    const code = document.getElementById('info-trial-code').value.trim().toUpperCase();
    const estate = document.getElementById('info-estate').value.trim();
    const year = parseInt(document.getElementById('info-planting-year').value, 10) || 1988;
    const count = parseInt(document.getElementById('info-factor-count').value, 10) || 4;
    const info = document.getElementById('info-factor-details').value;

    const latRaw = document.getElementById('info-latitude')?.value?.trim();
    const lngRaw = document.getElementById('info-longitude')?.value?.trim();
    const latitude = latRaw && !isNaN(parseFloat(latRaw)) ? parseFloat(latRaw) : null;
    const longitude = lngRaw && !isNaN(parseFloat(lngRaw)) ? parseFloat(lngRaw) : null;

    const factorInputs = document.querySelectorAll('.factor-label-input');
    const factors = [];
    factorInputs.forEach((inp, idx) => {
      const lbl = inp.value.trim();
      if (lbl && factors.length < count) {
        factors.push({ id: idx + 1, label: lbl, name: lbl });
      }
    });

    if (!code) {
      alert('Please enter a Trial Code.');
      return;
    }

    if (isNewMode) {
      const existing = trials.find(t => t.code === code);
      if (existing) {
        alert(`Trial Code "${code}" already exists.`);
        return;
      }
      const newTrial = {
        code,
        estate: estate || 'New Estate',
        plantingYear: year,
        factorsCount: factors.length,
        factors,
        factorInfo: info,
        densityType: 'constant',
        constantDensity: 148,
        latitude,
        longitude,
        plotTreatments: [],
        palms: []
      };
      trials.unshift(newTrial);
      currentCode = code;

      // Persist to Supabase
      if (window.ReadaSync) {
        const res = await window.ReadaSync.saveTrial(newTrial);
        if (res && res.error) {
          console.error("Supabase save error:", res.error);
          alert(`Cloud sync note: ${res.error.message || 'Unable to write to Supabase'}`);
        }
      }
      showToast(`Created Trial ${code} (${estate})`);
    } else {
      const t = getCurrentTrial();
      t.estate = estate;
      t.plantingYear = year;
      t.factorsCount = factors.length;
      t.factors = factors;
      t.factorInfo = info;
      t.latitude = latitude;
      t.longitude = longitude;

      // Persist to Supabase
      if (window.ReadaSync) {
        const res = await window.ReadaSync.saveTrial(t);
        if (res && res.error) {
          console.error("Supabase update error:", res.error);
          alert(`Cloud sync note: ${res.error.message || 'Unable to update in Supabase'}`);
        }
      }
      showToast(`Updated Main Information for ${t.code}`);
    }

    refreshHeader();
    closeModal(modals.trialInfo);
  });

  // =========================================================================
  // FIGURE 7 (2.6): EDITING PLOT TREATMENT DETAIL Pop-up
  // =========================================================================
  function openPlotTreatmentModal() {
    const t = getCurrentTrial();
    const modal = modals.plotTreatment;

    document.getElementById('treatment-modal-code').textContent = t.code;
    document.getElementById('treatment-modal-estate').textContent = t.estate;

    const constantRadio = document.getElementById('density-mode-constant');
    const variesRadio = document.getElementById('density-mode-varies');
    const constantInp = document.getElementById('density-constant-val');

    constantInp.value = t.constantDensity || 148;
    if (t.densityType === 'varies') {
      variesRadio.checked = true;
      constantInp.disabled = true;
    } else {
      constantRadio.checked = true;
      constantInp.disabled = false;
    }

    constantRadio.onchange = () => {
      constantInp.disabled = false;
      applyConstantDensity(parseInt(constantInp.value, 10) || 148);
    };
    variesRadio.onchange = () => {
      constantInp.disabled = true;
    };
    constantInp.oninput = () => {
      if (constantRadio.checked) {
        applyConstantDensity(parseInt(constantInp.value, 10) || 148);
      }
    };

    renderPlotTreatmentTable();
    openModal(modal);
  }

  function applyConstantDensity(val) {
    const t = getCurrentTrial();
    if (!t.plotTreatments) return;
    t.plotTreatments.forEach(pt => pt.density = val);
    renderPlotTreatmentTable();
  }

  function renderPlotTreatmentTable() {
    const t = getCurrentTrial();
    const tbody = document.getElementById('treatment-table-body');
    const theadRow = document.getElementById('treatment-table-header-row');
    if (!tbody || !theadRow) return;

    const factors = t.factors && t.factors.length > 0 ? t.factors : [
      { label: 'Rep' }, { label: 'D' }, { label: 'N' }, { label: 'P' }, { label: 'K' }, { label: 'L' }
    ];

    theadRow.innerHTML = `
      <th style="width: 50px;">Rec</th>
      <th style="width: 44px; text-align: center;">Del</th>
      <th style="width: 80px;">Plot</th>
      <th style="width: 80px;">Sub Plot</th>
      ${factors.map(f => `<th style="text-align: center; color: var(--brand-green);">${f.label}</th>`).join('')}
      <th style="width: 100px;">Density</th>
    `;

    tbody.innerHTML = '';
    const records = t.plotTreatments || [];
    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${5 + factors.length}" style="text-align: center; padding: 24px; color: var(--text-faint);">No plot treatments recorded yet. Click "+ Add New Plot Row" below.</td></tr>`;
      return;
    }

    records.forEach((row, idx) => {
      const tr = document.createElement('tr');
      const levels = row.levels || [];
      const factorCells = factors.map((f, fIdx) => `
        <td style="text-align: center;">
          <input type="number" class="cell-edit-input" data-row="${idx}" data-factor="${fIdx}" value="${levels[fIdx] ?? 0}" min="0" max="9" style="width: 48px; text-align: center;">
        </td>
      `).join('');

      tr.innerHTML = `
        <td style="font-family: var(--font-mono); color: var(--text-muted);">${row.rec || (idx + 1)}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-del-row" data-del-row="${idx}" title="Delete Row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
          </button>
        </td>
        <td><input type="number" class="cell-edit-input" data-field="plot" data-row="${idx}" value="${row.plot || (idx + 1)}" style="width: 60px;"></td>
        <td><input type="text" class="cell-edit-input" data-field="subPlot" data-row="${idx}" value="${row.subPlot || ''}" placeholder="—" style="width: 60px; text-transform: uppercase;"></td>
        ${factorCells}
        <td><input type="number" class="cell-edit-input" data-field="density" data-row="${idx}" value="${row.density || 160}" style="width: 70px;"></td>
      `;
      tbody.appendChild(tr);
    });

    // Del button listeners
    tbody.querySelectorAll('[data-del-row]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rowIdx = parseInt(btn.getAttribute('data-del-row'), 10);
        t.plotTreatments.splice(rowIdx, 1);
        t.plotTreatments.forEach((r, i) => r.rec = i + 1);
        renderPlotTreatmentTable();
        refreshHeader();
      });
    });

    // Cell input listeners
    tbody.querySelectorAll('input.cell-edit-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const rowIdx = parseInt(inp.getAttribute('data-row'), 10);
        const field = inp.getAttribute('data-field');
        const factorIdx = inp.getAttribute('data-factor');
        if (field) {
          t.plotTreatments[rowIdx][field] = field === 'subPlot' ? inp.value.trim().toUpperCase() : parseInt(inp.value, 10) || 0;
        } else if (factorIdx !== null) {
          if (!t.plotTreatments[rowIdx].levels) t.plotTreatments[rowIdx].levels = [];
          t.plotTreatments[rowIdx].levels[parseInt(factorIdx, 10)] = parseInt(inp.value, 10) || 0;
        }
      });
    });
  }

  // Add Treatment Row button
  document.getElementById('btn-add-treatment-row')?.addEventListener('click', () => {
    const t = getCurrentTrial();
    if (!t.plotTreatments) t.plotTreatments = [];
    const newRec = t.plotTreatments.length + 1;
    const lastPlot = t.plotTreatments.length > 0 ? (t.plotTreatments[t.plotTreatments.length - 1].plot || 0) : 0;
    const fCount = (t.factors || []).length || 6;
    const densityVal = document.getElementById('density-mode-constant').checked
      ? (parseInt(document.getElementById('density-constant-val').value, 10) || 148)
      : 160;

    t.plotTreatments.push({
      rec: newRec,
      plot: lastPlot + 1,
      subPlot: '',
      levels: Array(fCount).fill(1),
      density: densityVal
    });

    renderPlotTreatmentTable();
    refreshHeader();
    const wrap = document.getElementById('treatment-table-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  });

  // Save Plot Treatment (Figure 7 [Yes] button)
  document.getElementById('btn-save-plot-treatment')?.addEventListener('click', async () => {
    const t = getCurrentTrial();
    t.densityType = document.getElementById('density-mode-varies').checked ? 'varies' : 'constant';
    t.constantDensity = parseInt(document.getElementById('density-constant-val').value, 10) || 148;
    
    if (window.ReadaSync) {
      await window.ReadaSync.saveTrial(t, false);
      await window.ReadaSync.saveTreatments(t.code, t.plotTreatments);
    }
    showToast(`Saved ${t.plotTreatments.length} plot treatments for ${t.code}`);
    refreshHeader();
    closeModal(modals.plotTreatment);
  });

  // =========================================================================
  // FIGURE 11 (2.11): ENTERING / EDITING PALM NUMBERING Pop-up
  // =========================================================================
  function openPalmNumberingModal() {
    const t = getCurrentTrial();
    const modal = modals.palmNumbering;
    document.getElementById('palm-modal-code').textContent = t.code;
    document.getElementById('palm-modal-estate').textContent = t.estate;
    renderPalmTable();
    openModal(modal);
  }

  function renderPalmTable() {
    const t = getCurrentTrial();
    const tbody = document.getElementById('palm-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const palms = t.palms || [];
    if (palms.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-faint);">No palm numbering recorded for this trial yet. Click "+ Add Palm" or "Auto-Generate Series" below.</td></tr>`;
      return;
    }

    palms.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: var(--font-mono); color: var(--text-muted);">${row.rec || (idx + 1)}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-del-row" data-del-palm="${idx}" title="Delete Palm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
          </button>
        </td>
        <td><input type="number" class="cell-edit-input" data-field="plot" data-row="${idx}" value="${row.plot || 1}" style="width: 60px;"></td>
        <td><input type="text" class="cell-edit-input" data-field="subPlot" data-row="${idx}" value="${row.subPlot || ''}" placeholder="—" style="width: 60px; text-transform: uppercase;"></td>
        <td><input type="text" class="cell-edit-input" data-field="palmNo" data-row="${idx}" value="${row.palmNo || ''}" style="width: 90px; font-weight: 600;"></td>
        <td><input type="text" class="cell-edit-input" data-field="progeny" data-row="${idx}" value="${row.progeny || 'D x P AVROS'}" style="width: 140px;"></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-del-palm]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rowIdx = parseInt(btn.getAttribute('data-del-palm'), 10);
        t.palms.splice(rowIdx, 1);
        t.palms.forEach((r, i) => r.rec = i + 1);
        renderPalmTable();
        refreshHeader();
      });
    });

    tbody.querySelectorAll('input.cell-edit-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const rowIdx = parseInt(inp.getAttribute('data-row'), 10);
        const field = inp.getAttribute('data-field');
        if (field && t.palms[rowIdx]) {
          t.palms[rowIdx][field] = inp.value;
        }
      });
    });
  }

  // Add Palm Row
  document.getElementById('btn-add-palm-row')?.addEventListener('click', () => {
    const t = getCurrentTrial();
    if (!t.palms) t.palms = [];
    const newRec = t.palms.length + 1;
    const last = t.palms[t.palms.length - 1];
    const nextPlot = last ? last.plot : 1;
    const nextNo = last ? (parseInt(last.palmNo, 10) + 1 || (newRec * 10)) : 101;

    t.palms.push({
      rec: newRec,
      plot: nextPlot,
      subPlot: '',
      palmNo: String(nextNo),
      progeny: last ? last.progeny : 'D x P AVROS'
    });
    renderPalmTable();
    refreshHeader();
    const wrap = document.getElementById('palm-table-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  });

  // Auto-Generate Palm Series
  document.getElementById('btn-generate-palms')?.addEventListener('click', () => {
    const t = getCurrentTrial();
    const plot = prompt('Enter Plot Number to generate palms for:', '4');
    if (!plot) return;
    const count = parseInt(prompt('How many palms to generate (e.g. 16)?', '16'), 10);
    if (!count || isNaN(count)) return;
    const startNo = parseInt(prompt('Start Palm Number:', '401'), 10) || 401;

    if (!t.palms) t.palms = [];
    for (let i = 0; i < count; i++) {
      t.palms.push({
        rec: t.palms.length + 1,
        plot: parseInt(plot, 10),
        subPlot: '',
        palmNo: String(startNo + i),
        progeny: 'D x P AVROS'
      });
    }
    renderPalmTable();
    refreshHeader();
    showToast(`Generated ${count} palms for Plot ${plot}`);
  });

  // Save Palm Numbering (Figure 11 [Yes] button)
  document.getElementById('btn-save-palm')?.addEventListener('click', async () => {
    const t = getCurrentTrial();
    if (window.ReadaSync) {
      await window.ReadaSync.savePalms(t.code, t.palms);
    }
    showToast(`Saved ${t.palms.length} palm numbers for ${t.code}`);
    refreshHeader();
    closeModal(modals.palmNumbering);
  });

  // =========================================================================
  // FIGURES 5, 8, 12 (2.3, 2.7, 2.12): Save As *.dbf File Pop-ups
  // =========================================================================
  // =========================================================================
  // FIGURES 5, 8, 12: Direct CSV Export to Downloads
  // =========================================================================
  function exportMainInfoCSVDirect(type) {
    const t = getCurrentTrial();
    let csvFileName = '';
    let csvContent = '';

    if (type === 'info') {
      csvFileName = `INFO_${t.code}.csv`;
      csvContent = 'TRIAL_CODE,ESTATE,PLANTING_YEAR,FACTORS_COUNT,DENSITY_TYPE,CONSTANT_DENSITY,FACTOR_DEFINITIONS\n';
      const factorDef = (t.factorInfo || '').replace(/"/g, '""').replace(/\n/g, '; ');
      csvContent += `"${t.code}","${t.estate}",${t.plantingYear || ''},${(t.factors || []).length},"${t.densityType || ''}",${t.constantDensity || ''},"${factorDef}"\n`;
    } else if (type === 'treatment') {
      csvFileName = `TREAT_${t.code}.csv`;
      csvContent = 'REC_NO,PLOT_NO,SUB_PLOT,FACTOR1,FACTOR2,FACTOR3,FACTOR4,FACTOR5,FACTOR6,DENSITY\n';
      (t.plotTreatments || []).forEach(tr => {
        const lvls = tr.levels || [];
        csvContent += `${tr.rec},${tr.plot},"${tr.subPlot || ''}",${lvls[0] ?? ''},${lvls[1] ?? ''},${lvls[2] ?? ''},${lvls[3] ?? ''},${lvls[4] ?? ''},${lvls[5] ?? ''},${tr.density || ''}\n`;
      });
    } else {
      csvFileName = `PALM_${t.code}.csv`;
      csvContent = 'REC_NO,PLOT_NO,SUB_PLOT,PALM_NO,PROGENY,STATUS\n';
      (t.palms || []).forEach(p => {
        csvContent += `${p.rec},${p.plot},"${p.subPlot || ''}","${p.palmNo || ''}","${(p.progeny || '').replace(/"/g, '""')}","${p.status || ''}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Downloaded ${csvFileName} to your Downloads folder`);
  }

  function openSaveDbfModal(type) {
    currentSaveType = type;
    exportMainInfoCSVDirect(type);
  }

  // Confirm Save / Export as CSV ONLY (No JSON / No DBF)
  document.getElementById('btn-confirm-save-dbf')?.addEventListener('click', () => {
    exportMainInfoCSVDirect(currentSaveType);
    closeModal(modals.saveDbf);
  });

  // =========================================================================
  // FIGURES 6, 9, 13: Read Backup / Excel File Pop-ups
  // =========================================================================
  let uploadedBackupFile = null;
  let uploadedBackupRows = [];
  let currentNonReadaType = 'treatment';

  function downloadSampleExcelForMainInfo(type) {
    const t = getCurrentTrial();
    let sampleRows = [];
    let sheetName = 'Sample';
    let fileName = 'Sample_Template.xlsx';

    if (type === 'info') {
      sheetName = 'Trial_Info';
      fileName = `Sample_Trial_Info_${t.code}.xlsx`;
      sampleRows = [{
        TRIAL_CODE: t.code,
        ESTATE: t.estate || 'Teluk Intan',
        PLANTING_YEAR: t.plantingYear || 1988,
        DENSITY_TYPE: t.densityType || 'Constant',
        CONSTANT_DENSITY: t.constantDensity || 148,
        FACTOR_DEFINITIONS: (t.factorInfo || 'Factor 1: Density; Factor 2: N Fertilizer')
      }];
    } else if (type === 'treatment') {
      sheetName = 'Plot_Treatments';
      fileName = `Sample_Plot_Treatment_${t.code}.xlsx`;
      const existing = (t.plotTreatments || []).slice(0, 5);
      if (existing.length > 0) {
        sampleRows = existing.map((tr, idx) => {
          const lvls = tr.levels || [];
          return {
            REC_NO: tr.rec || (idx + 1),
            PLOT_NO: tr.plot,
            SUB_PLOT: tr.subPlot || '',
            FACTOR1: lvls[0] ?? 1,
            FACTOR2: lvls[1] ?? 1,
            FACTOR3: lvls[2] ?? 0,
            FACTOR4: lvls[3] ?? 0,
            FACTOR5: lvls[4] ?? 0,
            FACTOR6: lvls[5] ?? 0,
            DENSITY: tr.density || 148
          };
        });
      } else {
        sampleRows = [
          { REC_NO: 1, PLOT_NO: 1, SUB_PLOT: 'A', FACTOR1: 1, FACTOR2: 1, FACTOR3: 0, FACTOR4: 0, FACTOR5: 0, FACTOR6: 0, DENSITY: 148 },
          { REC_NO: 2, PLOT_NO: 2, SUB_PLOT: 'B', FACTOR1: 1, FACTOR2: 2, FACTOR3: 1, FACTOR4: 0, FACTOR5: 0, FACTOR6: 0, DENSITY: 148 }
        ];
      }
    } else {
      sheetName = 'Palm_Numbering';
      fileName = `Sample_Palm_Numbering_${t.code}.xlsx`;
      const existing = (t.palms || []).slice(0, 5);
      if (existing.length > 0) {
        sampleRows = existing.map((p, idx) => ({
          REC_NO: p.rec || (idx + 1),
          PLOT_NO: p.plot,
          SUB_PLOT: p.subPlot || '',
          PALM_NO: p.palmNo,
          PROGENY: p.progeny || 'D x P AVROS',
          STATUS: p.status || 'Normal'
        }));
      } else {
        sampleRows = [
          { REC_NO: 1, PLOT_NO: 1, SUB_PLOT: '', PALM_NO: '1', PROGENY: 'D x P AVROS', STATUS: 'Normal' },
          { REC_NO: 2, PLOT_NO: 1, SUB_PLOT: '', PALM_NO: '2', PROGENY: 'D x P AVROS', STATUS: 'Normal' }
        ];
      }
    }

    if (window.XLSX) {
      const ws = window.XLSX.utils.json_to_sheet(sampleRows);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
      window.XLSX.writeFile(wb, fileName);
      showToast(`Downloaded sample template "${fileName}"`);
    } else {
      exportMainInfoCSVDirect(type);
    }
  }

  document.getElementById('btn-download-backup-sample')?.addEventListener('click', () => {
    downloadSampleExcelForMainInfo(currentBackupType);
  });

  document.getElementById('btn-download-nonreada-sample')?.addEventListener('click', () => {
    downloadSampleExcelForMainInfo(currentNonReadaType);
  });

  function openBackupModal(type) {
    currentBackupType = type;
    uploadedBackupFile = null;
    uploadedBackupRows = [];
    const modal = modals.backup;
    const title = document.getElementById('backup-modal-title');
    const dropTitle = document.getElementById('backup-drop-title');
    const fileInp = document.getElementById('backup-file-upload');
    const previewBox = document.getElementById('backup-preview-box');
    const expectedCols = document.getElementById('backup-expected-cols');

    if (previewBox) previewBox.style.display = 'none';
    if (fileInp) fileInp.value = '';
    if (dropTitle) dropTitle.textContent = 'Click to Browse or Drag & Drop Excel File Here';

    if (type === 'info') {
      title.textContent = 'Read Trial Main Information From Backup / Excel File';
      if (expectedCols) expectedCols.textContent = 'Expected Columns: TRIAL_CODE, ESTATE, PLANTING_YEAR, DENSITY_TYPE, CONSTANT_DENSITY, FACTOR_DEFINITIONS';
    } else if (type === 'treatment') {
      title.textContent = 'Read Plot Treatment Data From Backup / Excel File';
      if (expectedCols) expectedCols.textContent = 'Expected Columns: PLOT_NO (or PLOT), SUB_PLOT, FACTOR1..FACTOR6 (or REP, D, N, P, K), DENSITY';
    } else {
      title.textContent = 'Read Palm Numbering From Backup / Excel File';
      if (expectedCols) expectedCols.textContent = 'Expected Columns: PLOT_NO (or PLOT), SUB_PLOT, PALM_NO, PROGENY, STATUS';
    }

    openModal(modal);
  }

  async function handleBackupFileSelect(file) {
    if (!file) return;
    uploadedBackupFile = file;
    uploadedBackupRows = [];
    const dropTitle = document.getElementById('backup-drop-title');
    if (dropTitle) dropTitle.textContent = `Selected: ${file.name}`;

    const box = document.getElementById('backup-preview-box');
    const txt = document.getElementById('backup-preview-text');
    const t = getCurrentTrial();

    let rowCountText = '';
    let colsText = '';
    try {
      if (window.XLSX) {
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        uploadedBackupRows = rows || [];
        rowCountText = ` (${uploadedBackupRows.length} rows in sheet "${sheetName}")`;
        if (uploadedBackupRows.length > 0) {
          colsText = `<br>Detected Columns: <code>${Object.keys(uploadedBackupRows[0]).join(', ')}</code>`;
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
        Ready to restore and replace current active records.
      `;
    }
  }

  document.getElementById('backup-file-upload')?.addEventListener('change', (e) => {
    handleBackupFileSelect(e.target.files[0]);
  });

  const backupDropZone = document.getElementById('backup-drop-zone');
  if (backupDropZone) {
    backupDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      backupDropZone.classList.add('dragover');
    });
    backupDropZone.addEventListener('dragleave', () => {
      backupDropZone.classList.remove('dragover');
    });
    backupDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      backupDropZone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) {
        handleBackupFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  function applyImportedMainInfoRows(t, type, rows) {
    if (!rows || rows.length === 0) return 0;
    if (type === 'info') {
      const r = rows[0];
      if (r.ESTATE || r.estate) t.estate = String(r.ESTATE || r.estate);
      if (r.PLANTING_YEAR || r.planting_year) t.plantingYear = Number(r.PLANTING_YEAR || r.planting_year);
      if (r.DENSITY_TYPE || r.density_type) t.densityType = String(r.DENSITY_TYPE || r.density_type);
      if (r.CONSTANT_DENSITY || r.constant_density) t.constantDensity = Number(r.CONSTANT_DENSITY || r.constant_density);
      if (r.FACTOR_DEFINITIONS || r.factor_definitions) t.factorInfo = String(r.FACTOR_DEFINITIONS || r.factor_definitions);
      if (window.ReadaSync && typeof window.ReadaSync.upsertTrial === 'function') {
        window.ReadaSync.upsertTrial(t);
      }
      return 1;
    } else if (type === 'treatment') {
      t.plotTreatments = rows.map((r, i) => ({
        rec: Number(r.REC_NO || r.rec || (i + 1)),
        plot: Number(r.PLOT_NO || r.PLOT || r.PLOT_ID || r.plot || (i + 1)),
        subPlot: String(r.SUB_PLOT || r.SUBPLOT || r.BLOCK || r.subPlot || ''),
        levels: [
          Number(r.FACTOR1 ?? r.REP ?? r.REP_CODE ?? 1),
          Number(r.FACTOR2 ?? r.D ?? r.DENS_LVL ?? 1),
          Number(r.FACTOR3 ?? r.N ?? r.N_LVL ?? 0),
          Number(r.FACTOR4 ?? r.P ?? r.P_LVL ?? 0),
          Number(r.FACTOR5 ?? r.K ?? r.K_LVL ?? 0),
          Number(r.FACTOR6 ?? r.L ?? r.L_LVL ?? 0)
        ],
        density: Number(r.DENSITY || r.SPACING || r.density || t.constantDensity || 148)
      }));
      if (window.ReadaSync && typeof window.ReadaSync.saveTreatments === 'function') {
        window.ReadaSync.saveTreatments(t.code, t.plotTreatments);
      }
      return t.plotTreatments.length;
    } else {
      t.palms = rows.map((r, i) => ({
        rec: Number(r.REC_NO || r.rec || (i + 1)),
        plot: Number(r.PLOT_NO || r.PLOT || r.plot || 1),
        subPlot: String(r.SUB_PLOT || r.SUBPLOT || r.subPlot || ''),
        palmNo: String(r.PALM_NO || r.PALM || r.palmNo || (i + 1)),
        progeny: String(r.PROGENY || r.progeny || 'D x P AVROS'),
        status: String(r.STATUS || r.status || 'Normal')
      }));
      if (window.ReadaSync && typeof window.ReadaSync.savePalms === 'function') {
        window.ReadaSync.savePalms(t.code, t.palms);
      }
      return t.palms.length;
    }
  }

  // Start Replacing Data From Backup File
  document.getElementById('btn-start-replace-backup')?.addEventListener('click', () => {
    if (!uploadedBackupFile) {
      showToast('Please select or drop an Excel file (.xlsx, .xls, .csv) first');
      return;
    }
    const t = getCurrentTrial();
    const count = applyImportedMainInfoRows(t, currentBackupType, uploadedBackupRows);
    showToast(`Restored ${count || uploadedBackupRows.length} record(s) for ${t.code} from "${uploadedBackupFile.name}"`);
    closeModal(modals.backup);
    refreshHeader();
  });

  // =========================================================================
  // FIGURES 10 & 14: Read From Excel File (*.xlsx / *.xls / *.csv)
  // =========================================================================
  function renderNonReadaPreview(ext) {
    const thead = document.getElementById('non-reada-table-head');
    const tbody = document.getElementById('non-reada-table-body');
    if (thead && tbody && ext && ext.fields) {
      thead.innerHTML = `<tr>${ext.fields.map(f => `<th>${f}</th>`).join('')}</tr>`;
      tbody.innerHTML = (ext.sampleRows || []).slice(0, 50).map(r => `
        <tr>${ext.fields.map(f => `<td style="font-family: var(--font-mono); font-size: 0.76rem;">${r[f] ?? ''}</td>`).join('')}</tr>
      `).join('');
    }
  }

  function openNonReadaModal(type) {
    currentNonReadaType = type;
    const modal = modals.nonReada;
    const t = getCurrentTrial();
    const title = document.getElementById('non-reada-modal-title');
    const dropTitle = document.getElementById('non-reada-drop-title');
    const fileInp = document.getElementById('non-reada-file-upload');

    document.getElementById('non-reada-code').textContent = t.code;
    document.getElementById('non-reada-estate').textContent = t.estate;
    if (fileInp) fileInp.value = '';
    if (dropTitle) dropTitle.textContent = 'Click to Browse or Drag & Drop Excel File Here';

    if (type === 'treatment') {
      title.textContent = "Import Trial Plot Treatment from Excel Spreadsheet";
    } else {
      title.textContent = "Import Palm Numbering from Excel Spreadsheet";
    }

    const ext = window.READA_EXTERNAL_DBF || { fields: [], sampleRows: [] };
    renderNonReadaPreview(ext);
    openModal(modal);
  }

  async function handleNonReadaFileSelect(file) {
    if (!file) return;
    const dropTitle = document.getElementById('non-reada-drop-title');
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
          window.READA_EXTERNAL_DBF = {
            fileName: file.name,
            fields: fields,
            sampleRows: rows
          };
          renderNonReadaPreview(window.READA_EXTERNAL_DBF);
          showToast(`Read ${rows.length} rows from Excel sheet "${sheetName}"`);
        }
      }
    } catch (err) {
      console.error(err);
      showToast(`Error parsing Excel file: ${err.message}`);
    }
  }

  // Handle Excel File Upload Input using SheetJS
  document.getElementById('non-reada-file-upload')?.addEventListener('change', (e) => {
    handleNonReadaFileSelect(e.target.files[0]);
  });

  const nonReadaDropZone = document.getElementById('non-reada-drop-zone');
  if (nonReadaDropZone) {
    nonReadaDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      nonReadaDropZone.classList.add('dragover');
    });
    nonReadaDropZone.addEventListener('dragleave', () => {
      nonReadaDropZone.classList.remove('dragover');
    });
    nonReadaDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      nonReadaDropZone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) {
        handleNonReadaFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  // Start Reading File & Map
  document.getElementById('btn-start-reading-file')?.addEventListener('click', () => {
    const t = getCurrentTrial();
    const ext = window.READA_EXTERNAL_DBF;
    if (ext && ext.sampleRows && ext.sampleRows.length > 0) {
      const count = applyImportedMainInfoRows(t, currentNonReadaType, ext.sampleRows);
      showToast(`Mapped ${count} external records into ${t.code}`);
    }
    refreshHeader();
    closeModal(modals.nonReada);
  });

  // =========================================================================
  // 2.4, 2.10, 2.15: Delete Confirmations
  // =========================================================================
  function openDeleteModal(type) {
    currentDeleteType = type;
    const t = getCurrentTrial();
    const modal = modals.confirmDelete;
    const title = document.getElementById('delete-modal-title');
    const msg = document.getElementById('delete-modal-msg');
    const warning = document.getElementById('delete-modal-warning');
    const confirmBtn = document.getElementById('btn-confirm-delete');

    if (type === 'info') {
      title.textContent = 'Delete Trial Information';
      msg.innerHTML = `Are you sure you want to permanently delete trial <strong>${t.code} (${t.estate})</strong>?`;
      if ((t.plotTreatments && t.plotTreatments.length > 0) || (t.palms && t.palms.length > 0)) {
        warning.innerHTML = `⚠️ <strong>Data Integrity Rule:</strong> Every data record (Plot Treatments and Palm Numbers) for ${t.code} must be deleted before deleting the main information. Please clear dependent records first!`;
        confirmBtn.disabled = true;
      } else {
        warning.innerHTML = `No dependent plot treatments or palms found. You can safely delete this trial.`;
        confirmBtn.disabled = false;
      }
    } else if (type === 'treatment') {
      title.textContent = 'Delete Plot Treatment Data';
      msg.innerHTML = `Are you sure you want to delete all <strong>${t.plotTreatments.length} plot treatments</strong> for <strong>${t.code}</strong>?`;
      warning.innerHTML = `This action cannot be undone.`;
      confirmBtn.disabled = false;
    } else {
      title.textContent = 'Delete Palm Numbering Data';
      msg.innerHTML = `Are you sure you want to delete all <strong>${t.palms.length} palm numbers</strong> for <strong>${t.code}</strong>?`;
      warning.innerHTML = `This action cannot be undone.`;
      confirmBtn.disabled = false;
    }

    openModal(modal);
  }

  document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
    const t = getCurrentTrial();
    if (currentDeleteType === 'info') {
      const codeToDelete = t.code;
      const idx = trials.findIndex(tr => tr.code === codeToDelete);
      if (idx !== -1) {
        trials.splice(idx, 1);
        currentCode = trials[0] ? trials[0].code : '';
        if (window.ReadaSync) {
          await window.ReadaSync.deleteTrial(codeToDelete);
        }
        showToast(`Deleted trial ${codeToDelete}`);
      }
    } else if (currentDeleteType === 'treatment') {
      t.plotTreatments = [];
      if (window.ReadaSync) {
        await window.ReadaSync.saveTreatments(t.code, []);
      }
      showToast(`Deleted plot treatments for ${t.code}`);
    } else {
      t.palms = [];
      if (window.ReadaSync) {
        await window.ReadaSync.savePalms(t.code, []);
      }
      showToast(`Deleted palm numbers for ${t.code}`);
    }

    refreshHeader();
    closeModal(modals.confirmDelete);
  });

  // =========================================================================
  // FIGURE 3: Wire Up the 15 Action Buttons
  // =========================================================================
  // Group 1: Trial Info (Trial Code)
  document.getElementById('btn-new-trial-info')?.addEventListener('click', () => openTrialInfoModal(true));
  document.getElementById('btn-edit-trial-info')?.addEventListener('click', () => openTrialInfoModal(false));
  document.getElementById('btn-save-info-dbf')?.addEventListener('click', () => openSaveDbfModal('info'));
  document.getElementById('btn-delete-trial-info')?.addEventListener('click', () => openDeleteModal('info'));
  document.getElementById('btn-read-info-backup')?.addEventListener('click', () => openBackupModal('info'));

  // Group 2: Plot Treatment
  document.getElementById('btn-entry-plot-treatment')?.addEventListener('click', async () => {
    const t = getCurrentTrial();
    if (window.ReadaSync && t) {
      await window.ReadaSync.loadTrialDetails(t);
    }
    openPlotTreatmentModal();
  });
  document.getElementById('btn-save-treatment-dbf')?.addEventListener('click', () => openSaveDbfModal('treatment'));
  document.getElementById('btn-read-treatment-backup')?.addEventListener('click', () => openBackupModal('treatment'));
  document.getElementById('btn-read-treatment-nonreada')?.addEventListener('click', () => openNonReadaModal('treatment'));
  document.getElementById('btn-delete-plot-treatment')?.addEventListener('click', () => openDeleteModal('treatment'));

  // Group 3: Palm Numbering
  document.getElementById('btn-entry-palm-numbering')?.addEventListener('click', async () => {
    const t = getCurrentTrial();
    if (window.ReadaSync && t) {
      await window.ReadaSync.loadTrialDetails(t);
    }
    openPalmNumberingModal();
  });
  document.getElementById('btn-save-palm-dbf')?.addEventListener('click', () => openSaveDbfModal('palm'));
  document.getElementById('btn-read-palm-backup')?.addEventListener('click', () => openBackupModal('palm'));
  document.getElementById('btn-read-palm-nonreada')?.addEventListener('click', () => openNonReadaModal('palm'));
  document.getElementById('btn-delete-palm-numbering')?.addEventListener('click', () => openDeleteModal('palm'));

  // Top Selector and Update Code List
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
    showToast('Trial code list refreshed from Supabase Cloud');
  });

  // =========================================================================
  // INTERACTIVE MAP PICKER FOR TRIAL GPS COORDINATES
  // =========================================================================
  let pickerMap = null;
  let pickerMarker = null;
  let selectedPickCoord = { lat: 4.0258, lng: 101.0189 };

  document.getElementById('select-preset-location')?.addEventListener('change', (e) => {
    if (e.target.value) {
      const [lat, lng] = e.target.value.split(',');
      const latInp = document.getElementById('info-latitude');
      const lngInp = document.getElementById('info-longitude');
      if (latInp) latInp.value = parseFloat(lat).toFixed(6);
      if (lngInp) lngInp.value = parseFloat(lng).toFixed(6);
      selectedPickCoord = { lat: parseFloat(lat), lng: parseFloat(lng) };
      showToast(`Selected preset: ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`);
    }
  });

  function openLocationPicker() {
    const modal = document.getElementById('modal-pick-location');
    if (!modal) return;

    // Reset search box state
    const searchInput = document.getElementById('picker-search-input');
    if (searchInput) searchInput.value = '';
    const searchClear = document.getElementById('btn-picker-search-clear');
    if (searchClear) searchClear.style.display = 'none';
    const resultsContainer = document.getElementById('picker-search-results');
    if (resultsContainer) {
      resultsContainer.style.display = 'none';
      resultsContainer.innerHTML = '';
    }

    const latInp = document.getElementById('info-latitude');
    const lngInp = document.getElementById('info-longitude');
    let startLat = latInp && latInp.value ? parseFloat(latInp.value) : 4.0258;
    let startLng = lngInp && lngInp.value ? parseFloat(lngInp.value) : 101.0189;
    if (isNaN(startLat) || isNaN(startLng)) {
      startLat = 4.0258;
      startLng = 101.0189;
    }
    selectedPickCoord = { lat: startLat, lng: startLng };

    openModal(modal);

    setTimeout(() => {
      initOrUpdatePickerMap(startLat, startLng);
    }, 180);
  }

  function initOrUpdatePickerMap(lat, lng) {
    const container = document.getElementById('picker-map-canvas');
    if (!container || !window.L) return;

    if (!pickerMap) {
      pickerMap = L.map('picker-map-canvas', {
        center: [lat, lng],
        zoom: 14,
        maxZoom: 19
      });

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'ESRI World Imagery'
      }).addTo(pickerMap);

      L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        attribution: ''
      }).addTo(pickerMap);

      pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(pickerMap);

      pickerMarker.on('dragend', function (e) {
        const coord = e.target.getLatLng();
        updatePickerDisplay(coord.lat, coord.lng);
      });

      pickerMap.on('click', function (e) {
        pickerMarker.setLatLng(e.latlng);
        updatePickerDisplay(e.latlng.lat, e.latlng.lng);
      });
    } else {
      pickerMap.invalidateSize();
      pickerMap.setView([lat, lng], 14);
      if (pickerMarker) pickerMarker.setLatLng([lat, lng]);
    }

    updatePickerDisplay(lat, lng);
  }

  function updatePickerDisplay(lat, lng) {
    selectedPickCoord = { lat, lng };
    const disp = document.getElementById('picker-coord-display');
    if (disp) {
      disp.textContent = `Lat: ${lat.toFixed(6)} , Lng: ${lng.toFixed(6)}`;
    }
  }

  // Preset Research Stations & Plantation Centers
  const STATION_SEARCH_PRESETS = [
    { title: "Teluk Intan Research Station", subtitle: "MPOB Station, Perak", lat: 4.0258, lng: 101.0189 },
    { title: "Sg. Papan Research Station", subtitle: "Kota Tinggi, Johor", lat: 1.5167, lng: 104.1833 },
    { title: "Bukit Paloh Research Station", subtitle: "Kluang, Johor", lat: 2.2333, lng: 103.2667 },
    { title: "MPOB Kluang Research Station", subtitle: "Johor", lat: 2.0333, lng: 103.3167 },
    { title: "Pamol Research Station", subtitle: "Sabah", lat: 5.9500, lng: 117.4167 },
    { title: "Malamba Research Station", subtitle: "Sabah", lat: 5.4833, lng: 118.0667 },
    { title: "MPOB Lahad Datu", subtitle: "Sabah", lat: 5.0200, lng: 118.3200 },
    { title: "MPOB Tawau Research Station", subtitle: "Sabah", lat: 4.2500, lng: 117.8800 },
    { title: "LPK Teluk Intan", subtitle: "Perak", lat: 4.0200, lng: 101.0250 },
    { title: "Gerdong Research Station", subtitle: "RISDA, Selangor", lat: 3.4167, lng: 101.3167 },
    { title: "MPOB Headquarters Bangi", subtitle: "Bandar Baru Bangi, Selangor", lat: 2.9800, lng: 101.7300 },
    { title: "MPOB Keratong Research Station", subtitle: "Pahang", lat: 3.1500, lng: 102.8500 },
    { title: "MPOB Miri Research Station", subtitle: "Sarawak", lat: 4.3800, lng: 113.9800 },
    { title: "MPOB Kuching Research Station", subtitle: "Sarawak", lat: 1.5500, lng: 110.3500 },
    { title: "MPOB Sandakan", subtitle: "Sabah", lat: 5.8402, lng: 118.1179 },
    { title: "Bintulu", subtitle: "Sarawak", lat: 3.1667, lng: 113.0333 },
    { title: "Sibu", subtitle: "Sarawak", lat: 2.2873, lng: 111.8305 },
    { title: "Segamat", subtitle: "Johor", lat: 2.5148, lng: 102.8158 },
    { title: "Batu Pahat", subtitle: "Johor", lat: 1.8548, lng: 102.9325 },
    { title: "Kulai", subtitle: "Johor", lat: 1.6631, lng: 103.6033 }
  ];

  function escapeSearchText(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function performLocationSearch() {
    const searchInput = document.getElementById('picker-search-input');
    const searchBtn = document.getElementById('btn-picker-search');
    const resultsContainer = document.getElementById('picker-search-results');
    if (!searchInput) return;

    const rawQuery = searchInput.value.trim();
    if (!rawQuery) {
      if (resultsContainer) resultsContainer.style.display = 'none';
      return;
    }

    // 1. Check if user typed coordinates like "4.0258, 101.0189" or "4.0258 101.0189"
    const coordMatch = rawQuery.match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        selectSearchResult(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        showToast(`Located GPS coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        return;
      }
    }

    // 2. Search local presets
    const qLower = rawQuery.toLowerCase();
    const localMatches = STATION_SEARCH_PRESETS.filter(p =>
      p.title.toLowerCase().includes(qLower) || p.subtitle.toLowerCase().includes(qLower)
    );

    // Show loading state
    if (searchBtn) {
      searchBtn.disabled = true;
      searchBtn.innerHTML = `<span>Searching...</span>`;
    }

    try {
      // 3. Query ESRI World Geocoding
      const esriUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(rawQuery)}&maxLocations=6`;
      const res = await fetch(esriUrl);
      const data = await res.json();
      const esriCandidates = (data.candidates || []).map(c => {
        const parts = (c.address || '').split(',');
        const mainTitle = parts[0].trim();
        const subtitle = parts.slice(1).join(',').trim() || c.address;
        return {
          title: mainTitle,
          subtitle: subtitle,
          lat: c.location.y,
          lng: c.location.x
        };
      });

      // Combine local matches + ESRI candidates (avoid exact duplicates)
      const combined = [...localMatches];
      esriCandidates.forEach(cand => {
        if (!combined.some(item => Math.abs(item.lat - cand.lat) < 0.001 && Math.abs(item.lng - cand.lng) < 0.001)) {
          combined.push(cand);
        }
      });

      if (combined.length === 1 && localMatches.length === 1) {
        // Direct single exact match
        selectSearchResult(combined[0].lat, combined[0].lng, combined[0].title);
        showToast(`Located: ${combined[0].title}`);
      } else {
        renderSearchResults(combined);
      }
    } catch (err) {
      console.warn('Geocoding query error:', err);
      if (localMatches.length > 0) {
        renderSearchResults(localMatches);
      } else {
        renderSearchResults([]);
      }
    } finally {
      if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <span>Search</span>
        `;
      }
    }
  }

  function renderSearchResults(items) {
    const container = document.getElementById('picker-search-results');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div style="padding: 14px 16px; font-size: 0.78rem; color: var(--text-muted); text-align: center;">
          No matching locations found for that search.<br>
          <span style="font-size: 0.72rem; color: var(--text-faint);">Try searching a nearby town (e.g. Teluk Intan, Kluang, Lahad Datu) or enter GPS coordinates directly.</span>
        </div>
      `;
      container.style.display = 'block';
      return;
    }

    container.innerHTML = items.slice(0, 8).map((item, idx) => `
      <div class="picker-search-item" data-idx="${idx}" style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; display: flex; align-items: flex-start; gap: 9px; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; color: var(--brand-green); margin-top: 3px; flex-shrink: 0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.82rem; font-weight: 600; color: #0f172a; line-height: 1.3;">${escapeSearchText(item.title)}</div>
          <div style="font-size: 0.72rem; color: #64748b; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeSearchText(item.subtitle || '')}</div>
        </div>
        <div style="font-family: var(--font-mono); font-size: 0.70rem; color: var(--brand-green); font-weight: 600; white-space: nowrap; margin-top: 2px;">
          ${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}
        </div>
      </div>
    `).join('');

    container.style.display = 'block';

    const itemEls = container.querySelectorAll('.picker-search-item');
    itemEls.forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx'), 10);
        const chosen = items[idx];
        if (chosen) {
          selectSearchResult(chosen.lat, chosen.lng, chosen.title);
        }
      });
    });
  }

  function selectSearchResult(lat, lng, title) {
    const container = document.getElementById('picker-search-results');
    if (container) container.style.display = 'none';

    const searchInput = document.getElementById('picker-search-input');
    if (searchInput && title) searchInput.value = title;

    const searchClear = document.getElementById('btn-picker-search-clear');
    if (searchClear) searchClear.style.display = 'block';

    if (pickerMap && pickerMarker) {
      pickerMap.flyTo([lat, lng], 15, {
        duration: 1.2,
        easeLinearity: 0.25
      });
      pickerMarker.setLatLng([lat, lng]);
    }
    updatePickerDisplay(lat, lng);
  }

  // Picker modal and search event listeners
  document.getElementById('btn-pick-location-map')?.addEventListener('click', openLocationPicker);

  const searchInputEl = document.getElementById('picker-search-input');
  const searchBtnEl = document.getElementById('btn-picker-search');
  const searchClearEl = document.getElementById('btn-picker-search-clear');

  searchBtnEl?.addEventListener('click', performLocationSearch);

  searchInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performLocationSearch();
    }
  });

  searchInputEl?.addEventListener('input', (e) => {
    if (searchClearEl) {
      searchClearEl.style.display = e.target.value.trim() ? 'block' : 'none';
    }
  });

  searchClearEl?.addEventListener('click', () => {
    if (searchInputEl) {
      searchInputEl.value = '';
      searchInputEl.focus();
    }
    if (searchClearEl) searchClearEl.style.display = 'none';
    const resultsContainer = document.getElementById('picker-search-results');
    if (resultsContainer) resultsContainer.style.display = 'none';
  });

  // Close search results dropdown on outside click
  document.addEventListener('click', (e) => {
    const resultsContainer = document.getElementById('picker-search-results');
    if (!resultsContainer || resultsContainer.style.display === 'none') return;
    if (!e.target.closest('#picker-search-results') && !e.target.closest('#picker-search-input') && !e.target.closest('#btn-picker-search')) {
      resultsContainer.style.display = 'none';
    }
  });

  document.getElementById('btn-close-map-picker')?.addEventListener('click', () => {
    closeModal(document.getElementById('modal-pick-location'));
  });

  document.getElementById('btn-cancel-location-pick')?.addEventListener('click', () => {
    closeModal(document.getElementById('modal-pick-location'));
  });

  document.getElementById('btn-confirm-location-pick')?.addEventListener('click', () => {
    const latInp = document.getElementById('info-latitude');
    const lngInp = document.getElementById('info-longitude');
    if (latInp) latInp.value = selectedPickCoord.lat.toFixed(6);
    if (lngInp) lngInp.value = selectedPickCoord.lng.toFixed(6);
    closeModal(document.getElementById('modal-pick-location'));
    showToast(`Set location to ${selectedPickCoord.lat.toFixed(6)}, ${selectedPickCoord.lng.toFixed(6)}`);
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
