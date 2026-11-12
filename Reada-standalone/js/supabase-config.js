// Supabase Configuration for PALMNEX Application
const SUPABASE_URL = "https://dkafzakyeuehvpkkhdsa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrYWZ6YWt5ZXVlaHZwa2toZHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MTA3MTgsImV4cCI6MjEwMzQ4NjcxOH0.CmL8-LZ3XBrLZ1H_3ofUtCFcy5vNJFiMzEvdFbE-pQU";
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

// Initialize Supabase Client (avoid 'let supabase' which collides with @supabase/supabase-js global 'var supabase')
window.supabaseClient = null;

window.getSupabase = function() {
    if (!window.supabaseClient && window.supabase && typeof window.supabase.createClient === 'function') {
        try {
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("Supabase Client initialized successfully!");
        } catch(e) {
            console.warn("Failed to initialize Supabase client:", e);
        }
    }
    return window.supabaseClient;
};
var getSupabase = window.getSupabase;

// Auto-initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.getSupabase);
} else {
    window.getSupabase();
}
