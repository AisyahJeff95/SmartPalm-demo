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

// Write shared cross-subdomain SSO cookie on .palmnex.com.my and decorate PalmNexReaDS links (Option B)
function syncPalmnexSsoState(user) {
    const activeUser = user || {
        id: 'usr_demo_admin1',
        email: 'admin1@palmnex.com.my',
        username: 'Admin',
        company: 'Palmnex Sdn Bhd',
        user_metadata: { full_name: 'Admin' }
    };
    const rawName = activeUser.username || activeUser.user_metadata?.username || activeUser.user_metadata?.full_name || (activeUser.email ? activeUser.email.split('@')[0] : 'Admin');
    const displayName = rawName.toLowerCase() === 'admin1' ? 'Admin' : rawName;
    const companyName = activeUser.company || activeUser.estate_company || activeUser.user_metadata?.estate_company || activeUser.user_metadata?.company_name || 'Palmnex Sdn Bhd';

    const ssoPayload = {
        id: activeUser.id || 'usr_demo_admin1',
        email: activeUser.email || `${rawName.toLowerCase()}@palmnex.com.my`,
        username: displayName,
        company: companyName,
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

// Open Auth Modal Dialog
function openAuthModal(defaultTab = 'signin') {
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
            const comp = u.company || 'Palmnex Sdn Bhd';
            banner.innerHTML = `
                <div>
                    <div style="font-weight:700; color:#34d399;">Signed in as ${name}</div>
                    <div style="font-size:11px; color:#94a3b8;">${comp} • SSO active for PalmNexReaDS</div>
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

// Resolve user profile (username + estate company name) from Supabase user_metadata or profiles table
async function enrichSupabaseUserProfile(user, fallbackCompany, rawUsernameFallback) {
    if (!user) return null;
    const meta = user.user_metadata || {};
    let username = user.username || meta.username || meta.full_name || meta.name || rawUsernameFallback || (user.email ? user.email.split('@')[0] : 'Admin');
    if (username.toLowerCase() === 'admin1' || username === 'Lead Agronomist (Admin)') username = 'Admin';
    let company = user.company || user.estate_company || meta.estate_company || meta.company_name || meta.company || fallbackCompany || 'Palmnex Sdn Bhd';

    // Query Supabase `profiles` table if available
    const client = typeof getSupabase === 'function' ? getSupabase() : (typeof supabase !== 'undefined' ? supabase : null);
    if (client && user.id && user.id !== 'admin1-id' && user.id !== 'usr_demo_admin1') {
        try {
            const { data: prof } = await client
                .from('profiles')
                .select('username, full_name, company_name, estate_company')
                .eq('id', user.id)
                .maybeSingle();
            if (prof) {
                username = prof.username || prof.full_name || username;
                company = prof.estate_company || prof.company_name || company;
            }
        } catch (e) {
            // profiles table not created yet or RLS restricted; fallback to metadata
        }
    }

    return Object.assign({}, user, { username, company });
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

    // 1. Instant check for standard PalmnexReaDS / SmartPalm demo credentials (admin1, mpob1998, porim1998)
    const isDemoAdminPass = (password === 'admin1' || password === 'mpob1998' || password === 'porim1998');
    if (isDemoAdminPass && (cleanInput === 'admin1' || cleanInput === 'admin' || cleanInput === 'admin1@palmnex.com.my' || cleanInput === 'admin1@palmnex.mpob.gov.my' || password === 'admin1')) {
        const displayUser = (cleanInput === 'admin1' || cleanInput === 'admin' || cleanInput.startsWith('admin1@'))
            ? 'Admin'
            : rawInput.split('@')[0];
        const adminUser = {
            email: rawInput.includes('@') ? rawInput : `${cleanInput}@palmnex.com.my`,
            username: displayUser,
            company: companyInput || 'Palmnex Sdn Bhd',
            id: 'usr_demo_admin1',
            role: 'admin',
            user_metadata: { full_name: displayUser }
        };
        localStorage.setItem('palmnex_user_session', JSON.stringify(adminUser));
        currentUser = adminUser;
        syncPalmnexSsoState(adminUser);
        updateTopNavUser(adminUser);
        renderAuthModalSessionBanner();
        showAuthSuccess(`Welcome ${displayUser}! PalmnexReaDS SSO is active.`);
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
        renderAuthModalSessionBanner();
        showAuthSuccess(`Verified via Supabase! Signed in as ${enrichedUser.username}.`);
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
        // In optional demo mode, keep default Admin display and SSO active for seamless demo presentation
        const defaultDemoUser = { username: 'Admin', company: 'Palmnex Sdn Bhd', email: 'admin1@palmnex.com.my', id: 'usr_demo_admin1' };
        syncPalmnexSsoState(defaultDemoUser);
        updateTopNavUser(defaultDemoUser);
        showAuthSuccess("Signed out. Reverted to default Demo Admin view.");
    }
}

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
    // 1. Check local session first
    const savedLocalSession = localStorage.getItem('palmnex_user_session');
    if (savedLocalSession) {
        try {
            const userObj = JSON.parse(savedLocalSession);
            currentUser = userObj;
            syncPalmnexSsoState(userObj);
            updateTopNavUser(userObj);
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
                return;
            }

            client.auth.onAuthStateChange(async (event, session) => {
                if (session && session.user) {
                    const enriched = await enrichSupabaseUserProfile(session.user);
                    localStorage.setItem('palmnex_user_session', JSON.stringify(enriched));
                    currentUser = enriched;
                    syncPalmnexSsoState(enriched);
                    updateTopNavUser(enriched);
                } else if (!localStorage.getItem('palmnex_user_session')) {
                    if (window.PALMNEX_REQUIRE_LOGIN) {
                        updateTopNavUser(null);
                        openAuthModal('signin');
                    } else {
                        const defaultUser = { username: 'Admin', company: 'Palmnex Sdn Bhd', email: 'admin1@palmnex.com.my' };
                        syncPalmnexSsoState(defaultUser);
                        updateTopNavUser(defaultUser);
                    }
                }
            });
        } catch(e) {}
    }

    // 3. Fallback when not logged in:
    // If PALMNEX_REQUIRE_LOGIN is true, prompt for login; otherwise default to Admin & set SSO for demo presentation
    if (window.PALMNEX_REQUIRE_LOGIN) {
        updateTopNavUser(null);
        enforceSystemLoginGateIfEnabled();
    } else {
        const defaultUser = { username: 'Admin', company: 'Palmnex Sdn Bhd', email: 'admin1@palmnex.com.my' };
        syncPalmnexSsoState(defaultUser);
        updateTopNavUser(defaultUser);
    }
});
