// Supabase Configuration for PALMNEX Application
const SUPABASE_URL = "https://dkafzakyeuehvpkkhdsa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrYWZ6YWt5ZXVlaHZwa2toZHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MTA3MTgsImV4cCI6MjEwMzQ4NjcxOH0.CmL8-LZ3XBrLZ1H_3ofUtCFcy5vNJFiMzEvdFbE-pQU";

// Initialize Supabase Client
window.supabaseClient = null;

window.getSupabase = function() {
    if (!window.supabaseClient && window.supabase && typeof window.supabase.createClient === 'function') {
        try {
            const customStorage = {
                getItem: (key) => {
                    if (window.localStorage.getItem('palmnex_remember_me') === 'true') {
                        return window.localStorage.getItem(key);
                    }
                    return window.sessionStorage.getItem(key);
                },
                setItem: (key, value) => {
                    if (window.localStorage.getItem('palmnex_remember_me') === 'true') {
                        window.localStorage.setItem(key, value);
                    } else {
                        window.sessionStorage.setItem(key, value);
                    }
                },
                removeItem: (key) => {
                    window.localStorage.removeItem(key);
                    window.sessionStorage.removeItem(key);
                }
            };
            
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    storage: customStorage,
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true
                }
            });
            console.log("Supabase Client initialized successfully with custom storage!");
        } catch(e) {
            console.warn("Failed to initialize Supabase client:", e);
        }
    }
    return window.supabaseClient;
};

// Auto-initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.getSupabase);
} else {
    window.getSupabase();
}
