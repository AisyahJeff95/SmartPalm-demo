
// Protected Card Click Handler: Check if user is signed in before navigating
function handleProtectedCardClick(targetUrl) {
    if (currentUser) {
        window.location.href = targetUrl;
    } else {
        openAuthModal('signin');
    }
}
// Supabase Authentication & User Session Management

// Global User State
let currentUser = null;

// Open Auth Modal Dialog
function openAuthModal(defaultTab = 'signin') {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'flex';
        switchAuthTab(defaultTab);
    }
}

// Close Auth Modal Dialog
function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Switch between Sign In and Sign Up Tabs
function switchAuthTab(tabName) {
    const tabSignin = document.getElementById('auth-tab-signin');
    const tabSignup = document.getElementById('auth-tab-signup');
    const formSignin = document.getElementById('auth-form-signin');
    const formSignup = document.getElementById('auth-form-signup');
    const authError = document.getElementById('auth-error-msg');

    if (authError) authError.style.display = 'none';

    if (tabName === 'signin') {
        if (tabSignin) tabSignin.classList.add('active');
        if (tabSignup) tabSignup.classList.remove('active');
        if (formSignin) formSignin.style.display = 'block';
        if (formSignup) formSignup.style.display = 'none';
    } else {
        if (tabSignup) tabSignup.classList.add('active');
        if (tabSignin) tabSignin.classList.remove('active');
        if (formSignup) formSignup.style.display = 'block';
        if (formSignin) formSignin.style.display = 'none';
    }
}

// 1. Sign In with GitHub OAuth
async function signInWithGitHub() {
    if (!supabase) {
        showAuthError("Supabase not initialized.");
        return;
    }
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) throw error;
    } catch (err) {
        showAuthError(err.message || "Failed to sign in with GitHub.");
    }
}

// 2. Sign In with Email & Password
async function handleEmailSignIn(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('signin-email')?.value?.trim();
    const password = document.getElementById('signin-password')?.value;

    if (!email || !password) {
        showAuthError("Please enter your email and password.");
        return;
    }

    if (!supabase) {
        showAuthError("Supabase not initialized.");
        return;
    }

    try {
        setAuthLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        closeAuthModal();
        updateTopNavUser(data.user);
    } catch (err) {
        showAuthError(err.message || "Invalid email or password.");
    } finally {
        setAuthLoading(false);
    }
}

// 3. Sign Up New Account
async function handleEmailSignUp(event) {
    if (event) event.preventDefault();
    const name = document.getElementById('signup-name')?.value?.trim();
    const email = document.getElementById('signup-email')?.value?.trim();
    const password = document.getElementById('signup-password')?.value;
    const confirmPassword = document.getElementById('signup-confirm-password')?.value;

    if (!email || !password) {
        showAuthError("Please enter email and password.");
        return;
    }

    if (password !== confirmPassword) {
        showAuthError("Passwords do not match.");
        return;
    }

    if (password.length < 6) {
        showAuthError("Password must be at least 6 characters.");
        return;
    }

    if (!supabase) {
        showAuthError("Supabase not initialized.");
        return;
    }

    try {
        setAuthLoading(true);
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: name || email
                }
            }
        });

        if (error) throw error;

        showAuthSuccess("Registration successful! You can now sign in.");
        setTimeout(() => switchAuthTab('signin'), 1500);
    } catch (err) {
        showAuthError(err.message || "Failed to register account.");
    } finally {
        setAuthLoading(false);
    }
}

// 4. Sign Out User
async function handleSignOut() {
    if (supabase) {
        await supabase.auth.signOut();
    }
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
    const btnSignup = document.getElementById('btn-auth-signup');
    if (btnSignin) btnSignin.disabled = loading;
    if (btnSignup) btnSignup.disabled = loading;
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
        if (userEmailSpan) userEmailSpan.textContent = user.email;
    } else {
        if (authBtnContainer) authBtnContainer.style.display = 'inline-block';
        if (profileDropdown) profileDropdown.style.display = 'none';
    }
}

// Listen to Auth Events on Load
document.addEventListener('DOMContentLoaded', async () => {
    if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data && data.session) {
            updateTopNavUser(data.session.user);
        } else {
            updateTopNavUser(null);
        }

        supabase.auth.onAuthStateChange((event, session) => {
            if (session && session.user) {
                updateTopNavUser(session.user);
            } else {
                updateTopNavUser(null);
            }
        });
    }
});
