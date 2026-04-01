import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isValidUrl = (url) => {
  if (!url) return false;
  try {
    new URL(url);
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
};

const hasValidConfig = isValidUrl(supabaseUrl) && supabaseAnonKey;

if (!hasValidConfig) {
  console.warn('Supabase environment variables missing or invalid. Auth features will be disabled.');
}

// Create a mock client if env vars are missing/invalid
export const supabase = hasValidConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: (callback) => ({ 
          data: { subscription: { unsubscribe: () => {} } } 
        }),
        signInWithOtp: async () => ({ error: { message: 'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' } }),
        signInWithOAuth: async () => ({ error: { message: 'Supabase not configured' } }),
        signOut: async () => ({ error: null })
      }
    };
