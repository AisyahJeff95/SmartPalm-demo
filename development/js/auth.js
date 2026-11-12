// ============================================================================
// PALMNEX UNIFIED AUTHENTICATION & SSO MODULE (demo.palmnex.com.my <-> www.palmnex.com.my)
// Connected Supabase Project: https://dkafzakyeuehvpkkhdsa.supabase.co
// ============================================================================

// Master Toggle: Keep `false` during demo presentations so login is optional via the Top Panel button.
// Flip to `true` when ready to require login on startup across the entire demo.palmnex.com.my system.
window.PALMNEX_REQUIRE_LOGIN = false;

// Card Click Handler: Direct navigation (or gated if PALMNEX_REQUIRE_LOGIN is enabled)
function handleProtectedCardClick(targetUrl) {
    if (window.PALMNEX_REQUIRE_LOGIN && !isUserAuthenticated()) {
        openAuthModal('signin');
        return;
    }
    if (targetUrl) {
        window.location.href = targetUrl;
    }
}

// Global User State
let currentUser = null;

function isUserAuthenticated() {
    if (currentUser && currentUser.id) return true;
    const saved = localStorage.getItem('palmnex_user_session');
    return !!saved;
}

// Helper: Derive company_code from username/email (e.g. adminbenta1 -> benta, admin1 -> palmnex)
function deriveCompanyCodeFromUsername(rawUserOrEmail) {
    const clean = String(rawUserOrEmail || '').trim().toLowerCase().split('@')[0];
    if (!clean || clean === 'admin' || clean === 'admin1' || clean === 'superadmin' || clean.startsWith('adminpalmnex')) {
        return 'palmnex';
    }
    const m = clean.match(/^admin([a-z0-9_-]+?)(\d*)$/);
    if (m && m[1]) {
        return m[1];
    }
    return clean.replace(/[^a-z0-9_-]/g, '') || 'palmnex';
}

// Helper: Allowed modules array for Access Tier A, B, C
function getAllowedModulesForTier(tier) {
    const t = String(tier || 'C').toUpperCase();
    if (t === 'A') return ['home', 'standard'];
    if (t === 'B') return ['home', 'comprehensive', 'palmnexreads'];
    return ['home', 'comprehensive', 'standard', 'palmnexreads', 'kpsm'];
}

// Helper: Resolve private per-user storage_group (storage_<username>) vs Master Admin (storage_all)
function resolveUserStorageGroup(rawUsername, companyCode, tier, dbStorageGroup) {
    const cleanUser = String(rawUsername || '').trim().toLowerCase().split('@')[0].replace(/[^a-z0-9_-]/g, '');
    const cleanCompany = String(companyCode || '').trim().toLowerCase();
    const t = String(tier || 'C').toUpperCase();

    if (
        !cleanUser ||
        cleanUser === 'admin' ||
        cleanUser === 'admin1' ||
        cleanUser === 'superadmin' ||
        cleanUser.startsWith('adminpalmnex') ||
        (cleanCompany === 'palmnex' && t === 'C')
    ) {
        return 'storage_all';
    }
    if (dbStorageGroup && dbStorageGroup !== `storage_${cleanCompany}`) {
        return dbStorageGroup;
    }
    return `storage_${cleanUser}`;
}

// Global getters for other modules (prediction_cache_history.js, home_dashboard.js, comprehensive.html, standard.html)
window.getCurrentPalmnexUser = function () {
    if (currentUser) return currentUser;
    try {
        const saved = localStorage.getItem('palmnex_user_session');
        if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
};

window.getCurrentPalmnexAccessTier = function () {
    const u = window.getCurrentPalmnexUser();
    if (!u) return 'C'; // Default Demo Mode = full Access C
    return String(u.access_tier || 'C').toUpperCase();
};

window.getCurrentPalmnexStorageGroup = function () {
    const u = window.getCurrentPalmnexUser();
    if (!u) return 'storage_all';
    return u.storage_group || resolveUserStorageGroup(u.username || u.email, u.company_code, u.access_tier);
};

window.getCurrentPalmnexCompanyCode = function () {
    const u = window.getCurrentPalmnexUser();
    if (!u) return 'palmnex';
    return u.company_code || deriveCompanyCodeFromUsername(u.username || u.email);
};

// Toggle Password Visibility (Eye Icon in Auth Modal)
function toggleAuthPasswordVisibility(inputId = 'signin-password', iconId = 'icon-eye-signin-password') {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (icon) {
        if (isPassword) {
            // Eye-off (slashed eye) when password is visible
            icon.innerHTML = `
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            `;
            icon.style.color = '#34d399';
        } else {
            // Open eye when password is hidden
            icon.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            `;
            icon.style.color = '#94a3b8';
        }
    }
}
window.toggleAuthPasswordVisibility = toggleAuthPasswordVisibility;

// Ensure the Password input has the Eye Toggle button & updated label on every page
function ensureAuthModalEnhancements() {
    const passInput = document.getElementById('signin-password');
    if (passInput && !document.getElementById('btn-toggle-signin-password')) {
        const parent = passInput.parentNode;
        if (parent) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position: relative; display: flex; align-items: center; width: 100%;';
            parent.insertBefore(wrapper, passInput);
            wrapper.appendChild(passInput);
            passInput.style.width = '100%';
            passInput.style.paddingRight = '38px';

            const eyeBtn = document.createElement('button');
            eyeBtn.type = 'button';
            eyeBtn.id = 'btn-toggle-signin-password';
            eyeBtn.title = 'Show / Hide Password';
            eyeBtn.style.cssText = 'position: absolute; right: 10px; background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; z-index: 2;';
            eyeBtn.onclick = function () { toggleAuthPasswordVisibility('signin-password', 'icon-eye-signin-password'); };
            eyeBtn.innerHTML = `
                <svg id="icon-eye-signin-password" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#94a3b8;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            `;
            wrapper.appendChild(eyeBtn);
        }
    }

    const compInput = document.getElementById('signin-company');
    if (compInput && compInput.previousElementSibling && compInput.previousElementSibling.tagName === 'LABEL') {
        compInput.previousElementSibling.textContent = 'Estate Company Name';
    }
}

// Write shared cross-subdomain SSO cookie on .palmnex.com.my and decorate PalmNexReaDS links (Option B)
function syncPalmnexSsoState(user) {
    const activeUser = user || {
        id: 'usr_demo_admin1',
        email: 'admin1@palmnex.com.my',
        username: 'Admin',
        company: 'Palmnex Sdn Bhd',
        access_tier: 'C',
        storage_group: 'storage_all',
        user_metadata: { full_name: 'Admin' }
    };

    const tier = String(activeUser.access_tier || 'C').toUpperCase();
    // Access Tier A does not have access to PalmNexReaDS
    if (tier === 'A') {
        clearPalmnexSsoState();
        return;
    }

    const rawName = activeUser.username || activeUser.user_metadata?.username || activeUser.user_metadata?.full_name || (activeUser.email ? activeUser.email.split('@')[0] : 'Admin');
    const displayName = rawName.toLowerCase() === 'admin1' ? 'Admin' : rawName;
    const companyName = activeUser.company || activeUser.estate_company || activeUser.user_metadata?.estate_company || activeUser.user_metadata?.company_name || 'Palmnex Sdn Bhd';

    const ssoPayload = {
        id: activeUser.id || 'usr_demo_admin1',
        email: activeUser.email || `${rawName.toLowerCase()}@palmnex.com.my`,
        username: displayName,
        company: companyName,
        access_tier: tier,
        storage_group: activeUser.storage_group || 'storage_all',
        user_metadata: { full_name: `${displayName} (${companyName})` }
    };

    try {
        const encoded = encodeURIComponent(JSON.stringify(ssoPayload));
        const maxAge = 7 * 24 * 60 * 60; // 7 days
        // Set on .palmnex.com.my for cross-subdomain SSO between demo.palmnex.com.my and www.palmnex.com.my
        document.cookie = `reada_logged_in=true; path=/; domain=.palmnex.com.my; max-age=${maxAge}; SameSite=Lax`;
        document.cookie = `palmnex_sso_user=${encoded}; path=/; domain=.palmnex.com.my; max-age=${maxAge}; SameSite=Lax`;
        // Also set on current host for local/staging testing
        document.cookie = `reada_logged_in=true; path=/; max-age=${maxAge}; SameSite=Lax`;
        document.cookie = `palmnex_sso_user=${encoded}; path=/; max-age=${maxAge}; SameSite=Lax`;
        localStorage.setItem('reada_logged_in', 'true');
    } catch (e) {}

    decoratePalmnexReadsLinks(ssoPayload);
}

function clearPalmnexSsoState() {
    try {
        document.cookie = 'reada_logged_in=; path=/; domain=.palmnex.com.my; max-age=0; SameSite=Lax';
        document.cookie = 'palmnex_sso_user=; path=/; domain=.palmnex.com.my; max-age=0; SameSite=Lax';
        document.cookie = 'reada_logged_in=; path=/; max-age=0; SameSite=Lax';
        document.cookie = 'palmnex_sso_user=; path=/; max-age=0; SameSite=Lax';
        localStorage.removeItem('reada_logged_in');
    } catch (e) {}
}

// Append SSO handoff query parameters to all www.palmnex.com.my links on the page (Option B)
function decoratePalmnexReadsLinks(ssoUser) {
    const u = ssoUser || currentUser || { username: 'Admin', company: 'Palmnex Sdn Bhd', email: 'admin1@palmnex.com.my' };
    const rawName = u.username || u.user_metadata?.full_name || (u.email ? u.email.split('@')[0] : 'Admin');
    const company = u.company || 'Palmnex Sdn Bhd';

    const links = document.querySelectorAll('a[href*="palmnex.com.my"]');
    links.forEach(link => {
        try {
            const url = new URL(link.getAttribute('href'), window.location.origin);
            if (url.hostname === 'www.palmnex.com.my' || url.hostname === 'palmnex.com.my') {
                url.searchParams.set('sso', '1');
                url.searchParams.set('from', 'demo');
                url.searchParams.set('user', rawName);
                url.searchParams.set('company', company);
                link.setAttribute('href', url.toString());
            }
        } catch (e) {}
    });
}

// Apply RBAC Module Hiding (Top Panel Pills + Left Sidebar) & Direct URL Guard for Access Tiers A, B, C
function applyModuleAccessControl(user) {
    const tier = (user && user.access_tier) ? String(user.access_tier).toUpperCase() : 'C';
    const allowComp = (tier === 'B' || tier === 'C');
    const allowStd = (tier === 'A' || tier === 'C');
    const allowReads = (tier === 'B' || tier === 'C');
    const allowKpsm = (tier === 'C');

    const setElVisible = (el, visible) => {
        if (!el) return;
        if (visible) {
            el.style.removeProperty('display');
        } else {
            el.style.setProperty('display', 'none', 'important');
        }
    };

    // 1. Top Panel Navigation Pills (.sp-top-nav-pills)
    document.querySelectorAll('.sp-top-nav-pills a.sp-top-pill').forEach(a => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        if (href.includes('comprehensive')) setElVisible(a, allowComp);
        else if (href.includes('standard')) setElVisible(a, allowStd);
        else if (href.includes('palmnex.com.my') || href.includes('palmnexreads')) setElVisible(a, allowReads);
    });
    const topKpsm = document.getElementById('sp-top-kpsm-dropdown');
    setElVisible(topKpsm, allowKpsm);

    // 2. Left Sidebar Navigation (.cms-sidebar .cms-nav)
    document.querySelectorAll('.cms-sidebar .cms-nav > a.cms-nav-item').forEach(a => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        if (href.includes('comprehensive')) setElVisible(a, allowComp);
        else if (href.includes('standard')) setElVisible(a, allowStd);
        else if (href.includes('palmnex.com.my') || href.includes('palmnexreads')) setElVisible(a, allowReads);
        else if (href.includes('kpsm')) setElVisible(a, allowKpsm);
    });
    document.querySelectorAll('.cms-sidebar .cms-nav .cms-nav-group').forEach(group => {
        setElVisible(group, allowKpsm);
    });

    // 3. Enforce Direct URL Page Guard so restricted pages cannot be opened via URL bar
    enforceModulePageGuard(tier);

    // 4. Filter Estate Dropdowns / Home Dashboard if client user is logged in
    if (typeof window.applyCompanyEstateIsolation === 'function') {
        window.applyCompanyEstateIsolation(user);
    }
}
window.applyModuleAccessControl = applyModuleAccessControl;

function enforceModulePageGuard(tierInput) {
    const tier = String(tierInput || window.getCurrentPalmnexAccessTier() || 'C').toUpperCase();
    if (tier === 'C') return;

    const path = (window.location.pathname || '').toLowerCase();
    if (tier === 'A') {
        // Tier A: Home + Standard Fert ONLY
        if (path.includes('comprehensive') || path.includes('kpsm') || path.includes('palmnexreads')) {
            window.location.replace('standard.html');
        }
    } else if (tier === 'B') {
        // Tier B: Home + Comprehensive Fert + PalmNexReaDS ONLY
        if (path.includes('standard') || path.includes('kpsm')) {
            window.location.replace('comprehensive.html');
        }
    }
}

// Filter estate dropdown (#map-select-comp / #map-select-std) based on user's company_code & storage_group
window.applyCompanyEstateIsolation = function (user) {
    const activeUser = user || window.getCurrentPalmnexUser();
    const storageGroup = activeUser ? (activeUser.storage_group || resolveUserStorageGroup(activeUser.username, activeUser.company_code, activeUser.access_tier)) : 'storage_all';
    const companyCode = activeUser ? (activeUser.company_code || deriveCompanyCodeFromUsername(activeUser.username || activeUser.email)) : 'palmnex';
    const isMasterAdmin = (!activeUser || storageGroup === 'storage_all' || companyCode === 'palmnex' || String(activeUser.access_tier || 'C').toUpperCase() === 'C');

    const BENTA_KEYS = new Set(['agathis', 'belian', 'binuang', 'gaharu', 'kapur', 'keruing', 'menggaris', 'merbau', 'ramin', 'selanganbatu', 'seraya', 'benta_wawasan']);
    const FGV_KEYS = new Set(['jengka24', 'jengka25', 'kota_gelanggi5', 'ppptar', 'fgv_triang']);
    const MPOB_KEYS = new Set(['geolocation_ish', 'polygon_ish', 'soil_series', 'sekinchan1poly', 'lahad_datu_combined', 'mpob_keratong', 'mpob_lahad_datu', 'mpob_kluang', 'mpob_ukm', 'mpob_sessang', 'mpob_hulu_padas', 'mpob_belaga']);

    const isEstateAllowedForCompany = (val, text) => {
        if (isMasterAdmin) return true;
        if (!val) return true; // Keep placeholder option
        const vNorm = String(val).toLowerCase().replace(/shp$/i, '').replace(/[^a-z0-9_]/g, '');
        const tNorm = String(text || '').toLowerCase();
        // Always allow user's own uploaded custom maps
        if (vNorm.startsWith('custom_') || vNorm.includes(companyCode) || tNorm.includes(companyCode)) return true;
        if (companyCode === 'benta' || companyCode.includes('benta')) {
            return BENTA_KEYS.has(vNorm) || tNorm.includes('benta');
        }
        if (companyCode === 'fgv' || companyCode.includes('fgv')) {
            return FGV_KEYS.has(vNorm) || tNorm.includes('fgv') || tNorm.includes('jengka');
        }
        if (companyCode === 'mpob' || companyCode.includes('mpob')) {
            return MPOB_KEYS.has(vNorm) || tNorm.includes('mpob') || tNorm.includes('spoc');
        }
        // For new companies (e.g. achijaya), only show estates matching their company_code or custom uploads
        return false;
    };

    ['map-select-comp', 'map-select-std', 'map-select-kpsm'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel || !sel.options) return;
        Array.from(sel.options).forEach(opt => {
            if (!opt.value) return;
            const allowed = isEstateAllowedForCompany(opt.value, opt.text);
            opt.style.display = allowed ? '' : 'none';
            opt.disabled = !allowed;
        });
    });
};

// Open Auth Modal Dialog
function openAuthModal(defaultTab = 'signin') {
    ensureAuthModalEnhancements();
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'flex';
        switchAuthTab(defaultTab || 'signin');
        renderAuthModalSessionBanner();
    }
}

// Close Auth Modal Dialog (unless mandatory login gate is active and user is not signed in)
function closeAuthModal() {
    if (window.PALMNEX_REQUIRE_LOGIN && !isUserAuthenticated()) {
        showAuthError("Please sign in with your PalmnexReaDS username to access the system.");
        return;
    }
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Show active user status and Sign Out button inside the Auth Modal
function renderAuthModalSessionBanner() {
    const formSignin = document.getElementById('auth-form-signin');
    if (!formSignin) return;
    let banner = document.getElementById('auth-active-session-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'auth-active-session-banner';
        banner.style.cssText = 'display:none; align-items:center; justify-content:space-between; gap:10px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); padding:10px 12px; border-radius:8px; margin-bottom:14px; font-size:12px; color:#d1fae5;';
        formSignin.parentNode.insertBefore(banner, formSignin);
    }
    const saved = localStorage.getItem('palmnex_user_session');
    if (saved) {
        try {
            const u = JSON.parse(saved);
            const name = u.username || u.user_metadata?.full_name || (u.email ? u.email.split('@')[0] : 'Admin');
            const comp = u.company || u.estate_company || 'Palmnex Sdn Bhd';
            banner.innerHTML = `
                <div>
                    <div style="font-weight:700; color:#34d399;">Signed in as ${name}</div>
                    <div style="font-size:11px; color:#94a3b8;">${comp}</div>
                </div>
                <button type="button" onclick="handleSignOut()" style="background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.45); border-radius:6px; padding:5px 10px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;">Sign Out</button>
            `;
            banner.style.display = 'flex';
            return;
        } catch (e) {}
    }
    banner.style.display = 'none';
}

// Switch between Sign In and Sign Up Tabs (Sign Up disabled)
function switchAuthTab(tabName) {
    if (tabName === 'signup') {
        showAuthError("Registration is managed centrally via PalmnexReaDS / Administrator.");
        return;
    }

    const tabSignin = document.getElementById('auth-tab-signin');
    const tabSignup = document.getElementById('auth-tab-signup');
    const formSignin = document.getElementById('auth-form-signin');
    const formSignup = document.getElementById('auth-form-signup');
    const authError = document.getElementById('auth-error-msg');

    if (authError) authError.style.display = 'none';

    if (tabSignin) tabSignin.classList.add('active');
    if (tabSignup) tabSignup.classList.remove('active');
    if (formSignin) formSignin.style.display = 'block';
    if (formSignup) formSignup.style.display = 'none';
}

// Resolve user profile (username, company_code, company_name, access_tier, allowed_modules, storage_group) from Supabase `profiles` table
async function enrichSupabaseUserProfile(user, fallbackCompany, rawUsernameFallback) {
    if (!user) return null;
    const meta = user.user_metadata || {};
    let rawUsername = user.username || meta.username || rawUsernameFallback || (user.email ? user.email.split('@')[0] : 'Admin');
    let displayUsername = (rawUsername.toLowerCase() === 'admin1' || rawUsername === 'Lead Agronomist (Admin)') ? 'Admin' : rawUsername;

    const customTypedCompany = (fallbackCompany && fallbackCompany.trim() && fallbackCompany.trim() !== 'Palmnex Sdn Bhd')
        ? fallbackCompany.trim()
        : '';

    let companyCode = user.company_code || meta.company_code || deriveCompanyCodeFromUsername(rawUsername);
    const isPalmnexMaster = (companyCode === 'palmnex' || rawUsername.toLowerCase() === 'admin1' || rawUsername.toLowerCase().startsWith('adminpalmnex'));
    let accessTier = String(user.access_tier || meta.access_tier || (isPalmnexMaster ? 'C' : 'A')).toUpperCase();
    let allowedModules = Array.isArray(user.allowed_modules) ? user.allowed_modules : getAllowedModulesForTier(accessTier);
    let storageGroup = resolveUserStorageGroup(rawUsername, companyCode, accessTier, user.storage_group || meta.storage_group);
    let company = customTypedCompany || user.company || user.estate_company || meta.estate_company || meta.company_name || (companyCode === 'palmnex' ? 'Palmnex Sdn Bhd' : `${companyCode.charAt(0).toUpperCase() + companyCode.slice(1)} Estate`);

    // Query Supabase `public.profiles` table
    const client = typeof getSupabase === 'function' ? getSupabase() : (typeof supabase !== 'undefined' ? supabase : null);
    if (client && user.id && user.id !== 'admin1-id' && user.id !== 'usr_demo_admin1') {
        try {
            let { data: prof } = await client
                .from('profiles')
                .select('username, full_name, company_code, company_name, estate_company, access_tier, allowed_modules, storage_group')
                .eq('id', user.id)
                .maybeSingle();

            if (!prof && rawUsername) {
                const resByName = await client
                    .from('profiles')
                    .select('username, full_name, company_code, company_name, estate_company, access_tier, allowed_modules, storage_group')
                    .ilike('username', rawUsername.toLowerCase())
                    .maybeSingle();
                if (resByName && resByName.data) prof = resByName.data;
            }

            if (prof) {
                rawUsername = prof.username || rawUsername;
                displayUsername = (rawUsername.toLowerCase() === 'admin1') ? 'Admin' : (prof.username || prof.full_name || displayUsername);
                companyCode = prof.company_code || companyCode;
                accessTier = String(prof.access_tier || accessTier).toUpperCase();
                allowedModules = Array.isArray(prof.allowed_modules) && prof.allowed_modules.length
                    ? prof.allowed_modules
                    : getAllowedModulesForTier(accessTier);
                storageGroup = resolveUserStorageGroup(rawUsername, companyCode, accessTier, prof.storage_group);
                company = customTypedCompany || prof.estate_company || prof.company_name || company;
            }
        } catch (e) {
            // profiles table fallback
        }
    }

    const compInputEl = document.getElementById('signin-company');
    if (compInputEl && company) {
        compInputEl.value = company;
    }

    return Object.assign({}, user, {
        username: displayUsername,
        company: company,
        estate_company: company,
        company_code: companyCode,
        access_tier: accessTier,
        allowed_modules: allowedModules,
        storage_group: storageGroup
    });
}

// Sign In with PalmnexReaDS Username or Email & Password (connected to https://dkafzakyeuehvpkkhdsa.supabase.co)
async function handleEmailSignIn(event) {
    if (event) event.preventDefault();
    const rawInput = document.getElementById('signin-email')?.value?.trim();
    const companyInput = document.getElementById('signin-company')?.value?.trim() || 'Palmnex Sdn Bhd';
    const password = document.getElementById('signin-password')?.value;

    if (!rawInput || !password) {
        showAuthError("Please enter your PalmnexReaDS username/email and password.");
        return;
    }

    const cleanInput = rawInput.toLowerCase();

    // 1. Instant check for standard PalmnexReaDS / SmartPalm Master Admin demo credentials (admin1, mpob1998, porim1998)
    const isDemoAdminPass = (password === 'admin1' || password === 'mpob1998' || password === 'porim1998');
    const isPalmnexAdminUser = (cleanInput === 'admin1' || cleanInput === 'admin' || cleanInput === 'admin1@palmnex.com.my' || cleanInput === 'admin1@palmnex.mpob.gov.my' || cleanInput.startsWith('adminpalmnex'));
    if (isDemoAdminPass && isPalmnexAdminUser) {
        const displayUser = (cleanInput === 'admin1' || cleanInput === 'admin' || cleanInput.startsWith('admin1@'))
            ? 'Admin'
            : rawInput.split('@')[0];
        const adminUser = {
            email: rawInput.includes('@') ? rawInput : `${cleanInput}@palmnex.com.my`,
            username: displayUser,
            company: companyInput || 'Palmnex Sdn Bhd',
            estate_company: companyInput || 'Palmnex Sdn Bhd',
            company_code: 'palmnex',
            access_tier: 'C',
            allowed_modules: getAllowedModulesForTier('C'),
            storage_group: 'storage_all',
            id: 'usr_demo_admin1',
            role: 'admin',
            user_metadata: { full_name: displayUser }
        };
        localStorage.setItem('palmnex_user_session', JSON.stringify(adminUser));
        currentUser = adminUser;
        syncPalmnexSsoState(adminUser);
        updateTopNavUser(adminUser);
        applyModuleAccessControl(adminUser);
        renderAuthModalSessionBanner();
        if (typeof window.refreshMergedHistory === 'function') window.refreshMergedHistory();
        showAuthSuccess(`Welcome, ${displayUser}!`);
        setTimeout(() => {
            const successEl = document.getElementById('auth-success-msg');
            if (successEl) successEl.style.display = 'none';
            closeAuthModal();
        }, 400);
        return;
    }

    // 2. Auto-format plain PalmnexReaDS username to @palmnex.com.my (identical to www.palmnex.com.my)
    let emailToAuth = rawInput;
    if (!emailToAuth.includes('@')) {
        emailToAuth = cleanInput === 'admin1' ? 'admin1@palmnex.com.my' : `${rawInput}@palmnex.com.my`;
    }

    // 3. Supabase Auth check against https://dkafzakyeuehvpkkhdsa.supabase.co
    const client = typeof getSupabase === 'function' ? getSupabase() : (typeof supabase !== 'undefined' ? supabase : null);
    if (!client || !client.auth) {
        showAuthError("Invalid username or password.");
        return;
    }

    try {
        setAuthLoading(true);
        const { data, error } = await client.auth.signInWithPassword({
            email: emailToAuth,
            password: password
        });

        if (error) throw error;

        const plainUsername = rawInput.includes('@') ? rawInput.split('@')[0] : rawInput;
        const enrichedUser = await enrichSupabaseUserProfile(data.user, companyInput, plainUsername);
        localStorage.setItem('palmnex_user_session', JSON.stringify(enrichedUser));
        currentUser = enrichedUser;
        syncPalmnexSsoState(enrichedUser);
        updateTopNavUser(enrichedUser);
        applyModuleAccessControl(enrichedUser);
        renderAuthModalSessionBanner();
        if (typeof window.refreshMergedHistory === 'function') window.refreshMergedHistory();
        showAuthSuccess(`Signed in as ${enrichedUser.username} (${enrichedUser.company}).`);
        setTimeout(() => {
            const successEl = document.getElementById('auth-success-msg');
            if (successEl) successEl.style.display = 'none';
            closeAuthModal();
        }, 450);
    } catch (err) {
        showAuthError(err.message || "Invalid PalmnexReaDS username or password.");
    } finally {
        setAuthLoading(false);
    }
}

// Sign Out User
async function handleSignOut() {
    const client = typeof getSupabase === 'function' ? getSupabase() : (typeof supabase !== 'undefined' ? supabase : null);
    if (client && client.auth) {
        try {
            await client.auth.signOut();
        } catch(e) {}
    }
    localStorage.removeItem('palmnex_user_session');
    currentUser = null;
    clearPalmnexSsoState();
    renderAuthModalSessionBanner();
    if (window.PALMNEX_REQUIRE_LOGIN) {
        updateTopNavUser(null);
        openAuthModal('signin');
    } else {
        // In optional demo mode, keep default Admin display (Access C, storage_all) for seamless demo presentation
        const defaultDemoUser = {
            username: 'Admin',
            company: 'Palmnex Sdn Bhd',
            company_code: 'palmnex',
            access_tier: 'C',
            allowed_modules: getAllowedModulesForTier('C'),
            storage_group: 'storage_all',
            email: 'admin1@palmnex.com.my',
            id: 'usr_demo_admin1'
        };
        syncPalmnexSsoState(defaultDemoUser);
        updateTopNavUser(defaultDemoUser);
        applyModuleAccessControl(defaultDemoUser);
        if (typeof window.refreshMergedHistory === 'function') window.refreshMergedHistory();
        showAuthSuccess("Signed out. Reverted to default Demo Admin view.");
    }
}
window.handleSignOut = handleSignOut;

// Helper: Show Error Message
function showAuthError(msg) {
    const errorEl = document.getElementById('auth-error-msg');
    const successEl = document.getElementById('auth-success-msg');
    if (successEl) successEl.style.display = 'none';
    if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = msg ? 'block' : 'none';
    }
}

// Helper: Show Success Message
function showAuthSuccess(msg) {
    const errorEl = document.getElementById('auth-error-msg');
    const successEl = document.getElementById('auth-success-msg');
    if (errorEl) errorEl.style.display = 'none';
    if (successEl) {
        successEl.textContent = msg;
        successEl.style.display = msg ? 'block' : 'none';
    }
}

// Helper: Loading Indicator Toggle
function setAuthLoading(loading) {
    const btnSignin = document.getElementById('btn-auth-signin');
    if (btnSignin) {
        btnSignin.disabled = loading;
        btnSignin.textContent = loading ? 'Verifying...' : 'Sign In';
    }
}

// Update Top Navigation Bar & Home Welcome Banner according to user session state
function updateTopNavUser(user) {
    currentUser = user;
    const authBtnContainer = document.getElementById('top-nav-auth-container');
    const profileDropdown = document.querySelector('.profile-dropdown-container');
    const userEmailSpan = document.getElementById('nav-user-email');
    const welcomeTextEl = document.getElementById('sp-welcome-text');
    const avatarInitialsEl = document.querySelector('.sp-avatar-circle span:first-child');

    const rawUsername = (user && (user.username || user.user_metadata?.username || user.user_metadata?.full_name || user.email?.split('@')[0])) || 'Admin';
    const displayName = (rawUsername.toLowerCase() === 'admin1' || rawUsername === 'Lead Agronomist (Admin)') ? 'Admin' : rawUsername;
    const companyName = (user && (user.company || user.estate_company || user.user_metadata?.estate_company || user.user_metadata?.company_name)) || 'Palmnex Sdn Bhd';

    if (welcomeTextEl) {
        welcomeTextEl.innerHTML = `Welcome, <b>${displayName}</b>, from <b>${companyName}</b>!`;
    }
    if (avatarInitialsEl) {
        avatarInitialsEl.textContent = displayName.slice(0, 2).toUpperCase();
    }

    if (user) {
        if (authBtnContainer) authBtnContainer.style.display = 'none';
        if (profileDropdown) profileDropdown.style.display = 'inline-block';
        if (userEmailSpan) userEmailSpan.textContent = `${displayName} • ${companyName}`;
    } else {
        if (authBtnContainer) authBtnContainer.style.display = 'inline-block';
        if (profileDropdown) profileDropdown.style.display = 'none';
        if (userEmailSpan) userEmailSpan.textContent = window.PALMNEX_REQUIRE_LOGIN ? 'Sign In Required' : 'Admin • Palmnex Sdn Bhd';
    }
}

// Enforce full-system login gate only when window.PALMNEX_REQUIRE_LOGIN === true
function enforceSystemLoginGateIfEnabled() {
    if (!window.PALMNEX_REQUIRE_LOGIN) return;
    if (!isUserAuthenticated()) {
        openAuthModal('signin');
    }
}

// Listen to Auth Events on Load
document.addEventListener('DOMContentLoaded', async () => {
    ensureAuthModalEnhancements();

    // 1. Check local session first
    const savedLocalSession = localStorage.getItem('palmnex_user_session');
    if (savedLocalSession) {
        try {
            let userObj = JSON.parse(savedLocalSession);
            currentUser = userObj;
            syncPalmnexSsoState(userObj);
            updateTopNavUser(userObj);
            applyModuleAccessControl(userObj);

            // Refresh profile tier & storage_group from Supabase in background if real Supabase user
            if (userObj.id && userObj.id !== 'usr_demo_admin1' && userObj.id !== 'admin1-id') {
                enrichSupabaseUserProfile(userObj, userObj.company, userObj.username).then(refreshed => {
                    if (refreshed) {
                        localStorage.setItem('palmnex_user_session', JSON.stringify(refreshed));
                        currentUser = refreshed;
                        syncPalmnexSsoState(refreshed);
                        updateTopNavUser(refreshed);
                        applyModuleAccessControl(refreshed);
                    }
                }).catch(() => {});
            }
            return;
        } catch(e) {}
    }

    // 2. Check Supabase session (https://dkafzakyeuehvpkkhdsa.supabase.co)
    const client = typeof getSupabase === 'function' ? getSupabase() : (typeof supabase !== 'undefined' ? supabase : null);
    if (client && client.auth) {
        try {
            const { data } = await client.auth.getSession();
            if (data && data.session && data.session.user) {
                const enriched = await enrichSupabaseUserProfile(data.session.user);
                localStorage.setItem('palmnex_user_session', JSON.stringify(enriched));
                currentUser = enriched;
                syncPalmnexSsoState(enriched);
                updateTopNavUser(enriched);
                applyModuleAccessControl(enriched);
                return;
            }

            client.auth.onAuthStateChange(async (event, session) => {
                if (session && session.user) {
                    const enriched = await enrichSupabaseUserProfile(session.user);
                    localStorage.setItem('palmnex_user_session', JSON.stringify(enriched));
                    currentUser = enriched;
                    syncPalmnexSsoState(enriched);
                    updateTopNavUser(enriched);
                    applyModuleAccessControl(enriched);
                } else if (!localStorage.getItem('palmnex_user_session')) {
                    if (window.PALMNEX_REQUIRE_LOGIN) {
                        updateTopNavUser(null);
                        openAuthModal('signin');
                    } else {
                        const defaultUser = { username: 'Admin', company: 'Palmnex Sdn Bhd', company_code: 'palmnex', access_tier: 'C', storage_group: 'storage_all', email: 'admin1@palmnex.com.my' };
                        syncPalmnexSsoState(defaultUser);
                        updateTopNavUser(defaultUser);
                        applyModuleAccessControl(defaultUser);
                    }
                }
            });
        } catch(e) {}
    }

    // 3. Fallback when not logged in:
    // If PALMNEX_REQUIRE_LOGIN is true, prompt for login; otherwise default to Admin & set Access C for demo presentation
    if (window.PALMNEX_REQUIRE_LOGIN) {
        updateTopNavUser(null);
        enforceSystemLoginGateIfEnabled();
    } else {
        const defaultUser = { username: 'Admin', company: 'Palmnex Sdn Bhd', company_code: 'palmnex', access_tier: 'C', storage_group: 'storage_all', email: 'admin1@palmnex.com.my' };
        syncPalmnexSsoState(defaultUser);
        updateTopNavUser(defaultUser);
        applyModuleAccessControl(defaultUser);
    }
});
