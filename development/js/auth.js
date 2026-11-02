// Card Click Handler: Direct navigation without requiring sign in
function handleProtectedCardClick(targetUrl) {
    if (targetUrl) {
        window.location.href = targetUrl;
    }
}

// Global User State
let currentUser = null;

// Open Auth Modal Dialog
function openAuthModal(defaultTab = 'signin') {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'flex';
        switchAuthTab('signin');
    }
}

// Close Auth Modal Dialog
function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Switch between Sign In and Sign Up Tabs (Sign Up disabled)
function switchAuthTab(tabName) {
    if (tabName === 'signup') {
        showAuthError("Registration is currently disabled by administrator.");
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
async function enrichSupabaseUserProfile(user, fallbackCompany) {
    if (!user) return null;
    const meta = user.user_metadata || {};
    let username = user.username || meta.username || meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Admin');
    if (username.toLowerCase() === 'admin1') username = 'Admin';
    let company = user.company || user.estate_company || meta.estate_company || meta.company_name || meta.company || fallbackCompany || 'Palmnex Sdn Bhd';

    // Query Supabase `profiles` table if available (ready for upcoming Supabase setup)
    const client = typeof getSupabase === 'function' ? getSupabase() : (typeof supabase !== 'undefined' ? supabase : null);
    if (client && user.id && user.id !== 'admin1-id') {
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

// Sign In with Email / Username & Password (supporting Admin / admin1 + Supabase Auth)
async function handleEmailSignIn(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('signin-email')?.value?.trim();
    const companyInput = document.getElementById('signin-company')?.value?.trim() || 'Palmnex Sdn Bhd';
    const password = document.getElementById('signin-password')?.value;

    if (!email || !password) {
        showAuthError("Please enter your username/email and password.");
        return;
    }

    // 1. Instant check for Admin / admin1 credentials (or custom username with admin1 password)
    const cleanInput = email.toLowerCase();
    if (password === 'admin1') {
        const displayUser = (cleanInput === 'admin1' || cleanInput === 'admin' || cleanInput === 'admin1@palmnex.com.my')
            ? 'Admin'
            : email.split('@')[0];
        const adminUser = {
            email: email.includes('@') ? email : 'admin1@palmnex.com.my',
            username: displayUser,
            company: companyInput || 'Palmnex Sdn Bhd',
            id: 'admin1-id',
            role: 'admin'
        };
        localStorage.setItem('palmnex_user_session', JSON.stringify(adminUser));
        currentUser = adminUser;
        closeAuthModal();
        updateTopNavUser(adminUser);
        return;
    }

    // 2. Supabase Auth check for cloud users
    const client = typeof getSupabase === 'function' ? getSupabase() : supabase;
    if (!client || !client.auth) {
        showAuthError("Invalid username or password.");
        return;
    }

    try {
        setAuthLoading(true);
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        const enrichedUser = await enrichSupabaseUserProfile(data.user, companyInput);
        localStorage.setItem('palmnex_user_session', JSON.stringify(enrichedUser));
        closeAuthModal();
        updateTopNavUser(enrichedUser);
    } catch (err) {
        showAuthError(err.message || "Invalid username or password.");
    } finally {
        setAuthLoading(false);
    }
}

// Sign Out User
async function handleSignOut() {
    const client = typeof getSupabase === 'function' ? getSupabase() : supabase;
    if (client && client.auth) {
        try {
            await client.auth.signOut();
        } catch(e) {}
    }
    localStorage.removeItem('palmnex_user_session');
    currentUser = null;
    updateTopNavUser(null);
}

// Helper: Show Error Message
function showAuthError(msg) {
    const errorEl = document.getElementById('auth-error-msg');
    const successEl = document.getElementById('auth-success-msg');
    if (successEl) successEl.style.display = 'none';
    if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    }
}

// Helper: Show Success Message
function showAuthSuccess(msg) {
    const errorEl = document.getElementById('auth-error-msg');
    const successEl = document.getElementById('auth-success-msg');
    if (errorEl) errorEl.style.display = 'none';
    if (successEl) {
        successEl.textContent = msg;
        successEl.style.display = 'block';
    }
}

// Helper: Loading Indicator Toggle
function setAuthLoading(loading) {
    const btnSignin = document.getElementById('btn-auth-signin');
    if (btnSignin) btnSignin.disabled = loading;
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
    const displayName = rawUsername.toLowerCase() === 'admin1' ? 'Admin' : rawUsername;
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
        if (userEmailSpan) userEmailSpan.textContent = `Admin • Palmnex Sdn Bhd`;
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
            updateTopNavUser(userObj);
            return;
        } catch(e) {}
    }

    // Default display before Supabase resolves
    updateTopNavUser({ username: 'Admin', company: 'Palmnex Sdn Bhd' });

    // 2. Check Supabase session
    const client = typeof getSupabase === 'function' ? getSupabase() : (typeof supabase !== 'undefined' ? supabase : null);
    if (client && client.auth) {
        try {
            const { data } = await client.auth.getSession();
            if (data && data.session && data.session.user) {
                const enriched = await enrichSupabaseUserProfile(data.session.user);
                updateTopNavUser(enriched);
            }

            client.auth.onAuthStateChange(async (event, session) => {
                if (session && session.user) {
                    const enriched = await enrichSupabaseUserProfile(session.user);
                    updateTopNavUser(enriched);
                } else if (!localStorage.getItem('palmnex_user_session')) {
                    updateTopNavUser({ username: 'Admin', company: 'Palmnex Sdn Bhd' });
                }
            });
        } catch(e) {}
    }
});
