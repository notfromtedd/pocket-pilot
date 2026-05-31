import { createClient } from '@supabase/supabase-js';

const supabaseUrl = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabasePublicKey = getSupabasePublicKey();

export const supabase = createClient(supabaseUrl, supabasePublicKey, {
  auth: {
    autoRefreshToken: typeof window !== 'undefined',
    detectSessionInUrl: typeof window !== 'undefined',
    persistSession: typeof window !== 'undefined',
  },
});

function getSupabasePublicKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const value = getRequiredEnv(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    key
  );

  if (value.startsWith('sb_secret_')) {
    throw new Error('Do not expose a Supabase secret key through NEXT_PUBLIC_* env vars.');
  }

  if (!looksLikeSupabasePublicKey(value)) {
    throw new Error(
      'Supabase public key looks invalid. Use a publishable key that starts with sb_publishable_ or a legacy anon JWT key.'
    );
  }

  return value;
}

function getRequiredEnv(name: string, value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return trimmed;
}

function looksLikeSupabasePublicKey(value: string) {
  return value.startsWith('sb_publishable_') || (value.startsWith('eyJ') && value.length > 100);
}
