// Language i18n Translation Dictionary
const i18nDict = {
    en: {
        langLabel: "Language:",
        navAbout: "About",
        navContact: "Contact",
        navProfile: "Profile",
        navDatabase: "Database",
        navPrivacy: "Privacy",
        navSettings: "Settings",
        btnSignOut: "Sign Out",
        btnBack: "← Back to Home",
        
        // Home Launcher (index.html)
        card1Title: "Comprehensive<br />Fertilizer Recommendation",
        card1Desc: "Detailed fertilizer analysis<br />Advanced agronomic rules",
        card2Title: "Standard<br />Fertilizer Recommendation",
        card2Desc: "Instant fertilizer analysis<br />Cadangan - cadangan asas",
        card3Title: "PalmnexReaDS",
        card3Desc: "PALMNEX Research and Database System",
        btnGetStarted: "Get Started",
        tooltipComingSoonComp: "Comprehensive section coming soon",
        tooltipComingSoonStd: "Standard section coming soon",
        tooltipComingSoonAbout: "About section coming soon",
        tooltipComingSoonContact: "Contact section coming soon",
        
        // Standard Advisory (standard.html)
        stdHeader: "Standard Fertilizer Recommendation",
        searchLocationTitle: "📍 Search Location / Coordinates",
        searchPlaceholder: "Place name or coordinates (e.g. 5.02, 118.32)...",
        searchHint: 'Enter place (e.g. "Lahad Datu", "Banting") or coordinates ("5.02, 118.32").',
        mapSelectTitle: "Map File Selection",
        labelSelectMap: "Select Map:",
        optionLahadDatu: "Lahad Datu with block boundary",
        optionSeraya: "Seraya with block boundary",
        uploadDesc: "Or upload custom .shp file(s):",
        btnUpload: "Upload",
        pointNutrientTitle: "Nutrient Detection",
        pointNutrientDesc: "Click on any spot inside the map boundary to check the nutrient detection of N, P, K, and Mg in each 10 meters Block.",
        coordDefault: "Coordinates: Click anywhere inside boundaries",
        zoneDefault: "Zone: Map boundary (Lahad Datu) loaded",
        estateDetailsTitle: "Estate Block & Agronomy Parameters",
        labelSelectBlock: "Select Block:",
        labelTargetYield: "Target Yield (t/ha/yr):",
        labelPalmAge: "Palm Age (Years):",
        labelSoilType: "Soil Type / Family:",
        btnCalculateStandard: "🧮 Calculate Standard Recommendation",
        btnGeneratePDF: "📄 Export PDF Report",
        
        // Comprehensive (comprehensive.html)
        compHeader: "Comprehensive Fertilizer Recommendation Engine",
        step1Title: "Step 1: Location & Estate Info",
        step2Title: "Step 2: Soil Chemical Analysis",
        step3Title: "Step 3: Foliar Leaf Analysis",
        step4Title: "Step 4: Nutrient Balance & Dosage",
        btnCalculateComp: "🧮 Run Comprehensive Analysis",
        
        // PALMNEX ReaDS (reada.html)
        readaHeader: "PalmnexReaDS",
        tabHome: "Home",
        tabTrialList: "List Of Available Trial Data",
        tabMainInfo: "Main Information",
        tabBunch: "Bunch Analysis",
        tabYield: "Yield Recording",
        tabVeg: "Vegetative Sampling",
        tabAnnual: "Annual Plot Data",
        tabExit: "Exit",
        brandTitle: "PalmnexReaDS",
        brandSub: "PALMNEX Research and Database System",
        brandVersion: "PalmnexReaDS Software V2.0 2026 by Palmnex",
        brandEngine: "MPOB Oil Palm Agronomic Research & Database Engine",
        
        // Banners & Titles
        bannerMainInfo: "TRIAL MAIN INFORMATION",
        bannerTrialList: "PERSISTENT AGRONOMY TRIALS DATABASE (SQLITE)",
        bannerBunch: "BUNCH ANALYSIS PROGRAM",
        bannerYield: "YIELD RECORDING PROGRAM",
        bannerVeg: "VEGETATIVE FIELD SAMPLING",
        bannerAnnual: "AGRONOMY TRIAL ANNUAL DATA",
        
        // Descriptions
        descBunch: "Compute Fruit-to-Bunch %, Mesocarp-to-Fruit %, Kernel-to-Fruit %, and Oil Extraction Rate (OER%) from fresh fruit bunch component weighings across experimental trial plots.",
        descYield: "Log harvest round FFB bunch counts, bunch weights, loose fruit weights, and calculate annual t/ha yield rates for persistent trial database records.",
        descVeg: "Record Frond 17 measurements, rachis cross-section dimensions (width x depth), leaflet count, leaf area index (LAI), and annual trunk height increment.",
        descAnnual: "Access and edit annual plot-level data including FFB yield records, foliar leaf tissue nutrient analysis (N, P, K, Mg, Ca, B), vegetative growth measurements, and soil chemical parameters.",
        
        // Operations & Buttons
        plotTreatmentOps: "Plot Treatment Operations",
        palmRegistryOps: "Palm Registry Operations",
        btnNewTrial: "➕ New Trial Info",
        btnEditTrial: "✏️ Edit Trial Info",
        btnReadBackup: "📁 Read Info From BackUp",
        btnExportCSV: "💾 Save Info Into *.csv File",
        btnDeleteTrial: "🗑️ Delete Trial Info",
        btnPrintSummary: "🖨️ Print Trial Info",
        btnWhatsThis: "❓ What's This?",
        
        btnPlotTreatmentEditor: "Entry / Editing Plot Treatment",
        btnReadTreatmentBackup: "Read Treatment Back Up File",
        btnImportNonReadaTreatment: "Treatment From 'Non-ReaDA' CSV File",
        btnSaveTreatmentCSV: "Save Treatment Into *.csv File",
        btnDeletePlotTreatment: "Delete Trial Plot Treatment",
        btnPrintPlotTreatment: "Print Trial Plot Treatment",
        
        btnPalmEditor: "Entry / Editing Palm Registry",
        btnReadPalmBackup: "Read Palm Registry Back Up File",
        btnImportNonReadaPalm: "Palm Registry From 'Non-ReaDA' CSV File",
        btnSavePalmCSV: "Save Palm Registry Into *.csv File",
        btnDeletePalm: "Delete Trial Palm Registry",
        btnPrintPalm: "Print Trial Palm Registry",
        
        btnNewBunch: "➕ New Bunch Analysis Data Entry",
        btnEditBunch: "✏️ Edit Bunch Analysis Data Entry",
        btnCalcBunch: "🧮 Calculate / Generate Bunch Analysis Data",
        btnPrintBunch: "🖨️ Print Bunch Analysis Data",
        btnReadBunchBackup: "📁 Read Bunch Analysis Back Up File",
        btnSaveBunchCSV: "💾 Save Bunch Analysis Into *.csv File",
        
        btnNewYield: "➕ New Yield Recording Data Entry",
        btnEditYield: "✏️ Edit Yield Recording Data Entry",
        btnCalcYield: "🧮 Calculate / Generate Annual FFB Yield Data",
        btnPrintYield: "🖨️ Print Yield Recording Data",
        btnSaveYieldCSV: "💾 Save Yield Recording Data To *.csv File",
        btnReadYieldBackup: "📁 Read Yield Recording Data From BackUp",
        btnImportNonReadaYield: "📂 Read Data From 'Non-ReaDA' *.csv File",
        
        btnNewVeg: "🌿 New Vegetative Field Sampling",
        btnEditVeg: "✏️ Edit Vegetative Field Data",
        btnPrintVeg: "🖨️ Print Vegetative Sampling Report",
        btnSaveVegCSV: "💾 Export Field Sampling To *.csv",
        
        btnNewAnnual: "➕ New Annual Data Entry",
        btnEditAnnual: "✏️ Edit Annual Data",
        btnViewAnnual: "📊 View Annual Plot Data",
        btnPrintAnnual: "🖨️ Print Annual Plot Data",
        btnCreateASCII: "📄 Create ASCII File Data",
        btnExportAnnualCSV: "💾 Save Info Into *.csv File",
        btnDeleteAnnual: "🗑️ Delete Annual Plot Data",
        btnReadAnnualBackup: "📁 Read Annual Plot Data Back Up",
        
        // Table Columns & Placeholders
        searchTrialPlaceholder: "Filter trial code, station, progeny, year...",
        colTrialCode: "Trial Code",
        colStation: "Station / Location",
        colProgeny: "Progeny / Cross",
        colDensity: "Density (p/ha)",
        colYearPlanted: "Year Planted",
        colPlotCount: "Plot Count",
        colPalmsPlot: "Palms / Plot",
        colAction: "Action",
        
        // Modal buttons
        btnReturnMainProc: "Return To Main Procedure",
        btnExitProg: "Exit Program",
        btnCancel: "Cancel",
        btnSaveConnect: "💾 Connect & Save"
    },
    ms: {
        langLabel: "Bahasa:",
        navAbout: "Info",
        navContact: "Hubungi Kami",
        navProfile: "Profil",
        navDatabase: "Pangkalan Data",
        navPrivacy: "Privasi",
        navSettings: "Tetapan",
        btnSignOut: "Log Keluar",
        btnBack: "← Kembali ke Home",
        
        // Home Launcher (index.html)
        card1Title: "Cadangan Baja<br />Komprehensif",
        card1Desc: "Analisis baja terperinci<br />Peraturan agronomi lanjutan",
        card2Title: "Cadangan Baja<br />Standard",
        card2Desc: "Analisis baja instant<br />Cadangan - cadangan asas",
        card3Title: "PalmnexReaDS",
        card3Desc: "PALMNEX Research and Database System",
        btnGetStarted: "Mula",
        tooltipComingSoonComp: "Bahagian akan datang",
        tooltipComingSoonStd: "Bahagian akan datang",
        tooltipComingSoonAbout: "Bahagian akan datang",
        tooltipComingSoonContact: "Bahagian akan datang",
        
        // Standard Advisory (standard.html)
        stdHeader: "Cadangan Baja Standard",
        searchLocationTitle: "📍 Cari Lokasi / Koordinat",
        searchPlaceholder: "Nama tempat atau koordinat (cth. 5.02, 118.32)...",
        searchHint: 'Masukkan tempat (cth. "Lahad Datu", "Banting") atau koordinat ("5.02, 118.32").',
        mapSelectTitle: "Pemilihan Fail Peta",
        labelSelectMap: "Pilih Peta:",
        optionLahadDatu: "Lahad Datu bersama sempadan blok",
        optionSeraya: "Seraya bersama sempadan blok",
        uploadDesc: "Atau muat naik fail .shp tersuai:",
        btnUpload: "Muat Naik",
        pointNutrientTitle: "Pengesanan Nutrien",
        pointNutrientDesc: "Klik pada mana-mana lokasi dalam sempadan peta untuk menyemak pengesanan nutrien N, P, K, dan Mg dalam setiap Blok 10 meter.",
        coordDefault: "Koordinat: Klik di mana-mana dalam sempadan",
        zoneDefault: "Zon: Sempadan peta (Lahad Datu) dimuatkan",
        estateDetailsTitle: "Parameter Blok Estet & Agronomi",
        labelSelectBlock: "Pilih Blok:",
        labelTargetYield: "Sasaran Hasil (t/ha/thn):",
        labelPalmAge: "Umur Sawit (Tahun):",
        labelSoilType: "Jenis Tanih / Famili:",
        btnCalculateStandard: "🧮 Kira Cadangan Standard",
        btnGeneratePDF: "📄 Eksport Laporan PDF",
        
        // Comprehensive (comprehensive.html)
        compHeader: "Enjin Cadangan Baja Komprehensif",
        step1Title: "Langkah 1: Lokasi & Maklumat Estet",
        step2Title: "Langkah 2: Analisis Kimia Tanih",
        step3Title: "Langkah 3: Analisis Daun",
        step4Title: "Langkah 4: Imbangan Nutrien & Dos",
        btnCalculateComp: "🧮 Jalankan Analisis Komprehensif",
        
        // PALMNEX ReaDS (reada.html)
        readaHeader: "PalmnexReaDS",
        tabHome: "Utama",
        tabTrialList: "Senarai Data Eksperimen",
        tabMainInfo: "Maklumat Utama",
        tabBunch: "Analisis Tandan",
        tabYield: "Rekod Hasil",
        tabVeg: "Persampelan Vegetatif",
        tabAnnual: "Data Plot Tahunan",
        tabExit: "Keluar",
        brandTitle: "PalmnexReaDS",
        brandSub: "PALMNEX Research and Database System",
        brandVersion: "Perisian PALMNEX ReaDS V2.0 2026 oleh Palmnex",
        brandEngine: "Enjin Penyelidikan & Pangkalan Data Agronomi Sawit MPOB",
        
        // Banners & Titles
        bannerMainInfo: "MAKLUMAT UTAMA EKSPERIMEN",
        bannerTrialList: "PANGKALAN DATA EKSPERIMEN AGRONOMI (SQLITE)",
        bannerBunch: "PROGRAM ANALISIS TANDAN",
        bannerYield: "PROGRAM REKOD HASIL",
        bannerVeg: "PERSAMPELAN VEGETATIF LAPANGAN",
        bannerAnnual: "DATA TAHUNAN PLOT EKSPERIMEN",
        
        // Descriptions
        descBunch: "Kira % Buah-ke-Tandan, % Mesokarp-ke-Buah, % Isirung-ke-Buah, dan Kadar Ekstraksi Minyak (OER%) daripada penimbangan komponen tandan buah segar merentasi plot eksperimen.",
        descYield: "Log bilangan tandan FFB pusingan tuaian, berat tandan, berat buah relai, dan kira kadar hasil tahunan t/ha untuk rekod pangkalan data eksperimen.",
        descVeg: "Rekod ukuran Pelepah 17, dimensi keratan rentas rakis (lebar x dalam), bilangan anak daun, indeks luas daun (LAI), dan pertambahan tinggi batang tahunan.",
        descAnnual: "Akses dan sunting data plot tahunan termasuk rekod hasil FFB, analisis nutrien tisu daun (N, P, K, Mg, Ca, B), ukuran pertumbuhan vegetatif, dan parameter kimia tanih.",
        
        // Operations & Buttons
        plotTreatmentOps: "Operasi Rawatan Plot",
        palmRegistryOps: "Operasi Pendaftaran Pohon Sawit",
        btnNewTrial: "➕ Maklumat Eksperimen Baharu",
        btnEditTrial: "✏️ Sunting Maklumat Eksperimen",
        btnReadBackup: "📁 Baca Maklumat Dari Sandaran",
        btnExportCSV: "💾 Simpan Maklumat Ke Fail *.csv",
        btnDeleteTrial: "🗑️ Padam Maklumat Eksperimen",
        btnPrintSummary: "🖨️ Cetak Laporan Ringkasan",
        btnWhatsThis: "❓ Apa Ini?",
        
        btnPlotTreatmentEditor: "Daftar / Sunting Rawatan Plot",
        btnReadTreatmentBackup: "Baca Fail Sandaran Rawatan",
        btnImportNonReadaTreatment: "Rawatan Dari Fail CSV 'Bukan-ReaDA'",
        btnSaveTreatmentCSV: "Simpan Rawatan Ke Fail *.csv",
        btnDeletePlotTreatment: "Padam Rawatan Plot Eksperimen",
        btnPrintPlotTreatment: "Cetak Rawatan Plot Eksperimen",
        
        btnPalmEditor: "Daftar / Sunting Pendaftaran Pohon",
        btnReadPalmBackup: "Baca Fail Sandaran Pendaftaran Pohon",
        btnImportNonReadaPalm: "Pendaftaran Pohon Dari Fail CSV 'Bukan-ReaDA'",
        btnSavePalmCSV: "Simpan Pendaftaran Pohon Ke Fail *.csv",
        btnDeletePalm: "Padam Pendaftaran Pohon Eksperimen",
        btnPrintPalm: "Cetak Pendaftaran Pohon Eksperimen",
        
        btnNewBunch: "➕ Daftar Data Analisis Tandan Baharu",
        btnEditBunch: "✏️ Sunting Data Analisis Tandan",
        btnCalcBunch: "🧮 Kira / Jana Data Analisis Tandan",
        btnPrintBunch: "🖨️ Cetak Data Analisis Tandan",
        btnReadBunchBackup: "📁 Baca Fail Sandaran Analisis Tandan",
        btnSaveBunchCSV: "💾 Simpan Analisis Tandan Ke Fail *.csv",
        
        btnNewYield: "➕ Daftar Data Rekod Hasil Baharu",
        btnEditYield: "✏️ Sunting Data Rekod Hasil",
        btnCalcYield: "🧮 Kira / Jana Data Hasil FFB Tahunan",
        btnPrintYield: "🖨️ Cetak Data Rekod Hasil",
        btnSaveYieldCSV: "💾 Simpan Data Rekod Hasil Ke Fail *.csv",
        btnReadYieldBackup: "📁 Baca Data Rekod Hasil Dari Sandaran",
        btnImportNonReadaYield: "📂 Baca Data Dari Fail *.csv 'Bukan-ReaDA'",
        
        btnNewVeg: "🌿 Persampelan Vegetatif Lapangan Baharu",
        btnEditVeg: "✏️ Sunting Data Vegetatif Lapangan",
        btnPrintVeg: "🖨️ Cetak Laporan Persampelan Vegetatif",
        btnSaveVegCSV: "💾 Eksport Persampelan Lapangan Ke *.csv",
        
        btnNewAnnual: "➕ Daftar Data Tahunan Baharu",
        btnEditAnnual: "✏️ Sunting Data Tahunan",
        btnViewAnnual: "📊 Papar Data Plot Tahunan",
        btnPrintAnnual: "🖨️ Cetak Data Plot Tahunan",
        btnCreateASCII: "📄 Cipta Data Fail ASCII",
        btnExportAnnualCSV: "💾 Simpan Maklumat Ke Fail *.csv",
        btnDeleteAnnual: "🗑️ Padam Data Plot Tahunan",
        btnReadAnnualBackup: "📁 Baca Sandaran Data Plot Tahunan",
        
        // Table Columns & Placeholders
        searchTrialPlaceholder: "Tapis kod eksperimen, stesen, baka, tahun...",
        colTrialCode: "Kod Eksperimen",
        colStation: "Stesen / Lokasi",
        colProgeny: "Baka / Kacukan",
        colDensity: "Kepadatan (p/ha)",
        colYearPlanted: "Tahun Ditanam",
        colPlotCount: "Bilangan Plot",
        colPalmsPlot: "Sawit / Plot",
        colAction: "Tindakan",
        
        // Modal buttons
        btnReturnMainProc: "Kembali Ke Prosedur Utama",
        btnExitProg: "Keluar Program",
        btnCancel: "Batal",
        btnSaveConnect: "💾 Sambung & Simpan"
    }
};

function toggleLangDropdown(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('lang-popover-menu');
    if (menu) {
        menu.classList.toggle('show');
    }
}

function selectLanguage(lang) {
    changeLanguage(lang);
    
    // Update trigger language text
    const langTextEl = document.getElementById('current-lang-text');
    if (langTextEl) {
        langTextEl.textContent = lang === 'ms' ? 'Bahasa Melayu' : 'English (UK)';
    }
    
    // Update active popover items
    document.querySelectorAll('.popover-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.querySelector(`.popover-item[onclick*="${lang}"]`);
    if (activeItem) activeItem.classList.add('active');

    // Close menu
    const menu = document.getElementById('lang-popover-menu');
    if (menu) menu.classList.remove('show');
}

function changeLanguage(lang) {
    try {
        localStorage.setItem('palmnex_lang', lang);
    } catch(e){}
    
    const dict = i18nDict[lang] || i18nDict.en;
    
    // 1. Text elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = dict[key];
            } else {
                el.innerHTML = dict[key];
            }
        }
    });

    // 2. Input placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[key]) {
            el.placeholder = dict[key];
        }
    });

    // 3. Tooltips and titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key]) {
            el.title = dict[key];
        }
    });
}
