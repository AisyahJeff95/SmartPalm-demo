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

// Sign In with Email / Username & Password (supporting admin1 / admin1)
async function handleEmailSignIn(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('signin-email')?.value?.trim();
    const password = document.getElementById('signin-password')?.value;

    if (!email || !password) {
        showAuthError("Please enter your username/email and password.");
        return;
    }

    // 1. Instant check for admin1 / admin1 credentials
    const cleanInput = email.toLowerCase();
    if ((cleanInput === 'admin1' || cleanInput === 'admin1@palmnex.com.my') && password === 'admin1') {
        const adminUser = { email: 'admin1@palmnex.com.my', username: 'admin1', id: 'admin1-id', role: 'admin' };
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

        closeAuthModal();
        updateTopNavUser(data.user);
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

// Update Top Navigation Bar UI according to user session state
function updateTopNavUser(user) {
    currentUser = user;
    const authBtnContainer = document.getElementById('top-nav-auth-container');
    const profileDropdown = document.querySelector('.profile-dropdown-container');
    const userEmailSpan = document.getElementById('nav-user-email');

    if (user) {
        if (authBtnContainer) authBtnContainer.style.display = 'none';
        if (profileDropdown) profileDropdown.style.display = 'inline-block';
        if (userEmailSpan) userEmailSpan.textContent = user.username || user.email;
    } else {
        if (authBtnContainer) authBtnContainer.style.display = 'inline-block';
        if (profileDropdown) profileDropdown.style.display = 'none';
    }
}

// Listen to Auth Events on Load
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check local admin session first
    const savedLocalSession = localStorage.getItem('palmnex_user_session');
    if (savedLocalSession) {
        try {
            const userObj = JSON.parse(savedLocalSession);
            currentUser = userObj;
            updateTopNavUser(userObj);
            return;
        } catch(e) {}
    }

    // 2. Check Supabase session
    const client = typeof getSupabase === 'function' ? getSupabase() : supabase;
    if (client && client.auth) {
        try {
            const { data } = await client.auth.getSession();
            if (data && data.session) {
                updateTopNavUser(data.session.user);
            } else {
                updateTopNavUser(null);
            }

            client.auth.onAuthStateChange((event, session) => {
                if (session && session.user) {
                    updateTopNavUser(session.user);
                } else if (!localStorage.getItem('palmnex_user_session')) {
                    updateTopNavUser(null);
                }
            });
        } catch(e) {}
    }
});
