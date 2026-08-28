// Supabase Configuration for PALMNEX Application
const SUPABASE_URL = "https://dkafzakyeuehvpkkhdsa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrYWZ6YWt5ZXVlaHZwa2toZHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MTA3MTgsImV4cCI6MjEwMzQ4NjcxOH0.CmL8-LZ3XBrLZ1H_3ofUtCFcy5vNJFiMzEvdFbE-pQU";

// Initialize Supabase Client
let supabase = null;

function initSupabase() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Supabase Client initialized successfully!");
    } else {
        console.warn("Supabase SDK loading...");
    }
}

// Auto-initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
} else {
    initSupabase();
}
