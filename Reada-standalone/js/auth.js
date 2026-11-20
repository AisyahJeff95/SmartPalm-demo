// ============================================================================
// PALMNEX UNIFIED AUTHENTICATION & SSO MODULE (demo.palmnex.com.my <-> www.palmnex.com.my)
// Connected Supabase Project: https://dkafzakyeuehvpkkhdsa.supabase.co
// ============================================================================

// Master Toggle: Require login on startup across the entire demo.palmnex.com.my system.
window.PALMNEX_REQUIRE_LOGIN = true;

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

// Helper: Derive company_code from username/email (e.g. benta1@palmnex.com.my -> benta, fgv2@palmnex.com.my -> fgv, admin1 -> palmnex)
function deriveCompanyCodeFromUsername(rawUserOrEmail) {
    const clean = String(rawUserOrEmail || '').trim().toLowerCase().split('@')[0];
    if (!clean || clean === 'admin' || clean === 'admin1' || clean === 'superadmin' || clean.startsWith('adminpalmnex') || clean.startsWith('palmnex')) {
        return 'palmnex';
    }
    // Match <company><number> (e.g. benta1, fgv2, achijaya1) as well as legacy admin<company><number>
    const m = clean.match(/^(?:admin)?([a-z_-]+?)(\d*)$/);
    if (m && m[1]) {
        return m[1].replace(/^_+|_+$/g, '') || 'palmnex';
    }
    return clean.replace(/\d+$/g, '').replace(/[^a-z0-9_-]/g, '') || 'palmnex';
}

// Helper: Allowed modules array for Access Tier A, B, C
function getAllowedModulesForTier(tier) {
    const t = String(tier || 'C').toUpperCase();
    if (t === 'A') return ['home', 'standard'];
    if (t === 'B') return ['home', 'comprehensive', 'palmnexreads'];
    return ['home', 'comprehensive', 'standard', 'palmnexreads', 'kpsm'];
}

// Helper: Resolve private per-user storage_group (storage_<username> for Client Tiers A & B) vs Master Admin (storage_all for Tier C)
function resolveUserStorageGroup(rawUsername, companyCode, tier, dbStorageGroup) {
    const cleanUser = String(rawUsername || '').trim().toLowerCase().split('@')[0].replace(/[^a-z0-9_-]/g, '');
    const cleanCompany = String(companyCode || '').trim().toLowerCase();
    const t = String(tier || '').trim().toUpperCase();

    // Tier A and Tier B are always Client View with isolated per-user storage (e.g. storage_benta1)
    if (t === 'A' || t === 'B') {
        if (dbStorageGroup && dbStorageGroup !== 'storage_all' && dbStorageGroup !== `storage_${cleanCompany}`) {
            return dbStorageGroup;
        }
        return `storage_${cleanUser || 'client'}`;
    }

    // Tier C is Admin View (storage_all)
    if (
        t === 'C' ||
        !cleanUser ||
        cleanUser === 'admin' ||
        cleanUser === 'admin1' ||
        cleanUser === 'superadmin' ||
        cleanUser.startsWith('adminpalmnex') ||
        cleanUser.startsWith('palmnex') ||
        cleanCompany === 'palmnex'
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

// Ensure #auth-modal exists in the DOM and uses the formal split-screen login portal layout across all pages
function ensureAuthModalEnhancements() {
    if (!document.body) return;

    const portalInnerMarkup = `
        <!-- Left Panel: Only Brand Logo (wider to match Total Estate Company column, large clean logo without box/outline) -->
        <aside style="width: 350px; flex-shrink: 0; height: 100vh; background: #0c1017; border-right: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; user-select: none;">
            <div style="padding: 24px 28px 22px 28px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: flex-start;">
                <img src="MPOB-3.png" alt="MPOB PalmNex" style="width: 100%; max-width: 268px; height: auto; object-fit: contain; display: block;" />
            </div>
        </aside>

        <!-- Right Main Area: Animated Satellite Oil Palm Plantation Movie Backdrop & Centered Account Access Card -->
        <div style="flex: 1; height: 100vh; position: relative; display: flex; align-items: center; justify-content: center; padding: 32px; background: linear-gradient(135deg, rgba(8, 12, 20, 0.34) 0%, rgba(10, 15, 24, 0.44) 100%), url('login-bg.jpg') center/cover no-repeat; overflow-y: auto; overflow-x: hidden;">
            <video autoplay loop muted playsinline poster="login-bg.jpg" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; pointer-events: none;">
                <source src="login-bg.mp4" type="video/mp4" />
            </video>
            <div style="position: absolute; inset: 0; background: linear-gradient(135deg, rgba(8, 12, 20, 0.30) 0%, rgba(10, 15, 24, 0.42) 100%); z-index: 1; pointer-events: none;"></div>
            <div class="modal-content" style="max-width: 480px; width: 100%; background: rgba(18, 24, 36, 0.94); backdrop-filter: blur(8px); color: #f8fafc; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 42px 40px 32px 40px; position: relative; z-index: 2; box-shadow: 0 28px 72px rgba(0,0,0,0.68); font-family: 'Inter', sans-serif;">
                <button type="button" id="auth-modal-close-btn" style="position: absolute; top: 20px; right: 20px; background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer;" onclick="closeAuthModal()" title="Close">✕</button>

                <div style="text-align: center; margin-bottom: 30px;">
                    <img src="MPOB-3.png" alt="MPOB PalmNex" style="height: 54px; width: auto; max-width: 270px; object-fit: contain; display: block; margin: 0 auto 18px auto;" />
                    <h3 style="margin: 0 0 8px 0; font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px;">Account Access</h3>
                    <p style="margin: 0 0 6px 0; font-size: 14px; color: #94a3b8;">Sign in to sync your PALMNEX data</p>
                    <p style="margin: 0; font-size: 13px; font-weight: 600; color: #10b981;">SmartPalm: Precision Fertilization &amp; Monitoring System · MPOB</p>
                </div>

                <div id="auth-error-msg" style="display: none; background: rgba(239,68,68,0.14); color: #fca5a5; border: 1px solid rgba(239,68,68,0.45); padding: 12px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 18px;"></div>
                <div id="auth-success-msg" style="display: none; background: rgba(16,185,129,0.14); color: #6ee7b7; border: 1px solid rgba(16,185,129,0.45); padding: 12px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 18px;"></div>

                <form id="auth-form-signin" onsubmit="handleEmailSignIn(event)">
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                            <label for="signin-email" style="font-size: 13.5px; font-weight: 600; color: #e2e8f0;">Username or Email</label>
                            <span style="font-size: 12px; color: #64748b; font-weight: 500;">Supabase / MPOB</span>
                        </div>
                        <div style="position: relative; display: flex; align-items: center; width: 100%;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 14px; color: #64748b; pointer-events: none;">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <input type="text" id="signin-email" required placeholder="Enter your username or email" value="" class="sp-sched-input" style="height: 48px; font-size: 14.5px; width: 100%; padding-left: 42px; padding-right: 14px; background: #0c1017; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #f8fafc;" />
                        </div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                            <label for="signin-password" style="font-size: 13.5px; font-weight: 600; color: #e2e8f0;">Password</label>
                        </div>
                        <div style="position: relative; display: flex; align-items: center; width: 100%;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 14px; color: #64748b; pointer-events: none;">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                            <input type="password" id="signin-password" required placeholder="••••••••" value="" class="sp-sched-input" style="height: 48px; font-size: 14.5px; width: 100%; padding-left: 42px; padding-right: 44px; background: #0c1017; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #f8fafc;" />
                            <button type="button" id="btn-toggle-signin-password" onclick="toggleAuthPasswordVisibility('signin-password', 'icon-eye-signin-password')" title="Show / Hide Password" style="position: absolute; right: 12px; background: none; border: none; color: #94a3b8; cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center;">
                                <svg id="icon-eye-signin-password" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#94a3b8;">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; font-size: 13.5px; color: #94a3b8;">
                        <label style="display: inline-flex; align-items: center; gap: 9px; cursor: pointer; user-select: none;">
                            <input type="checkbox" checked style="accent-color: #10b981; width: 16px; height: 16px; cursor: pointer;" />
                            <span>Remember login session</span>
                        </label>
                        <span style="font-size: 12.5px; color: #64748b; font-weight: 500;">V2.0 2026</span>
                    </div>

                    <button type="submit" id="btn-auth-signin" style="width: 100%; height: 48px; font-size: 15px; font-weight: 600; color: #ffffff; background: #10b981; border: 1px solid #059669; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: none; transition: background 0.15s ease;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                            <polyline points="10 17 15 12 10 7"></polyline>
                            <line x1="15" y1="12" x2="3" y2="12"></line>
                        </svg>
                        <span>Sign In</span>
                    </button>
                </form>

                <div style="border-top: 1px solid rgba(255,255,255,0.08); margin-top: 26px; padding-top: 18px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #64748b; font-size: 12.5px; line-height: 1.5; text-align: center;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <span>Restricted Access: Authorized MPOB Agronomy &amp; Plantation Personnel Only</span>
                </div>
            </div>
        </div>
    `;

    let authDiv = document.getElementById('auth-modal');
    if (!authDiv) {
        authDiv = document.createElement('div');
        authDiv.id = 'auth-modal';
        authDiv.className = 'modal-overlay';
        authDiv.setAttribute('data-portal-v6', 'true');
        authDiv.style.cssText = 'display: none; flex-direction: row; align-items: stretch; justify-content: flex-start; z-index: 9999999; position: fixed; inset: 0; background: #0c1017; padding: 0;';
        authDiv.innerHTML = portalInnerMarkup;
        document.body.appendChild(authDiv);
    } else if (!authDiv.hasAttribute('data-portal-v6')) {
        const wasOpen = authDiv.style.display === 'flex';
        authDiv.setAttribute('data-portal-v6', 'true');
        authDiv.style.cssText = `display: ${wasOpen ? 'flex' : 'none'}; flex-direction: row; align-items: stretch; justify-content: flex-start; z-index: 9999999; position: fixed; inset: 0; background: #0c1017; padding: 0;`;
        authDiv.innerHTML = portalInnerMarkup;
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

// Append SSO handoff query parameters to all PalmNexReaDS links on the page (app.palmnex.com.my/PalmnexReaDS)
function decoratePalmnexReadsLinks(ssoUser) {
    const u = ssoUser || currentUser || { username: 'Admin', company: 'Palmnex Sdn Bhd', email: 'admin1@palmnex.com.my' };
    const rawName = u.username || u.user_metadata?.full_name || (u.email ? u.email.split('@')[0] : 'Admin');
    const company = u.company || 'Palmnex Sdn Bhd';

    const links = document.querySelectorAll('a[href*="PalmnexReaDS"], a[href*="palmnexreads"], a[href*="reada"], a[href*="palmnex.com.my"]');
    links.forEach(link => {
        try {
            const rawHref = link.getAttribute('href') || '';
            const url = new URL(rawHref, window.location.origin);
            const pathLower = (url.pathname || '').toLowerCase();
            if (
                pathLower.includes('palmnexreads') ||
                pathLower.includes('/reada') ||
                url.hostname === 'www.palmnex.com.my' ||
                url.hostname === 'palmnex.com.my'
            ) {
                url.searchParams.set('sso', '1');
                url.searchParams.set('from', 'app');
                url.searchParams.set('user', rawName);
                url.searchParams.set('company', company);
                // Keep relative path if originally relative to current origin
                if (!rawHref.startsWith('http://') && !rawHref.startsWith('https://')) {
                    const relPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
                    link.setAttribute('href', `${relPath}${url.search}${url.hash}`);
                } else {
                    link.setAttribute('href', url.toString());
                }
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

    // 4. Filter Estate Dropdowns / Home Dashboard & Load User's Custom Uploaded Maps from Supabase
    if (typeof window.applyCompanyEstateIsolation === 'function') {
        window.applyCompanyEstateIsolation(user);
    }
    if (typeof window.applyClientOrAdminReportRoleUI === 'function') {
        window.applyClientOrAdminReportRoleUI(user);
    }
    if (typeof window.loadCustomMapsFromSupabase === 'function') {
        window.loadCustomMapsFromSupabase(user);
    }
    if (typeof window.refreshHomeDashboardForUser === 'function') {
        window.refreshHomeDashboardForUser(user);
    }
}
window.applyModuleAccessControl = applyModuleAccessControl;

// Determine if the user is a Palmnex Master Admin (Tier C = Admin View; Tier A & B = Client View)
window.isPalmnexMasterAdmin = function (userOverride) {
    const u = userOverride || window.getCurrentPalmnexUser();
    if (!u) return !window.PALMNEX_REQUIRE_LOGIN;
    const tier = String(u.access_tier || '').trim().toUpperCase();
    // Access Tier A and B are Client View
    if (tier === 'A' || tier === 'B') {
        return false;
    }
    // Access Tier C is Admin View
    if (tier === 'C') {
        return true;
    }
    const rawName = String(u.username || u.email || '').trim().toLowerCase().split('@')[0];
    const companyCode = String(u.company_code || deriveCompanyCodeFromUsername(rawName) || '').toLowerCase();
    const storageGroup = String(u.storage_group || resolveUserStorageGroup(rawName, companyCode, u.access_tier) || '').toLowerCase();
    if (
        rawName === 'admin' ||
        rawName === 'admin1' ||
        rawName === 'superadmin' ||
        rawName.startsWith('adminpalmnex') ||
        rawName.startsWith('palmnex') ||
        companyCode === 'palmnex' ||
        storageGroup === 'storage_all'
    ) {
        return true;
    }
    return false;
};

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

// Ordered built-in estates per company for <company><number>@palmnex.com.my mapping & shapefile matching
const COMPANY_ORDERED_ESTATES = {
    benta: ['agathis', 'belian', 'binuang', 'gaharu', 'kapur', 'keruing', 'menggaris', 'merbau', 'ramin', 'selanganbatu', 'seraya'],
    fgv: ['jengka24', 'jengka25', 'kota_gelanggi5', 'ppptar'],
    ssb: ['boundary_mpob'],
    mpob: ['lahad_datu_combined', 'sekinchan1poly', 'geolocation_ish', 'polygon_ish', 'soil_series']
};

window.resolveBuiltInKeyFromNameOrKey = function (rawStr, compCode) {
    if (!rawStr) return '';
    const norm = String(rawStr)
        .toLowerCase()
        .replace(/^custom[_\s:]*/i, '')
        .replace(/^storage_[a-z0-9_]+?_/i, '')
        .replace(/\(\d+\s*blocks?\)/gi, '')
        .replace(/\.shp$/i, '')
        .replace(/[^a-z0-9]/g, '');
    if (!norm) return '';

    const cCode = String(compCode || '').toLowerCase();
    const candidatePools = [];
    if (cCode && COMPANY_ORDERED_ESTATES[cCode]) {
        candidatePools.push(COMPANY_ORDERED_ESTATES[cCode]);
    }
    Object.values(COMPANY_ORDERED_ESTATES).forEach(arr => {
        if (!candidatePools.includes(arr)) candidatePools.push(arr);
    });

    for (const pool of candidatePools) {
        for (const key of pool) {
            const kNorm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (norm === kNorm || norm.startsWith(kNorm) || norm.includes(kNorm)) {
                return key;
            }
        }
    }
    return '';
};

window.registerClientUploadedEstate = function (estateKey, userOverride) {
    try {
        if (!estateKey) return;
        const u = userOverride || window.getCurrentPalmnexUser();
        if (window.isPalmnexMasterAdmin(u)) return;
        const storageGroup = u
            ? (u.storage_group || resolveUserStorageGroup(u.username || u.email, u.company_code, u.access_tier))
            : window.getCurrentPalmnexStorageGroup();
        const companyCode = u
            ? (u.company_code || deriveCompanyCodeFromUsername(u.username || u.email))
            : window.getCurrentPalmnexCompanyCode();
        if (!storageGroup || storageGroup === 'storage_all') return;

        const resolvedKey = window.resolveBuiltInKeyFromNameOrKey(estateKey, companyCode) || estateKey;
        const lsKey = `palmnex_owned_estates_${storageGroup}`;
        let list = [];
        try {
            const raw = localStorage.getItem(lsKey);
            if (raw) list = JSON.parse(raw) || [];
        } catch (e) {}
        if (!Array.isArray(list)) list = [];
        if (!list.includes(resolvedKey)) list.push(resolvedKey);
        if (resolvedKey !== estateKey && !list.includes(estateKey)) list.push(estateKey);
        localStorage.setItem(lsKey, JSON.stringify(list));
    } catch (e) {}
};

window.getClientOwnedEstatesSet = function (userOverride) {
    const activeUser = userOverride || window.getCurrentPalmnexUser();
    const rawUsername = String((activeUser && (activeUser.username || activeUser.email)) || '').trim().toLowerCase().split('@')[0];
    const companyCode = activeUser
        ? (activeUser.company_code || deriveCompanyCodeFromUsername(rawUsername))
        : 'palmnex';
    const storageGroup = activeUser
        ? (activeUser.storage_group || resolveUserStorageGroup(rawUsername, companyCode, activeUser.access_tier))
        : 'storage_all';

    const ownedSet = new Set();
    if (window.isPalmnexMasterAdmin(activeUser)) {
        return ownedSet;
    }

    // 1. Check explicitly uploaded estates for this client account in localStorage
    try {
        const rawOwned = localStorage.getItem(`palmnex_owned_estates_${storageGroup}`);
        if (rawOwned) {
            const arr = JSON.parse(rawOwned);
            if (Array.isArray(arr)) {
                arr.forEach(k => {
                    if (!k) return;
                    ownedSet.add(k);
                    const matched = window.resolveBuiltInKeyFromNameOrKey(k, companyCode);
                    if (matched) ownedSet.add(matched);
                });
            }
        }
    } catch (e) {}

    // 2. Check custom uploaded .shp maps in memory or per-user localStorage cache (excluding submission-only metadata rows)
    const customList = [];
    if (Array.isArray(window.CUSTOM_SUPABASE_MAPS)) {
        customList.push(...window.CUSTOM_SUPABASE_MAPS);
    }
    try {
        const rawLocal = localStorage.getItem(`palmnex_custom_maps_${storageGroup}`);
        if (rawLocal) {
            const parsed = JSON.parse(rawLocal);
            if (Array.isArray(parsed)) customList.push(...parsed);
        }
    } catch (e) {}

    customList.forEach(row => {
        if (!row || !row.map_key) return;
        const rowGroup = String(row.storage_group || '').toLowerCase();
        if (rowGroup && rowGroup !== storageGroup) return;
        const isSubOnly = Boolean((row.geojson_data && row.geojson_data.is_submission_only) || String(row.map_key).startsWith('sub_'));
        if (isSubOnly) return;

        ownedSet.add(row.map_key);
        const matched = window.resolveBuiltInKeyFromNameOrKey(row.map_name || row.map_key, companyCode);
        if (matched) ownedSet.add(matched);
    });

    // 3. If client hasn't uploaded a different estate .shp, map <company><number>@palmnex.com.my to its assigned estate
    //    e.g., benta1 -> agathis, benta2 -> belian, ..., fgv1 -> jengka24, ssb1 -> boundary_mpob
    if (ownedSet.size === 0) {
        const numMatch = rawUsername.match(/(\d+)$/);
        const acctNum = numMatch ? Math.max(1, parseInt(numMatch[1], 10)) : 1;
        let compKey = companyCode;
        if (companyCode.includes('benta')) compKey = 'benta';
        else if (companyCode.includes('fgv')) compKey = 'fgv';
        else if (companyCode.includes('ssb') || companyCode.includes('softwood')) compKey = 'ssb';
        else if (companyCode.includes('mpob')) compKey = 'mpob';

        const orderedList = COMPANY_ORDERED_ESTATES[compKey] || [];
        if (orderedList.length > 0) {
            const assignedKey = orderedList[(acctNum - 1) % orderedList.length];
            if (assignedKey) ownedSet.add(assignedKey);
        }
    }

    return ownedSet;
};

// Snapshot & restore canonical built-in <optgroup> elements on a <select> so we can safely remove other companies' <optgroup>s from DOM for clients
window.restoreCanonicalSelectOptgroups = function (sel) {
    if (!sel) return;
    if (!sel._canonicalBuiltInOptgroups) {
        const builtInGroups = Array.from(sel.querySelectorAll('optgroup:not([data-custom-optgroup="true"])'));
        if (builtInGroups.length > 0) {
            sel._canonicalBuiltInOptgroups = builtInGroups.map(grp => {
                const clone = grp.cloneNode(true);
                Array.from(clone.querySelectorAll('option[data-custom-supabase="true"]')).forEach(o => o.remove());
                Array.from(clone.querySelectorAll('option')).forEach(o => {
                    o.disabled = false;
                    o.style.display = '';
                });
                return clone;
            });
        }
    }
    if (!sel._canonicalBuiltInOptgroups || sel._canonicalBuiltInOptgroups.length === 0) return;

    // Preserve any currently injected custom options (with their parent company group info)
    const customOptionsInfo = [];
    Array.from(sel.querySelectorAll('option[data-custom-supabase="true"]')).forEach(opt => {
        const parentGrp = opt.parentElement && opt.parentElement.tagName === 'OPTGROUP' ? opt.parentElement : null;
        customOptionsInfo.push({
            node: opt.cloneNode(true),
            companyGroup: (opt.getAttribute('data-company-group') || (parentGrp && parentGrp.getAttribute('data-company-group')) || '').toLowerCase(),
            companyLabel: (parentGrp && parentGrp.label) || ''
        });
    });

    const prevVal = sel.value;

    // Remove all existing optgroups and non-placeholder options
    Array.from(sel.querySelectorAll('optgroup')).forEach(g => g.remove());
    Array.from(sel.querySelectorAll('option')).forEach(o => {
        if (o.value !== '') o.remove();
    });

    // Re-append fresh clones of all canonical built-in optgroups (excluding any maps deleted by user via "✕")
    const deletedSet = typeof getDeletedMapsSet === 'function' ? getDeletedMapsSet() : new Set();
    sel._canonicalBuiltInOptgroups.forEach(canonGrp => {
        const grpClone = canonGrp.cloneNode(true);
        Array.from(grpClone.querySelectorAll('option')).forEach(o => {
            if (o.value && deletedSet.has(o.value)) o.remove();
        });
        if (grpClone.querySelectorAll('option').length > 0) {
            sel.appendChild(grpClone);
        }
    });

    // Re-attach custom options into their respective company optgroup
    customOptionsInfo.forEach(info => {
        if (info.node.value && deletedSet.has(info.node.value)) return;
        const grpCode = info.companyGroup || 'custom';
        let targetGrp = sel.querySelector(`optgroup[data-company-group="${grpCode}"]`);
        if (!targetGrp) {
            targetGrp = document.createElement('optgroup');
            targetGrp.label = info.companyLabel || formatCompanyNameFromCode(grpCode);
            targetGrp.setAttribute('data-company-group', grpCode);
            targetGrp.setAttribute('data-custom-optgroup', 'true');
            sel.appendChild(targetGrp);
        }
        if (!Array.from(targetGrp.querySelectorAll('option')).some(o => o.value === info.node.value)) {
            targetGrp.appendChild(info.node);
        }
    });

    if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
        sel.value = prevVal;
    }
};

// Filter estate dropdown (#map-select-comp / #map-select-std) based on user's company_code & storage_group:
// - Admin (Tier C): sees all companies and all estates enabled.
// - Client (Tier A & B):
//     1) Estates from OTHER companies are completely removed from the dropdown DOM (100% hidden).
//     2) Estates from the SAME company are shown under their company header, with ONLY the client's own estate(s) enabled and all other estates of the same company greyed out (disabled).
window.applyCompanyEstateIsolation = function (user) {
    const activeUser = user || window.getCurrentPalmnexUser();
    const storageGroup = activeUser ? (activeUser.storage_group || resolveUserStorageGroup(activeUser.username, activeUser.company_code, activeUser.access_tier)) : 'storage_all';
    const companyCode = activeUser ? (activeUser.company_code || deriveCompanyCodeFromUsername(activeUser.username || activeUser.email)) : 'palmnex';
    const isMasterAdmin = window.isPalmnexMasterAdmin(activeUser);
    const ownedEstatesSet = window.getClientOwnedEstatesSet(activeUser);

    const doesGroupMatchCompany = (grpCodeRaw) => {
        const grpCode = String(grpCodeRaw || '').toLowerCase();
        if (!grpCode) return false;
        if (grpCode === companyCode || grpCode === 'palmnex') return true;
        if (companyCode.includes('benta') && grpCode === 'benta') return true;
        if (companyCode.includes('fgv') && grpCode === 'fgv') return true;
        if ((companyCode.includes('ssb') || companyCode.includes('softwood')) && grpCode === 'ssb') return true;
        if (companyCode.includes('mpob') && grpCode === 'mpob') return true;
        return false;
    };

    ['map-select-comp', 'map-select-std', 'map-select-kpsm'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel || !sel.options) return;

        const prevVal = sel.value;
        window.restoreCanonicalSelectOptgroups(sel);

        if (isMasterAdmin) {
            Array.from(sel.querySelectorAll('optgroup')).forEach(grp => {
                grp.disabled = false;
                grp.style.display = '';
            });
            Array.from(sel.options).forEach(opt => {
                opt.disabled = false;
                opt.style.display = '';
            });
            if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
                sel.value = prevVal;
            }
            if (typeof window.updateSavedMapsDeleteUI === 'function') {
                window.updateSavedMapsDeleteUI();
            }
            return;
        }

        // Client View:
        // 1. Completely remove <optgroup> elements of OTHER companies from the DOM so native macOS <select> never shows them
        Array.from(sel.querySelectorAll('optgroup')).forEach(grp => {
            const grpCode = grp.getAttribute('data-company-group') || '';
            if (!doesGroupMatchCompany(grpCode)) {
                grp.remove();
            } else {
                grp.disabled = false;
                grp.style.display = '';
            }
        });

        // 2. Within the client's SAME company <optgroup>, enable ONLY the client's estate(s) and grey out (disable) all other estates in the same company
        Array.from(sel.options).forEach(opt => {
            if (!opt.value) return; // Keep "-- Select Map Boundary --" placeholder enabled
            const isCustomForUser = opt.getAttribute('data-custom-supabase') === 'true' &&
                (!opt.getAttribute('data-storage-group') || opt.getAttribute('data-storage-group') === storageGroup || opt.getAttribute('data-company-group') === 'palmnex');
            const isOwned = ownedEstatesSet.has(opt.value) || isCustomForUser;
            opt.disabled = !isOwned;
            opt.style.display = '';
        });

        // 3. If the previously selected option was from another company or is now disabled, reset selection to placeholder
        const stillValidOpt = Array.from(sel.options).find(o => o.value === prevVal && !o.disabled);
        sel.value = stillValidOpt ? prevVal : '';
    });
    if (typeof window.updateSavedMapsDeleteUI === 'function') {
        window.updateSavedMapsDeleteUI();
    }
};

// ============================================================================
// PHASE 2: PERMANENT UPLOADED MAPS, DELETE ("✕") WITH CONFIRMATION POPUP,
//          AND REAL-TIME LEFT-PANEL USER <-> ADMIN SUPABASE SYNC (`public.company_custom_maps`)
// ============================================================================
window.CUSTOM_SUPABASE_MAPS = window.CUSTOM_SUPABASE_MAPS || [];
window.CLIENT_SUBMISSIONS_BY_MAP_KEY = window.CLIENT_SUBMISSIONS_BY_MAP_KEY || {};

const SUPABASE_FALLBACK_URL_AUTH = 'https://dkafzakyeuehvpkkhdsa.supabase.co';
const SUPABASE_FALLBACK_KEY_AUTH = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrYWZ6YWt5ZXVlaHZwa2toZHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MTA3MTgsImV4cCI6MjEwMzQ4NjcxOH0.CmL8-LZ3XBrLZ1H_3ofUtCFcy5vNJFiMzEvdFbE-pQU';

function getDeletedMapsSet() {
    try {
        const raw = localStorage.getItem('palmnex_deleted_maps_v1');
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return new Set(arr);
        }
    } catch (e) {}
    return new Set();
}

function markMapDeletedLocally(mapKey, deleted) {
    try {
        const s = getDeletedMapsSet();
        if (deleted) s.add(mapKey);
        else s.delete(mapKey);
        localStorage.setItem('palmnex_deleted_maps_v1', JSON.stringify(Array.from(s)));
    } catch (e) {}
}

async function upsertCompanyCustomMapToSupabase(rowPayload) {
    let sdkOk = false;
    const client = typeof getSupabase === 'function' ? getSupabase() : null;
    if (client) {
        try {
            const { error } = await client
                .from('company_custom_maps')
                .upsert([rowPayload], { onConflict: 'storage_group,map_key' });
            if (!error) sdkOk = true;
            else console.warn('[SmartPalm Supabase Sync] SDK upsert note, trying REST fallback:', error.message);
        } catch (e) {}
    }
    if (!sdkOk) {
        try {
            const apiUrl = `${window.SUPABASE_URL || SUPABASE_FALLBACK_URL_AUTH}/rest/v1/company_custom_maps?on_conflict=storage_group,map_key`;
            const apiKey = window.SUPABASE_ANON_KEY || SUPABASE_FALLBACK_KEY_AUTH;
            await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey,
                    'Authorization': `Bearer ${apiKey}`,
                    'Prefer': 'resolution=merge-duplicates,return=minimal'
                },
                body: JSON.stringify([rowPayload])
            });
        } catch (e) {
            console.warn('[SmartPalm Supabase Sync] REST upsert warning:', e);
        }
    }
}

async function fetchCompanyCustomMapsFromSupabase(isMasterAdmin, storageGroup) {
    const client = typeof getSupabase === 'function' ? getSupabase() : null;
    if (client) {
        try {
            let query = client
                .from('company_custom_maps')
                .select('map_key, map_name, company_code, storage_group, geojson_data, uploaded_by, created_at')
                .order('created_at', { ascending: false })
                .limit(120);
            if (!isMasterAdmin && storageGroup) {
                query = query.or(`storage_group.eq.${storageGroup},company_code.eq.palmnex`);
            }
            const { data, error } = await query;
            if (!error && Array.isArray(data)) return data;
        } catch (e) {}
    }
    try {
        const baseUrl = `${window.SUPABASE_URL || SUPABASE_FALLBACK_URL_AUTH}/rest/v1/company_custom_maps`;
        const apiKey = window.SUPABASE_ANON_KEY || SUPABASE_FALLBACK_KEY_AUTH;
        const filter = (!isMasterAdmin && storageGroup)
            ? `&or=(storage_group.eq.${encodeURIComponent(storageGroup)},company_code.eq.palmnex)`
            : '';
        const res = await fetch(`${baseUrl}?select=map_key,map_name,company_code,storage_group,geojson_data,uploaded_by,created_at&order=created_at.desc&limit=120${filter}`, {
            headers: {
                'apikey': apiKey,
                'Authorization': `Bearer ${apiKey}`
            }
        });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) return data;
        }
    } catch (e) {}
    return [];
}

async function deleteCompanyCustomMapFromSupabase(mapKey, baseMapKey) {
    const keysToDelete = [mapKey];
    if (baseMapKey && baseMapKey !== mapKey) {
        keysToDelete.push(baseMapKey);
    }
    const client = typeof getSupabase === 'function' ? getSupabase() : null;
    if (client) {
        for (const k of keysToDelete) {
            try {
                await client.from('company_custom_maps').delete().eq('map_key', k);
            } catch (e) {}
        }
    }
    try {
        const baseUrl = `${window.SUPABASE_URL || SUPABASE_FALLBACK_URL_AUTH}/rest/v1/company_custom_maps`;
        const apiKey = window.SUPABASE_ANON_KEY || SUPABASE_FALLBACK_KEY_AUTH;
        for (const k of keysToDelete) {
            await fetch(`${baseUrl}?map_key=eq.${encodeURIComponent(k)}`, {
                method: 'DELETE',
                headers: {
                    'apikey': apiKey,
                    'Authorization': `Bearer ${apiKey}`
                }
            });
        }
    } catch (e) {}
}

window.saveCustomMapToSupabase = async function (rawMapKey, mapName, geojsonData) {
    try {
        if (!geojsonData || !geojsonData.features || !geojsonData.features.length) return null;
        const u = window.getCurrentPalmnexUser();
        const isMasterAdmin = window.isPalmnexMasterAdmin(u);
        const storageGroup = isMasterAdmin ? 'storage_all' : (window.getCurrentPalmnexStorageGroup() || 'storage_all');
        // When uploaded by Admin, company_code is always 'palmnex' (displayed under Company: Palmnex)
        const companyCode = isMasterAdmin ? 'palmnex' : (window.getCurrentPalmnexCompanyCode() || 'palmnex');
        const uploadedBy = (u && (u.username || u.email)) || 'Admin';

        const cleanDisplay = String(mapName || rawMapKey || 'Uploaded Estate')
            .replace(/^[📌📋]\s*(\[[^\]]+\]\s*)?/, '')
            .replace(/^Custom:\s*/i, '')
            .replace(/\.shp$/i, '')
            .trim();

        const cleanSlug = String(rawMapKey || cleanDisplay || 'estate')
            .toLowerCase()
            .replace(/^custom_/, '')
            .replace(/^storage_[a-z0-9_]+?_/, '')
            .replace(/[^a-z0-9_]+/g, '_')
            .replace(/^_+|_+$/g, '');
        const scopedKey = `custom_${storageGroup}_${cleanSlug}`;

        // Ensure this map key is not marked as deleted
        markMapDeletedLocally(scopedKey, false);
        markMapDeletedLocally(rawMapKey, false);

        // Record this uploaded estate as owned by this account
        window.registerClientUploadedEstate(scopedKey, u);

        // Snapshot current left-panel state into client_submission so initial upload state syncs to Admin immediately
        if (typeof window.collectCurrentClientInputs === 'function') {
            try {
                const liveInputs = window.collectCurrentClientInputs();
                geojsonData.client_submission = Object.assign({}, geojsonData.client_submission || {}, liveInputs, {
                    base_map_key: scopedKey,
                    submission_map_key: scopedKey,
                    map_display_name: cleanDisplay,
                    submitted_by: uploadedBy,
                    company_code: companyCode,
                    company_name: isMasterAdmin ? 'Palmnex' : formatCompanyNameFromCode(companyCode),
                    storage_group: storageGroup,
                    submitted_at: new Date().toISOString()
                });
                window.CLIENT_SUBMISSIONS_BY_MAP_KEY[scopedKey] = geojsonData.client_submission;
            } catch (e) {}
        } else if (window.CLIENT_SUBMISSIONS_BY_MAP_KEY && window.CLIENT_SUBMISSIONS_BY_MAP_KEY[scopedKey] && !geojsonData.client_submission) {
            geojsonData.client_submission = window.CLIENT_SUBMISSIONS_BY_MAP_KEY[scopedKey];
        }

        geojsonData.is_custom_upload = true;
        geojsonData.is_submission_only = false;
        geojsonData.mapName = cleanDisplay;
        geojsonData.uploaded_company_code = companyCode;
        geojsonData.uploaded_company_name = isMasterAdmin ? 'Palmnex' : formatCompanyNameFromCode(companyCode);

        if (typeof window.REAL_MAPS_DATA === 'object' && window.REAL_MAPS_DATA) {
            window.REAL_MAPS_DATA[scopedKey] = geojsonData;
            if (rawMapKey) window.REAL_MAPS_DATA[rawMapKey] = geojsonData;
        }

        const rowPayload = {
            map_key: scopedKey,
            map_name: cleanDisplay,
            company_code: companyCode,
            storage_group: storageGroup,
            geojson_data: geojsonData,
            uploaded_by: uploadedBy,
            created_at: new Date().toISOString()
        };

        // 1. Save to local per-user storage cache and global shared cache immediately
        for (const lsKey of [`palmnex_custom_maps_${storageGroup}`, 'palmnex_custom_maps_all_v2']) {
            try {
                const existingRaw = localStorage.getItem(lsKey);
                const list = existingRaw ? (JSON.parse(existingRaw) || []) : [];
                const filtered = list.filter(item => item && item.map_key !== scopedKey);
                filtered.unshift(rowPayload);
                localStorage.setItem(lsKey, JSON.stringify(filtered.slice(0, 40)));
            } catch (e) {}
        }

        // 2. Upsert to Supabase `public.company_custom_maps` (SDK + REST fallback)
        await upsertCompanyCustomMapToSupabase(rowPayload);

        // 3. Refresh in-memory list, dropdowns & Home Dashboard
        await window.loadCustomMapsFromSupabase(u);
        return scopedKey;
    } catch (err) {
        console.warn('[SmartPalm Custom Map Sync] Exception:', err);
        return null;
    }
};

// Complete Left-Panel Client Input Submission saver for both custom uploaded maps and built-in maps
window.saveClientMapSubmissionToSupabase = async function (rawMapKey, mapDisplayName, submissionPayload) {
    try {
        if (!rawMapKey || !submissionPayload) return null;
        const u = window.getCurrentPalmnexUser();
        const isMasterAdmin = window.isPalmnexMasterAdmin(u);
        const storageGroup = window.getCurrentPalmnexStorageGroup() || 'storage_all';
        const companyCode = isMasterAdmin ? 'palmnex' : (window.getCurrentPalmnexCompanyCode() || 'palmnex');
        const uploadedBy = (u && (u.username || u.email)) || 'Client';

        // Resolve underlying base map key if user currently selected a `sub_...` option
        const existingSub = window.CLIENT_SUBMISSIONS_BY_MAP_KEY[rawMapKey];
        const baseMapKey = (existingSub && existingSub.base_map_key)
            ? existingSub.base_map_key
            : String(rawMapKey).replace(/^sub_storage_[a-z0-9_]+?_/, '');

        const isCustomMap = String(baseMapKey).startsWith('custom_');
        // Lookup existing custom map row so we preserve its original storage_group and polygon features
        const existingCustomRow = isCustomMap
            ? (window.CUSTOM_SUPABASE_MAPS || []).find(r => r && r.map_key === baseMapKey)
            : null;
        const effectiveStorageGroup = (existingCustomRow && existingCustomRow.storage_group)
            ? existingCustomRow.storage_group
            : storageGroup;
        const effectiveCompanyCode = (existingCustomRow && existingCustomRow.company_code)
            ? existingCustomRow.company_code
            : companyCode;

        const targetRowKey = isCustomMap
            ? baseMapKey
            : `sub_${storageGroup}_${baseMapKey}`;

        const cleanDisplayName = String(mapDisplayName || (existingCustomRow && existingCustomRow.map_name) || baseMapKey)
            .replace(/^[📌📋]\s*(\[[^\]]+\]\s*)?/, '')
            .replace(/^Custom:\s*/i, '')
            .replace(/\s*\(Client Inputs\)$/i, '')
            .trim();

        const enrichedSubmission = Object.assign({}, submissionPayload, {
            base_map_key: baseMapKey,
            submission_map_key: targetRowKey,
            map_display_name: cleanDisplayName,
            submitted_by: uploadedBy,
            company_code: effectiveCompanyCode,
            company_name: effectiveCompanyCode === 'palmnex' ? 'Palmnex' : ((u && u.company) || formatCompanyNameFromCode(effectiveCompanyCode)),
            storage_group: effectiveStorageGroup,
            submitted_at: new Date().toISOString()
        });

        // Cache in memory by both targetRowKey and baseMapKey
        window.CLIENT_SUBMISSIONS_BY_MAP_KEY[targetRowKey] = enrichedSubmission;
        window.CLIENT_SUBMISSIONS_BY_MAP_KEY[baseMapKey] = enrichedSubmission;

        // Also cache in global localStorage index (`palmnex_client_submissions_all`) so Admin on same browser sees it immediately
        try {
            const allSubsRaw = localStorage.getItem('palmnex_client_submissions_all');
            const allSubs = allSubsRaw ? (JSON.parse(allSubsRaw) || {}) : {};
            allSubs[targetRowKey] = enrichedSubmission;
            allSubs[baseMapKey] = enrichedSubmission;
            localStorage.setItem('palmnex_client_submissions_all', JSON.stringify(allSubs));
        } catch (e) {}

        let geojsonPayload = null;
        if (isCustomMap) {
            // Preserve the custom uploaded map's polygon features — NEVER overwrite with empty features or is_submission_only: true!
            const existingGeojson = (window.REAL_MAPS_DATA && window.REAL_MAPS_DATA[baseMapKey])
                || (existingCustomRow && existingCustomRow.geojson_data)
                || null;
            if (existingGeojson && Array.isArray(existingGeojson.features) && existingGeojson.features.length > 0) {
                geojsonPayload = Object.assign({}, existingGeojson, {
                    is_custom_upload: true,
                    is_submission_only: false,
                    mapName: cleanDisplayName,
                    client_submission: enrichedSubmission
                });
                if (window.REAL_MAPS_DATA) {
                    window.REAL_MAPS_DATA[baseMapKey] = geojsonPayload;
                }
            }
        }

        if (!geojsonPayload) {
            // Zero-bloat (< 2 KB) metadata-only FeatureCollection referencing the built-in estate key
            geojsonPayload = {
                type: 'FeatureCollection',
                is_submission_only: true,
                base_map_key: baseMapKey,
                mapName: `${cleanDisplayName} (Client Inputs)`,
                features: [],
                client_submission: enrichedSubmission
            };
        }

        const rowPayload = {
            map_key: targetRowKey,
            map_name: isCustomMap ? cleanDisplayName : `${cleanDisplayName} (Client Inputs)`,
            company_code: effectiveCompanyCode,
            storage_group: effectiveStorageGroup,
            geojson_data: geojsonPayload,
            uploaded_by: uploadedBy,
            created_at: new Date().toISOString()
        };

        // 1. Save to local per-user storage cache and global cache
        for (const lsKey of [`palmnex_custom_maps_${effectiveStorageGroup}`, 'palmnex_custom_maps_all_v2']) {
            try {
                const existingRaw = localStorage.getItem(lsKey);
                const list = existingRaw ? (JSON.parse(existingRaw) || []) : [];
                const filtered = list.filter(item => item && item.map_key !== targetRowKey);
                filtered.unshift(rowPayload);
                localStorage.setItem(lsKey, JSON.stringify(filtered.slice(0, 45)));
            } catch (e) {}
        }

        // 2. Upsert to Supabase `public.company_custom_maps` (SDK + REST fallback)
        await upsertCompanyCustomMapToSupabase(rowPayload);

        await window.loadCustomMapsFromSupabase(u);
        return enrichedSubmission;
    } catch (err) {
        console.warn('[SmartPalm Client Submission Sync] Exception:', err);
        return null;
    }
};

// Live fetch from Supabase when Admin (or User) selects any map on the left panel
window.fetchLatestClientSubmissionForMap = async function (mapKey) {
    if (!mapKey) return null;
    const baseKey = String(mapKey).replace(/^sub_storage_[a-z0-9_]+?_/, '');
    try {
        const rows = await fetchCompanyCustomMapsFromSupabase(true, 'storage_all');
        let bestSub = null;
        let bestTs = 0;
        rows.forEach(r => {
            if (!r || !r.geojson_data) return;
            const gj = r.geojson_data;
            const sub = gj.client_submission;
            if (!sub) return;
            const rowBase = sub.base_map_key || gj.base_map_key || r.map_key;
            if (r.map_key === mapKey || r.map_key === baseKey || rowBase === baseKey || rowBase === mapKey) {
                const ts = new Date(sub.submitted_at || r.created_at || 0).getTime() || 0;
                if (!bestSub || ts >= bestTs) {
                    bestSub = sub;
                    bestTs = ts;
                }
            }
        });
        if (bestSub) {
            window.CLIENT_SUBMISSIONS_BY_MAP_KEY[mapKey] = bestSub;
            window.CLIENT_SUBMISSIONS_BY_MAP_KEY[baseKey] = bestSub;
            return bestSub;
        }
    } catch (e) {}
    return window.CLIENT_SUBMISSIONS_BY_MAP_KEY[mapKey] || window.CLIENT_SUBMISSIONS_BY_MAP_KEY[baseKey] || null;
};

window.loadCustomMapsFromSupabase = async function (userOverride) {
    try {
        const u = userOverride || window.getCurrentPalmnexUser();
        const storageGroup = u
            ? (u.storage_group || resolveUserStorageGroup(u.username || u.email, u.company_code, u.access_tier))
            : window.getCurrentPalmnexStorageGroup();
        const isMasterAdmin = window.isPalmnexMasterAdmin(u);
        const deletedSet = getDeletedMapsSet();

        // 1. Preserve current dropdown selection while rebuilding canonical optgroups
        const prevSelections = {};
        ['map-select-comp', 'map-select-std', 'map-select-kpsm'].forEach(selId => {
            const sel = document.getElementById(selId);
            if (!sel) return;
            prevSelections[selId] = sel.value;
            Array.from(sel.querySelectorAll('option[data-custom-supabase="true"]')).forEach(opt => opt.remove());
            Array.from(sel.querySelectorAll('optgroup[data-custom-optgroup="true"]')).forEach(grp => grp.remove());
            window.restoreCanonicalSelectOptgroups(sel);
        });

        // 2. Load local cache for this storageGroup (or all storage groups if Master Admin)
        let localMaps = [];
        try {
            if (isMasterAdmin) {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('palmnex_custom_maps_')) {
                        const arr = JSON.parse(localStorage.getItem(k) || '[]');
                        if (Array.isArray(arr)) localMaps.push(...arr);
                    }
                }
            } else {
                for (const k of [`palmnex_custom_maps_${storageGroup}`, 'palmnex_custom_maps_all_v2']) {
                    const raw = localStorage.getItem(k);
                    if (raw) {
                        const arr = JSON.parse(raw) || [];
                        if (Array.isArray(arr)) localMaps.push(...arr);
                    }
                }
            }
        } catch (e) {}

        // Also seed window.CLIENT_SUBMISSIONS_BY_MAP_KEY from localStorage index if present
        try {
            const allSubsRaw = localStorage.getItem('palmnex_client_submissions_all');
            if (allSubsRaw) {
                const parsedSubs = JSON.parse(allSubsRaw) || {};
                Object.keys(parsedSubs).forEach(k => {
                    if (deletedSet.has(k)) return;
                    const sub = parsedSubs[k];
                    if (sub && (isMasterAdmin || !sub.storage_group || sub.storage_group === storageGroup)) {
                        window.CLIENT_SUBMISSIONS_BY_MAP_KEY[k] = sub;
                    }
                });
            }
        } catch (e) {}

        // 3. Query Supabase `public.company_custom_maps` (SDK + REST fallback)
        const remoteMaps = await fetchCompanyCustomMapsFromSupabase(isMasterAdmin, storageGroup);

        const mergedByKey = new Map();
        [...remoteMaps, ...localMaps].forEach(row => {
            if (!row || !row.map_key || !row.geojson_data) return;
            if (deletedSet.has(row.map_key)) return;
            const isAdminMap = String(row.company_code || '').toLowerCase() === 'palmnex';
            if (!isMasterAdmin && !isAdminMap && row.storage_group && row.storage_group !== storageGroup) return;
            if (!mergedByKey.has(row.map_key)) {
                mergedByKey.set(row.map_key, row);
            }
        });

        const finalMaps = Array.from(mergedByKey.values());
        window.CUSTOM_SUPABASE_MAPS = finalMaps;

        // 4. Register in REAL_MAPS_DATA, index client submissions by base estate key, and inject custom maps permanently into their Company <optgroup>
        finalMaps.forEach(row => {
            const key = row.map_key;
            const geojson = row.geojson_data;
            const hasFeatures = Boolean(geojson && Array.isArray(geojson.features) && geojson.features.length > 0);
            const isSubOnly = Boolean((geojson && geojson.is_submission_only && !hasFeatures) || String(key).startsWith('sub_'));
            const clientSub = geojson && geojson.client_submission ? geojson.client_submission : null;

            if (clientSub) {
                const prevSub = window.CLIENT_SUBMISSIONS_BY_MAP_KEY[key];
                const newTs = new Date(clientSub.submitted_at || row.created_at || 0).getTime() || 0;
                const oldTs = prevSub ? (new Date(prevSub.submitted_at || 0).getTime() || 0) : -1;
                if (newTs >= oldTs) {
                    window.CLIENT_SUBMISSIONS_BY_MAP_KEY[key] = clientSub;
                }
                const baseKey = clientSub.base_map_key || (geojson && geojson.base_map_key) || '';
                if (baseKey) {
                    const prevBaseSub = window.CLIENT_SUBMISSIONS_BY_MAP_KEY[baseKey];
                    const oldBaseTs = prevBaseSub ? (new Date(prevBaseSub.submitted_at || 0).getTime() || 0) : -1;
                    if (newTs >= oldBaseTs) {
                        window.CLIENT_SUBMISSIONS_BY_MAP_KEY[baseKey] = clientSub;
                    }
                }
            }

            // Submission-only rows for built-in maps attach their data to the built-in estate option
            if (isSubOnly) {
                return;
            }

            const rawComp = String(row.company_code || (geojson && geojson.uploaded_company_code) || '').toLowerCase().trim();
            const rowCompanyCode = (rawComp === 'palmnex' || String(row.storage_group || '') === 'storage_all')
                ? 'palmnex'
                : deriveCompanyCodeFromUsername(rawComp || row.uploaded_by || 'palmnex');
            const rowCompanyName = rowCompanyCode === 'palmnex'
                ? 'Palmnex'
                : formatCompanyNameFromCode(rowCompanyCode);

            const cleanMapName = String(row.map_name || (geojson && geojson.mapName) || key)
                .replace(/^[📌📋]\s*(\[[^\]]+\]\s*)?/, '')
                .replace(/^Custom:\s*/i, '')
                .replace(/\s*\(Client Inputs\)$/i, '')
                .trim();

            geojson.mapName = cleanMapName;

            if (typeof window.REAL_MAPS_DATA === 'object' && window.REAL_MAPS_DATA && hasFeatures) {
                window.REAL_MAPS_DATA[key] = geojson;
            }

            ['map-select-comp', 'map-select-std', 'map-select-kpsm'].forEach(selId => {
                const sel = document.getElementById(selId);
                if (!sel) return;
                let existing = Array.from(sel.options).find(o => o.value === key);
                if (!existing) {
                    existing = document.createElement('option');
                    existing.value = key;
                    existing.setAttribute('data-custom-supabase', 'true');
                    existing.setAttribute('data-storage-group', row.storage_group || storageGroup);
                    existing.setAttribute('data-company-group', rowCompanyCode);
                    if (clientSub) existing.setAttribute('data-has-client-submission', 'true');

                    // Segregate custom uploaded map under its Company <optgroup> ("Palmnex" for Admin uploads)
                    let targetOptgroup = sel.querySelector(`optgroup[data-company-group="${rowCompanyCode}"]`);
                    if (!targetOptgroup) {
                        targetOptgroup = document.createElement('optgroup');
                        targetOptgroup.label = rowCompanyName;
                        targetOptgroup.setAttribute('data-company-group', rowCompanyCode);
                        targetOptgroup.setAttribute('data-custom-optgroup', 'true');
                        sel.appendChild(targetOptgroup);
                    }
                    targetOptgroup.appendChild(existing);
                }
                existing.textContent = cleanMapName;
            });
        });

        window.applyCompanyEstateIsolation(u);

        // Restore active dropdown selection if valid
        ['map-select-comp', 'map-select-std', 'map-select-kpsm'].forEach(selId => {
            const sel = document.getElementById(selId);
            const prev = prevSelections[selId];
            if (sel && prev && Array.from(sel.options).some(o => o.value === prev && !o.disabled)) {
                sel.value = prev;
            }
        });

        if (typeof window.updateSavedMapsDeleteUI === 'function') {
            window.updateSavedMapsDeleteUI();
        }
        if (typeof window.applyClientOrAdminReportRoleUI === 'function') {
            window.applyClientOrAdminReportRoleUI();
        }
        if (typeof window.refreshHomeDashboardForUser === 'function') {
            window.refreshHomeDashboardForUser(u);
        }
        return finalMaps;
    } catch (e) {
        return [];
    }
};

// ============================================================================
// SAVED / UPLOADED MAP DELETE ("✕") UI & "ARE YOU SURE?" CONFIRMATION POPUP
// ============================================================================
function ensureDeleteMapConfirmModal() {
    if (document.getElementById('sp-delete-map-confirm-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'sp-delete-map-confirm-modal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:10000020; background:rgba(0,0,0,0.72); backdrop-filter:blur(6px); align-items:center; justify-content:center;';
    modal.innerHTML = `
        <div style="max-width:380px; width:90%; background:#141922; color:#f8fafc; border:1px solid rgba(255,255,255,0.16); border-radius:16px; padding:24px 22px 20px 22px; box-shadow:0 24px 60px rgba(0,0,0,0.85); font-family:'Inter',-apple-system,sans-serif; text-align:center;">
            <div style="width:44px; height:44px; border-radius:12px; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.38); color:#f87171; display:flex; align-items:center; justify-content:center; margin:0 auto 14px auto; font-size:20px; font-weight:700;">
                ✕
            </div>
            <h3 style="margin:0 0 8px 0; font-size:18px; font-weight:700; color:#ffffff;">Are you sure?</h3>
            <p id="sp-delete-map-confirm-text" style="margin:0 0 20px 0; font-size:13px; color:#94a3b8; line-height:1.5;">
                Are you sure you want to delete this saved map from the list?
            </p>
            <div style="display:flex; align-items:center; gap:10px;">
                <button type="button" onclick="window.closeDeleteMapConfirmModal()" style="flex:1; height:38px; border-radius:9px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.16); color:#e2e8f0; font-size:13px; font-weight:600; cursor:pointer;">
                    Cancel
                </button>
                <button type="button" id="sp-delete-map-confirm-yes-btn" style="flex:1; height:38px; border-radius:9px; background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%); border:1px solid #f87171; color:#ffffff; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 6px 16px rgba(239,68,68,0.35);">
                    Yes, Delete
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.closeDeleteMapConfirmModal = function () {
    const m = document.getElementById('sp-delete-map-confirm-modal');
    if (m) m.style.display = 'none';
};

window.promptDeleteSavedMap = function (targetMapKey, targetMapLabel) {
    const sel = document.getElementById('map-select-comp') || document.getElementById('map-select-std') || document.getElementById('map-select-kpsm');
    const key = targetMapKey || (sel ? sel.value : '');
    if (!key) return;

    let label = targetMapLabel;
    if (!label && sel) {
        const opt = Array.from(sel.options).find(o => o.value === key);
        label = opt ? opt.textContent : key;
    }
    label = String(label || key).trim();

    ensureDeleteMapConfirmModal();
    const modal = document.getElementById('sp-delete-map-confirm-modal');
    const txtEl = document.getElementById('sp-delete-map-confirm-text');
    const yesBtn = document.getElementById('sp-delete-map-confirm-yes-btn');
    if (txtEl) {
        txtEl.innerHTML = `Are you sure you want to delete <b style="color:#ffffff;">"${label}"</b> from the saved map list?`;
    }
    if (yesBtn) {
        yesBtn.onclick = async function () {
            yesBtn.disabled = true;
            yesBtn.textContent = 'Deleting...';
            try {
                await window.executeDeleteSavedMap(key);
            } finally {
                yesBtn.disabled = false;
                yesBtn.textContent = 'Yes, Delete';
                window.closeDeleteMapConfirmModal();
            }
        };
    }
    if (modal) modal.style.display = 'flex';
};

window.deleteCurrentMap = function () {
    window.promptDeleteSavedMap();
};

window.executeDeleteSavedMap = async function (mapKey) {
    if (!mapKey) return;
    const baseKey = String(mapKey).replace(/^sub_storage_[a-z0-9_]+?_/, '');
    markMapDeletedLocally(mapKey, true);

    // 1. Remove from in-memory caches
    if (window.CUSTOM_SUPABASE_MAPS) {
        window.CUSTOM_SUPABASE_MAPS = window.CUSTOM_SUPABASE_MAPS.filter(r => r && r.map_key !== mapKey && r.map_key !== `sub_${window.getCurrentPalmnexStorageGroup()}_${baseKey}`);
    }
    if (window.CLIENT_SUBMISSIONS_BY_MAP_KEY) {
        delete window.CLIENT_SUBMISSIONS_BY_MAP_KEY[mapKey];
        delete window.CLIENT_SUBMISSIONS_BY_MAP_KEY[baseKey];
    }
    if (String(mapKey).startsWith('custom_') && window.REAL_MAPS_DATA) {
        delete window.REAL_MAPS_DATA[mapKey];
    }

    // 2. Remove from all localStorage caches
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('palmnex_custom_maps_')) {
                const arr = JSON.parse(localStorage.getItem(k) || '[]');
                if (Array.isArray(arr)) {
                    const filtered = arr.filter(r => r && r.map_key !== mapKey && !(r.geojson_data && r.geojson_data.base_map_key === mapKey));
                    localStorage.setItem(k, JSON.stringify(filtered));
                }
            }
        }
        const allSubsRaw = localStorage.getItem('palmnex_client_submissions_all');
        if (allSubsRaw) {
            const allSubs = JSON.parse(allSubsRaw) || {};
            delete allSubs[mapKey];
            delete allSubs[baseKey];
            localStorage.setItem('palmnex_client_submissions_all', JSON.stringify(allSubs));
        }
    } catch (e) {}

    // 3. Delete from Supabase `public.company_custom_maps`
    const subKey = `sub_${window.getCurrentPalmnexStorageGroup() || 'storage_all'}_${baseKey}`;
    await deleteCompanyCustomMapFromSupabase(mapKey, subKey);

    // 4. Remove option from dropdowns (including canonical built-in cache) & reset selection if currently active
    let wasActive = false;
    ['map-select-comp', 'map-select-std', 'map-select-kpsm'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        if (sel.value === mapKey) wasActive = true;
        if (Array.isArray(sel._canonicalBuiltInOptgroups)) {
            sel._canonicalBuiltInOptgroups.forEach(grp => {
                Array.from(grp.querySelectorAll('option')).forEach(o => {
                    if (o.value === mapKey) o.remove();
                });
            });
        }
        Array.from(sel.options).forEach(opt => {
            if (opt.value === mapKey) {
                const parentGrp = opt.parentElement;
                opt.remove();
                if (parentGrp && parentGrp.tagName === 'OPTGROUP' && parentGrp.children.length === 0) {
                    parentGrp.remove();
                }
            }
        });
    });

    if (wasActive && typeof onMapSelectChanged === 'function') {
        onMapSelectChanged('');
    }
    window.updateSavedMapsDeleteUI();
};

window.updateSavedMapsDeleteUI = function () {
    // Hide old external delete button & old quicklist if present
    const delBtn = document.getElementById('delete-map-btn-comp');
    if (delBtn) delBtn.style.display = 'none';
    const oldQuick = document.getElementById('sp-saved-maps-quicklist');
    if (oldQuick) oldQuick.style.display = 'none';

    if (!document.getElementById('sp-custom-map-dd-styles')) {
        const st = document.createElement('style');
        st.id = 'sp-custom-map-dd-styles';
        st.textContent = `
            .sp-map-dd-wrapper {
                position: relative;
                flex: 1;
                min-width: 0;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            }
            .sp-map-dd-trigger {
                width: 100%;
                height: 32px;
                padding: 0 26px 0 10px;
                border-radius: 7px;
                background: #14171f;
                border: 1px solid rgba(255, 255, 255, 0.16);
                color: #f8fafc;
                font-size: 12px;
                font-weight: 500;
                text-align: left;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                position: relative;
                box-sizing: border-box;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                transition: border-color 0.15s ease;
            }
            .sp-map-dd-trigger:hover {
                border-color: rgba(255, 255, 255, 0.32);
            }
            .sp-map-dd-trigger-text {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                flex: 1;
            }
            .sp-map-dd-trigger-caret {
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 10px;
                color: #94a3b8;
                pointer-events: none;
            }
            .sp-map-dd-menu {
                display: none;
                position: fixed;
                min-width: 245px;
                max-width: 310px;
                max-height: 480px;
                overflow-y: auto;
                background: rgba(24, 28, 36, 0.98);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 10px;
                padding: 5px;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85);
                z-index: 10000015;
                user-select: none;
            }
            .sp-map-dd-menu.open {
                display: block;
            }
            .sp-map-dd-group-hdr {
                padding: 7px 10px 3px 10px;
                font-size: 11px;
                font-weight: 700;
                color: #64748b;
                letter-spacing: 0.1px;
            }
            .sp-map-dd-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
                padding: 5px 8px 5px 10px;
                border-radius: 6px;
                font-size: 12.5px;
                color: #f1f5f9;
                cursor: pointer;
                transition: background 0.1s ease;
            }
            .sp-map-dd-item:hover:not(.disabled) {
                background: #2563eb;
                color: #ffffff;
            }
            .sp-map-dd-item.active:not(:hover) {
                background: rgba(37, 99, 235, 0.25);
                color: #ffffff;
                font-weight: 600;
            }
            .sp-map-dd-item.disabled {
                opacity: 0.38;
                cursor: not-allowed;
            }
            .sp-map-dd-item-label {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .sp-map-dd-item-del {
                width: 18px;
                height: 18px;
                border-radius: 4px;
                background: transparent;
                border: none;
                color: rgba(248, 250, 252, 0.55);
                font-size: 11px;
                font-weight: 700;
                line-height: 1;
                padding: 0;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: all 0.12s ease;
            }
            .sp-map-dd-item:hover .sp-map-dd-item-del {
                color: #ffffff;
            }
            .sp-map-dd-item-del:hover {
                background: rgba(239, 68, 68, 0.85) !important;
                color: #ffffff !important;
            }
        `;
        document.head.appendChild(st);
    }

    ['map-select-comp', 'map-select-std', 'map-select-kpsm'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;

        let wrap = sel.parentElement && sel.parentElement.classList.contains('sp-map-dd-wrapper')
            ? sel.parentElement
            : null;
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'sp-map-dd-wrapper';
            sel.parentNode.insertBefore(wrap, sel);
            wrap.appendChild(sel);
            sel.style.display = 'none';

            const trig = document.createElement('button');
            trig.type = 'button';
            trig.className = 'sp-map-dd-trigger';
            trig.innerHTML = `<span class="sp-map-dd-trigger-text">-- Select Map Boundary --</span><span class="sp-map-dd-trigger-caret">⌄</span>`;
            wrap.appendChild(trig);

            const menu = document.createElement('div');
            menu.className = 'sp-map-dd-menu';
            document.body.appendChild(menu);
            wrap._ddTrigger = trig;
            wrap._ddMenu = menu;

            trig.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const isOpen = menu.classList.contains('open');
                document.querySelectorAll('.sp-map-dd-menu.open').forEach(m => m.classList.remove('open'));
                if (!isOpen) {
                    window.renderCustomSelectMapMenu(sel, trig, menu);
                    const rect = trig.getBoundingClientRect();
                    menu.style.left = `${Math.max(8, rect.left)}px`;
                    menu.style.top = `${Math.max(8, Math.min(window.innerHeight - 490, rect.top - 6))}px`;
                    menu.style.width = `${Math.max(245, rect.width + 45)}px`;
                    menu.classList.add('open');
                }
            });

            if (!window._spMapDdOutsideBound) {
                window._spMapDdOutsideBound = true;
                document.addEventListener('click', (ev) => {
                    document.querySelectorAll('.sp-map-dd-menu.open').forEach(m => {
                        if (!m.contains(ev.target)) m.classList.remove('open');
                    });
                });
            }
        }

        window.renderCustomSelectMapMenu(sel, wrap._ddTrigger, wrap._ddMenu);
    });
};

window.renderCustomSelectMapMenu = function (sel, trig, menu) {
    if (!sel || !trig || !menu) return;
    const curVal = sel.value || '';
    const curOpt = Array.from(sel.options).find(o => o.value === curVal);
    const txtSpan = trig.querySelector('.sp-map-dd-trigger-text');
    if (txtSpan) {
        txtSpan.textContent = (curOpt && curOpt.textContent) ? curOpt.textContent : '-- Select Map Boundary --';
    }

    let html = `
        <div class="sp-map-dd-item ${curVal === '' ? 'active' : ''}" data-map-val="">
            <span class="sp-map-dd-item-label">${curVal === '' ? '✓ ' : ''}-- Select Map Boundary --</span>
        </div>
    `;

    Array.from(sel.children).forEach(child => {
        if (child.tagName === 'OPTGROUP') {
            const opts = Array.from(child.querySelectorAll('option')).filter(o => o.value !== '');
            if (opts.length === 0) return;
            const grpLabel = (child.label || '').replace(/</g, '&lt;');
            html += `<div class="sp-map-dd-group-hdr">${grpLabel}</div>`;
            opts.forEach(opt => {
                const val = opt.value;
                const name = (opt.textContent || val).replace(/</g, '&lt;');
                const isAct = (curVal === val);
                const isDis = Boolean(opt.disabled);
                const safeVal = val.replace(/"/g, '&quot;');
                const safeName = name.replace(/"/g, '&quot;');
                html += `
                    <div class="sp-map-dd-item ${isAct ? 'active' : ''} ${isDis ? 'disabled' : ''}" data-map-val="${safeVal}" data-disabled="${isDis ? '1' : '0'}">
                        <span class="sp-map-dd-item-label" title="${safeName}">${isAct ? '✓ ' : ''}${name}</span>
                        ${!isDis ? `<button type="button" class="sp-map-dd-item-del" data-del-val="${safeVal}" data-del-name="${safeName}" title="Delete ${safeName}">✕</button>` : ''}
                    </div>
                `;
            });
        } else if (child.tagName === 'OPTION' && child.value !== '') {
            const val = child.value;
            const name = (child.textContent || val).replace(/</g, '&lt;');
            const isAct = (curVal === val);
            const isDis = Boolean(child.disabled);
            const safeVal = val.replace(/"/g, '&quot;');
            const safeName = name.replace(/"/g, '&quot;');
            html += `
                <div class="sp-map-dd-item ${isAct ? 'active' : ''} ${isDis ? 'disabled' : ''}" data-map-val="${safeVal}" data-disabled="${isDis ? '1' : '0'}">
                    <span class="sp-map-dd-item-label" title="${safeName}">${isAct ? '✓ ' : ''}${name}</span>
                    ${!isDis ? `<button type="button" class="sp-map-dd-item-del" data-del-val="${safeVal}" data-del-name="${safeName}" title="Delete ${safeName}">✕</button>` : ''}
                </div>
            `;
        }
    });

    menu.innerHTML = html;

    // Bind row selection and "✕" delete button clicks
    menu.querySelectorAll('.sp-map-dd-item-del').forEach(delBtn => {
        delBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            const dVal = delBtn.getAttribute('data-del-val');
            const dName = delBtn.getAttribute('data-del-name');
            menu.classList.remove('open');
            window.promptDeleteSavedMap(dVal, dName);
        });
    });

    menu.querySelectorAll('.sp-map-dd-item').forEach(item => {
        item.addEventListener('click', (ev) => {
            if (ev.target.closest('.sp-map-dd-item-del')) return;
            if (item.getAttribute('data-disabled') === '1') return;
            const chosenVal = item.getAttribute('data-map-val') || '';
            menu.classList.remove('open');
            sel.value = chosenVal;
            window.renderCustomSelectMapMenu(sel, trig, menu);
            if (typeof onMapSelectChanged === 'function') {
                onMapSelectChanged(chosenVal);
            } else {
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });
};

// Open Auth Modal Dialog
function openAuthModal(defaultTab = 'signin') {
    ensureAuthModalEnhancements();
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'flex';
        const closeBtn = modal.querySelector('#auth-modal-close-btn, .auth-modal-close');
        if (closeBtn) {
            closeBtn.style.display = (window.PALMNEX_REQUIRE_LOGIN && !isUserAuthenticated()) ? 'none' : '';
        }
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
        banner.style.cssText = 'display:none; align-items:center; justify-content:space-between; gap:14px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); padding:13px 16px; border-radius:10px; margin-bottom:20px; font-size:13.5px; color:#d1fae5;';
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
                    <div style="font-weight:700; font-size:14px; color:#34d399; margin-bottom:2px;">Signed in as ${name}</div>
                    <div style="font-size:12.5px; color:#94a3b8;">${comp}</div>
                </div>
                <button type="button" onclick="handleSignOut()" style="background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.45); border-radius:8px; padding:7px 14px; font-size:12.5px; font-weight:600; cursor:pointer; white-space:nowrap;">Sign Out</button>
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

function formatCompanyNameFromCode(companyCode) {
    const code = String(companyCode || '').toLowerCase().trim();
    const map = {
        palmnex: 'Palmnex Sdn Bhd',
        benta: 'Benta Wawasan Sdn Bhd',
        benta_wawasan: 'Benta Wawasan Sdn Bhd',
        fgv: 'FGV Holdings Berhad',
        mpob: 'MPOB Research & SPOC',
        sdguthrie: 'SD Guthrie Berhad',
        klk: 'Kuala Lumpur Kepong Berhad',
        ioi: 'IOI Corporation Berhad',
        achijaya: 'Achi Jaya Plantations Sdn Bhd'
    };
    if (map[code]) return map[code];
    if (!code) return 'Palmnex Sdn Bhd';
    return `${code.charAt(0).toUpperCase() + code.slice(1)} Plantations`;
}

// Resolve user profile (username, company_code, company_name, access_tier, allowed_modules, storage_group) from Supabase `profiles` table
async function enrichSupabaseUserProfile(user, fallbackCompany, rawUsernameFallback) {
    if (!user) return null;
    const meta = user.user_metadata || {};
    let rawUsername = user.username || meta.username || rawUsernameFallback || (user.email ? user.email.split('@')[0] : 'Admin');
    let displayUsername = (rawUsername.toLowerCase() === 'admin1' || rawUsername === 'Lead Agronomist (Admin)') ? 'Admin' : rawUsername;

    let companyCode = deriveCompanyCodeFromUsername(user.company_code || meta.company_code || rawUsername);
    const isPalmnexMaster = (companyCode === 'palmnex' || rawUsername.toLowerCase() === 'admin1' || rawUsername.toLowerCase().startsWith('adminpalmnex') || rawUsername.toLowerCase().startsWith('palmnex'));
    let accessTier = String(user.access_tier || meta.access_tier || (isPalmnexMaster ? 'C' : 'A')).toUpperCase();
    let allowedModules = Array.isArray(user.allowed_modules) ? user.allowed_modules : getAllowedModulesForTier(accessTier);
    let storageGroup = resolveUserStorageGroup(rawUsername, companyCode, accessTier, user.storage_group || meta.storage_group);
    let company = user.company || user.estate_company || meta.estate_company || meta.company_name || formatCompanyNameFromCode(companyCode);

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
                companyCode = deriveCompanyCodeFromUsername(prof.company_code || companyCode || rawUsername);
                accessTier = String(prof.access_tier || accessTier).toUpperCase();
                allowedModules = Array.isArray(prof.allowed_modules) && prof.allowed_modules.length
                    ? prof.allowed_modules
                    : getAllowedModulesForTier(accessTier);
                storageGroup = resolveUserStorageGroup(rawUsername, companyCode, accessTier, prof.storage_group);
                const rawProfComp = prof.estate_company || prof.company_name || '';
                company = (rawProfComp && rawProfComp.toLowerCase() !== rawUsername.toLowerCase() && rawProfComp.toLowerCase() !== (prof.company_code || '').toLowerCase())
                    ? rawProfComp
                    : formatCompanyNameFromCode(companyCode);
            }
        } catch (e) {
            // profiles table fallback
        }
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

// Cancel all current in-memory UI progress (running predictions, selected maps/blocks, modals, sessionStorage)
// while preserving all database-saved records in Supabase and localStorage caches.
window.cancelAllInMemoryProgress = function () {
    try {
        if (typeof window.cancelPredictionRunAndClose === 'function') {
            window.cancelPredictionRunAndClose();
        }
    } catch (e) {}
    try {
        window._UPLOADED_SHP_BUFFER = null;
        window._UPLOADED_DBF_BUFFER = null;
        window._UPLOADED_SHP_NAME = '';
    } catch (e) {}
    try {
        if (typeof window.closeEdsDialogs === 'function') {
            window.closeEdsDialogs();
        }
    } catch (e) {}
    try {
        if (typeof onMapSelectChanged === 'function') {
            onMapSelectChanged('');
        }
    } catch (e) {}
    try {
        sessionStorage.clear();
    } catch (e) {}
};

// Redirect to Home page (index.html) after every new login so all previous page progress is cancelled
function redirectToHomeAfterLogin() {
    window.cancelAllInMemoryProgress();
    window.location.replace('index.html');
}

// Sign In with PalmnexReaDS Username or Email & Password (connected to https://dkafzakyeuehvpkkhdsa.supabase.co)
async function handleEmailSignIn(event) {
    if (event) event.preventDefault();
    const rawInput = document.getElementById('signin-email')?.value?.trim();
    const password = document.getElementById('signin-password')?.value;

    if (!rawInput || !password) {
        showAuthError("Please enter your PalmnexReaDS username/email and password.");
        return;
    }

    const cleanInput = rawInput.toLowerCase();

    // 1. Instant check for standard PalmnexReaDS / SmartPalm Master Admin demo credentials (admin1, mpob1998, porim1998)
    const isDemoAdminPass = (password === 'admin1' || password === 'mpob1998' || password === 'porim1998');
    const isPalmnexAdminUser = (cleanInput === 'admin1' || cleanInput === 'admin' || cleanInput === 'admin1@palmnex.com.my' || cleanInput === 'admin1@palmnex.mpob.gov.my' || cleanInput.startsWith('adminpalmnex') || cleanInput.startsWith('palmnex'));
    if (isDemoAdminPass && isPalmnexAdminUser) {
        const displayUser = (cleanInput === 'admin1' || cleanInput === 'admin' || cleanInput.startsWith('admin1@'))
            ? 'Admin'
            : rawInput.split('@')[0];
        const adminUser = {
            email: rawInput.includes('@') ? rawInput : `${cleanInput}@palmnex.com.my`,
            username: displayUser,
            company: 'Palmnex Sdn Bhd',
            estate_company: 'Palmnex Sdn Bhd',
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
        closeAuthModal();
        try { syncPalmnexSsoState(adminUser); } catch (e) {}
        try { updateTopNavUser(adminUser); } catch (e) {}
        try { applyModuleAccessControl(adminUser); } catch (e) { console.warn(e); }
        try { renderAuthModalSessionBanner(); } catch (e) {}
        redirectToHomeAfterLogin();
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
        const enrichedUser = await enrichSupabaseUserProfile(data.user, '', plainUsername);
        localStorage.setItem('palmnex_user_session', JSON.stringify(enrichedUser));
        currentUser = enrichedUser;
        closeAuthModal();
        try { syncPalmnexSsoState(enrichedUser); } catch (e) {}
        try { updateTopNavUser(enrichedUser); } catch (e) {}
        try { applyModuleAccessControl(enrichedUser); } catch (e) { console.warn(e); }
        try { renderAuthModalSessionBanner(); } catch (e) {}
        redirectToHomeAfterLogin();
    } catch (err) {
        showAuthError(err.message || "Invalid PalmnexReaDS username or password.");
    } finally {
        setAuthLoading(false);
    }
}
window.handleEmailSignIn = handleEmailSignIn;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;

// Sign Out User
async function handleSignOut() {
    window.cancelAllInMemoryProgress();
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
        btnSignin.innerHTML = loading
            ? `<span>Verifying...</span>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg><span>Sign In</span>`;
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
    if (typeof window.refreshAccountDropdownUI === 'function') {
        window.refreshAccountDropdownUI(user);
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

    // 0. Check SSO query params or shared .palmnex.com.my SSO cookie if localStorage session is absent
    let savedLocalSession = localStorage.getItem('palmnex_user_session');
    if (!savedLocalSession) {
        try {
            const cookieMatch = document.cookie.match(/(?:^|;\s*)palmnex_sso_user=([^;]*)/);
            if (cookieMatch && cookieMatch[1]) {
                const decodedSso = JSON.parse(decodeURIComponent(cookieMatch[1]));
                if (decodedSso && (decodedSso.username || decodedSso.email)) {
                    savedLocalSession = JSON.stringify(decodedSso);
                    localStorage.setItem('palmnex_user_session', savedLocalSession);
                }
            } else {
                const sp = new URLSearchParams(window.location.search);
                if (sp.get('sso') === '1' && sp.get('user')) {
                    const ssoUserFromUrl = {
                        id: 'usr_sso_' + sp.get('user').toLowerCase(),
                        username: sp.get('user'),
                        company: sp.get('company') || 'Palmnex Sdn Bhd',
                        email: `${sp.get('user').toLowerCase()}@palmnex.com.my`,
                        access_tier: 'C',
                        storage_group: 'storage_all'
                    };
                    savedLocalSession = JSON.stringify(ssoUserFromUrl);
                    localStorage.setItem('palmnex_user_session', savedLocalSession);
                }
            }
        } catch (e) {}
    }

    // 1. Check local session first
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
