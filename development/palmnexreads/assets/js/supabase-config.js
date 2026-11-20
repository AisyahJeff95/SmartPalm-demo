/**
 * Supabase Configuration & Data Synchronization Service for PalmnexReaDS
 * -----------------------------------------------------------------------
 * Handles real-time synchronization between browser state, localStorage,
 * and Supabase cloud Postgres database.
 */

const SUPABASE_URL = "https://dkafzakyeuehvpkkhdsa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrYWZ6YWt5ZXVlaHZwa2toZHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MTA3MTgsImV4cCI6MjEwMzQ4NjcxOH0.CmL8-LZ3XBrLZ1H_3ofUtCFcy5vNJFiMzEvdFbE-pQU";

// Global Supabase Client
window.supabaseClient = null;

window.getSupabase = function() {
  if (!window.supabaseClient && window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      console.log("PalmnexReaDS: Supabase Client initialized successfully!");
    } catch(e) {
      console.warn("Failed to initialize Supabase client:", e);
    }
  }
  return window.supabaseClient;
};

// Auto-initialize on script execution
window.getSupabase();

/**
 * ReadaSync: Central Supabase Data Access & Synchronization Engine
 */
window.ReadaSync = {

  getClient() {
    return window.getSupabase();
  },

  isOnline() {
    return !!this.getClient() && navigator.onLine;
  },

  /**
   * Fetch all trials from Supabase.
   * If Supabase is empty (e.g. freshly created tables), automatically seeds
   * the baseline trials (DTP1, etc.) from window.READA_TRIALS into Supabase.
   */
  async fetchTrials() {
    const client = this.getClient();
    if (!client) {
      console.warn("Supabase client unavailable, using local trials.");
      return window.READA_TRIALS || [];
    }

    try {
      const { data, error } = await client
        .from('trials')
        .select('*')
        .order('planting_year', { ascending: true })
        .order('code', { ascending: true });

      if (error) {
        console.error("Error fetching trials from Supabase:", error);
        return window.READA_TRIALS || [];
      }

      // If Supabase is empty, seed initial baseline data
      if (!data || data.length === 0) {
        console.log("Supabase trials table is empty. Auto-seeding baseline trials...");
        await this.seedInitialTrials();
        return window.READA_TRIALS || [];
      }

      // Map Supabase snake_case columns to app camelCase properties
      const formattedTrials = data.map(row => {
        // Find existing local trial object to keep default detail datasets in memory
        const local = (window.READA_TRIALS || []).find(t => t.code === row.code) || {};
        return {
          ...local,
          code: row.code,
          estate: row.estate,
          plantingYear: row.planting_year,
          factorsCount: row.factors_count,
          factors: Array.isArray(row.factors) ? row.factors : (local.factors || []),
          factorInfo: row.factor_info || local.factorInfo || '',
          densityType: row.density_type || local.densityType || 'constant',
          constantDensity: Number(row.constant_density) || local.constantDensity || 148,
          latitude: row.latitude ? Number(row.latitude) : local.latitude,
          longitude: row.longitude ? Number(row.longitude) : local.longitude,
          userId: row.user_id || null,
          createdByEmail: row.created_by_email || 'System Baseline',
          isBaseline: !row.user_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      });

      // Update global in-memory state
      window.READA_TRIALS = formattedTrials;
      try {
        localStorage.setItem('reada_supabase_trials_cache', JSON.stringify(formattedTrials));
      } catch (e) {}

      return formattedTrials;
    } catch (err) {
      console.error("Supabase fetchTrials failed:", err);
      return window.READA_TRIALS || [];
    }
  },

  /**
   * Seed baseline trials into Supabase when tables are empty
   */
  async seedInitialTrials() {
    const client = this.getClient();
    if (!client || !window.READA_TRIALS || window.READA_TRIALS.length === 0) return;

    for (const t of window.READA_TRIALS) {
      try {
        await this.saveTrial(t, false);
      } catch (err) {
        console.warn(`Failed seeding trial ${t.code}:`, err);
      }
    }
    console.log("Successfully seeded baseline trials into Supabase!");
  },

  /**
   * Save / Upsert Trial Main Information to Supabase
   */
  async saveTrial(trial, syncChildren = true) {
    const client = this.getClient();
    if (!client) return { error: 'Supabase client not available' };

    let currentUserId = null;
    let currentUserEmail = null;
    try {
      if (client.auth && typeof client.auth.getSession === 'function') {
        const { data: sData } = await client.auth.getSession();
        if (sData && sData.session && sData.session.user) {
          currentUserId = sData.session.user.id;
          currentUserEmail = sData.session.user.email;
        }
      }
    } catch (e) {}

    const payload = {
      code: trial.code,
      estate: trial.estate,
      planting_year: trial.plantingYear || 1988,
      factors_count: trial.factorsCount || (trial.factors ? trial.factors.length : 4),
      factors: trial.factors || [],
      factor_info: trial.factorInfo || '',
      density_type: trial.densityType || 'constant',
      constant_density: trial.constantDensity || 148,
      latitude: trial.latitude || null,
      longitude: trial.longitude || null,
      updated_at: new Date().toISOString()
    };

    // Attach user ownership if creating a user trial (not system baseline)
    if (trial.userId) {
      payload.user_id = trial.userId;
      if (trial.createdByEmail) payload.created_by_email = trial.createdByEmail;
    } else if (currentUserId && !trial.isBaseline) {
      payload.user_id = currentUserId;
      payload.created_by_email = currentUserEmail || 'Researcher';
    }

    try {
      const { data, error } = await client
        .from('trials')
        .upsert(payload, { onConflict: 'code' })
        .select();

      if (error) throw error;

      if (syncChildren) {
        if (trial.plotTreatments && trial.plotTreatments.length > 0) {
          await this.saveTreatments(trial.code, trial.plotTreatments);
        }
        if (trial.palms && trial.palms.length > 0) {
          await this.savePalms(trial.code, trial.palms);
        }
        if (trial.harvestRecords && trial.harvestRecords.length > 0) {
          await this.saveHarvestRecords(trial.code, 1997, trial.harvestRecords);
        }
      }

      // Update global in-memory state and cache immediately
      if (window.READA_TRIALS) {
        const existingIdx = window.READA_TRIALS.findIndex(t => t.code === trial.code);
        if (existingIdx !== -1) {
          window.READA_TRIALS[existingIdx] = { ...window.READA_TRIALS[existingIdx], ...trial };
        } else {
          window.READA_TRIALS.unshift({ ...trial });
        }
        try {
          localStorage.setItem('reada_supabase_trials_cache', JSON.stringify(window.READA_TRIALS));
        } catch (e) {}
      }

      console.log(`Saved trial ${trial.code} to Supabase!`);
      return { data, error: null };
    } catch (err) {
      console.error(`Error saving trial ${trial.code} to Supabase:`, err);
      return { data: null, error: err };
    }
  },

  /**
   * Save Plot Treatments to Supabase
   */
  async saveTreatments(trialCode, treatments) {
    const client = this.getClient();
    if (!client || !treatments || treatments.length === 0) return;

    try {
      // Delete existing treatments for this trial first to maintain clean order
      await client.from('trial_treatments').delete().eq('trial_code', trialCode);

      const rows = treatments.map((tr, idx) => ({
        trial_code: trialCode,
        plot_no: Number(tr.plot || idx + 1),
        sub_plot: tr.subPlot || '',
        levels: tr.levels || [],
        density: Number(tr.density || 160),
        rec_no: Number(tr.rec || idx + 1)
      }));

      const { data, error } = await client.from('trial_treatments').insert(rows);
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      console.error(`Error saving treatments for ${trialCode}:`, err);
      return { error: err };
    }
  },

  /**
   * Save Monitored Palms to Supabase
   */
  async savePalms(trialCode, palms) {
    const client = this.getClient();
    if (!client || !palms || palms.length === 0) return;

    try {
      await client.from('trial_palms').delete().eq('trial_code', trialCode);

      const rows = palms.map((p, idx) => ({
        trial_code: trialCode,
        plot_no: Number(p.plot || 1),
        sub_plot: p.subPlot || '',
        palm_no: String(p.palmNo || idx + 1),
        progeny: p.progeny || 'D x P',
        status: p.status || 'Healthy',
        rec_no: Number(p.rec || idx + 1)
      }));

      const { data, error } = await client.from('trial_palms').insert(rows);
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      console.error(`Error saving palms for ${trialCode}:`, err);
      return { error: err };
    }
  },

  /**
   * Save Harvesting Scale Records to Supabase
   */
  async saveHarvestRecords(trialCode, harvestYear, records) {
    const client = this.getClient();
    if (!client || !records || records.length === 0) return;

    try {
      await client
        .from('harvest_records')
        .delete()
        .eq('trial_code', trialCode)
        .eq('harvest_year', harvestYear || 1997);

      const rows = records.map((r, idx) => ({
        trial_code: trialCode,
        harvest_year: harvestYear || 1997,
        round_no: Number(r.round || 1),
        harvest_date: r.date || '',
        plot_no: Number(r.plot || 1),
        sub_plot: r.subPlot || '',
        palm_no: String(r.palmNo || ''),
        no_bunch: Number(r.nob || 0),
        bunch_weight_kg: Number(r.bunchWt || 0),
        loose_fruit_kg: Number(r.looseFruit || 0),
        harvester_id: r.harvesterId || '',
        remarks: r.remarks || ''
      }));

      const { data, error } = await client.from('harvest_records').insert(rows);
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      console.error(`Error saving harvest records for ${trialCode}:`, err);
      return { error: err };
    }
  },

  /**
   * Save Vegetative Sampling Records to Supabase
   */
  async saveVegetativeRecords(trialCode, records) {
    const client = this.getClient();
    if (!client || !records || records.length === 0) return;

    try {
      await client.from('vegetative_records').delete().eq('trial_code', trialCode);

      const rows = records.map((r, idx) => ({
        trial_code: trialCode,
        sample_year: r.year || 1997,
        plot_no: Number(r.plot || 1),
        sub_plot: r.subPlot || '',
        palm_no: String(r.palmNo || ''),
        frond_no: Number(r.frond || 17),
        rachis_len_cm: Number(r.rachisLen || 0),
        petiole_w_cm: Number(r.petioleW || 0),
        petiole_d_cm: Number(r.petioleD || 0),
        petiole_area_cm2: Number(r.petioleArea || 0),
        pinnae_count: Number(r.pinnaeCount || 0),
        leaflet_len_cm: Number(r.leafletLen || 0),
        leaflet_w_cm: Number(r.leafletW || 0),
        leaf_area_m2: Number(r.leafArea || 0),
        fdw_kg: Number(r.fdw || 0),
        trunk_ht_m: Number(r.trunkHt || 0)
      }));

      const { data, error } = await client.from('vegetative_records').insert(rows);
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      console.error(`Error saving vegetative records for ${trialCode}:`, err);
      return { error: err };
    }
  },

  /**
   * Save Annual Plot Data Summary (FFB, Leaf, Veg, Soil)
   */
  async saveAnnualPlotData(trialCode, category, period, rows) {
    const client = this.getClient();
    if (!client || !rows || rows.length === 0) return;

    try {
      await client
        .from('annual_plot_data')
        .delete()
        .eq('trial_code', trialCode)
        .eq('category', category)
        .eq('period', period);

      const insertRows = rows.map((r, idx) => ({
        trial_code: trialCode,
        category: category,
        period: period,
        plot_no: Number(r.plot || idx + 1),
        metrics: r
      }));

      const { data, error } = await client.from('annual_plot_data').insert(insertRows);
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      console.error(`Error saving annual plot data for ${trialCode}:`, err);
      return { error: err };
    }
  },

  /**
   * Save Trial Boundary (GIS)
   */
  async saveBoundary(trialCode, boundaryName, areaHectares, coordinates) {
    const client = this.getClient();
    if (!client || !coordinates) return;

    try {
      const payload = {
        trial_code: trialCode,
        boundary_name: boundaryName,
        area_hectares: Number(areaHectares) || 0,
        coordinates: coordinates
      };

      const { data, error } = await client.from('trial_boundaries').insert([payload]);
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      console.error(`Error saving boundary for ${trialCode}:`, err);
      return { error: err };
    }
  },

  /**
   * Delete Trial and all associated data from Supabase
   */
  async deleteTrial(trialCode) {
    const client = this.getClient();
    if (!client) return;

    try {
      const { data, error } = await client
        .from('trials')
        .delete()
        .eq('code', trialCode);

      if (error) throw error;

      // Update in-memory trials
      if (window.READA_TRIALS) {
        window.READA_TRIALS = window.READA_TRIALS.filter(t => t.code !== trialCode);
      }
      return { data, error: null };
    } catch (err) {
      console.error(`Error deleting trial ${trialCode}:`, err);
      return { error: err };
    }
  },

  /**
   * Hydrate full details for a trial (treatments, palms, harvest, boundaries)
   */
  async loadTrialDetails(trial) {
    const client = this.getClient();
    if (!client || !trial) return trial;

    try {
      // 1. Treatments
      const { data: treatData } = await client
        .from('trial_treatments')
        .select('*')
        .eq('trial_code', trial.code)
        .order('rec_no', { ascending: true });

      if (treatData && treatData.length > 0) {
        trial.plotTreatments = treatData.map(r => ({
          rec: r.rec_no,
          plot: r.plot_no,
          subPlot: r.sub_plot,
          levels: r.levels,
          density: Number(r.density)
        }));
      }

      // 2. Palms
      const { data: palmData } = await client
        .from('trial_palms')
        .select('*')
        .eq('trial_code', trial.code)
        .order('rec_no', { ascending: true });

      if (palmData && palmData.length > 0) {
        trial.palms = palmData.map(r => ({
          rec: r.rec_no,
          plot: r.plot_no,
          subPlot: r.sub_plot,
          palmNo: r.palm_no,
          progeny: r.progeny,
          status: r.status
        }));
      }

      // 3. Harvest records
      const { data: harvData } = await client
        .from('harvest_records')
        .select('*')
        .eq('trial_code', trial.code)
        .order('round_no', { ascending: true });

      if (harvData && harvData.length > 0) {
        trial.harvestRecords = harvData.map((r, i) => ({
          rec: i + 1,
          plot: r.plot_no,
          subPlot: r.sub_plot,
          palmNo: r.palm_no,
          round: r.round_no,
          date: r.harvest_date,
          nob: r.no_bunch,
          bunchWt: Number(r.bunch_weight_kg),
          looseFruit: Number(r.loose_fruit_kg),
          harvesterId: r.harvester_id,
          remarks: r.remarks
        }));
      }

      return trial;
    } catch (err) {
      console.warn(`Could not load full details from Supabase for ${trial.code}:`, err);
      return trial;
    }
  }

};
