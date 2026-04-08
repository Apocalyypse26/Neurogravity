import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

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
  logger.error('CRITICAL: Supabase environment variables missing or invalid!');
  logger.error('VITE_SUPABASE_URL:', supabaseUrl);
  logger.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'SET (length: ' + supabaseAnonKey.length + ')' : 'NOT SET');
} else {
  logger.info('Supabase client initialized with URL:', supabaseUrl);
}

// Create a mock client if env vars are missing/invalid
export const supabase = hasValidConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      },
      global: {
        headers: {
          'apikey': supabaseAnonKey
        }
      }
    })
  : {
      from: () => ({ 
        select: () => ({ 
          eq: () => ({ 
            single: async () => { return { data: null, error: { message: 'Supabase not configured' } }; } 
          }) 
        }),
        update: () => ({ 
          eq: async () => { return { error: null }; }
        })
      }),
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: (callback) => ({ 
          data: { subscription: { unsubscribe: () => {} } } 
        }),
        signInWithOtp: async () => ({ error: { message: 'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' } }),
        signInWithOAuth: async () => ({ error: { message: 'Supabase not configured' } }),
        signOut: async () => ({ error: null })
      },
      storage: {
        from: () => ({
          getPublicUrl: () => ({ data: { publicUrl: '' } }),
          remove: async () => ({ error: null })
        })
      }
    };
