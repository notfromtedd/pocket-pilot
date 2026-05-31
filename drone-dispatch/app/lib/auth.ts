import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const MIN_EMAIL_OTP_LENGTH = 6;
export const MAX_EMAIL_OTP_LENGTH = 10;

export interface UserSession {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  verified: boolean;
}

interface CustomerProfile {
  id: string;
  auth_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  verified: boolean | null;
}

export async function requestSignUpCode(
  email: string,
  fullName: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = normalizeEmail(email);
  const cleanName = fullName.trim();

  if (!isValidEmail(cleanEmail)) {
    return { success: false, error: 'Enter a valid email address' };
  }

  if (!cleanName) {
    return { success: false, error: 'Enter your full name' };
  }

  const { error } = await requestEmailOtp({
    email: cleanEmail,
    shouldCreateUser: true,
    fullName: cleanName,
  });

  if (error) {
    return { success: false, error: getFriendlyAuthError(error.message) };
  }

  return { success: true };
}

export async function requestSignInCode(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = normalizeEmail(email);

  if (!isValidEmail(cleanEmail)) {
    return { success: false, error: 'Enter a valid email address' };
  }

  const { error } = await requestEmailOtp({
    email: cleanEmail,
    shouldCreateUser: true,
  });

  if (error) {
    return { success: false, error: getFriendlyAuthError(error.message) };
  }

  return { success: true };
}

export async function verifyEmailCode(
  email: string,
  token: string,
  fullName?: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = normalizeEmail(email);
  const cleanToken = token.trim();

  if (!isValidEmail(cleanEmail) || !isValidEmailOtp(cleanToken)) {
    return {
      success: false,
      error: `Enter the ${MIN_EMAIL_OTP_LENGTH}-${MAX_EMAIL_OTP_LENGTH} digit code sent to your email`,
    };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: 'email',
  });

  if (error) {
    return { success: false, error: getFriendlyAuthError(error.message) };
  }

  if (data.user) {
    const profile = await ensureCustomerProfile(data.user, fullName);
    if (!profile.success) {
      return profile;
    }
  }

  return { success: true };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<UserSession | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('auth_id', session.user.id)
    .maybeSingle<CustomerProfile>();

  if (customer) {
    return mapCustomerToSession(session.user, customer);
  }

  const profile = await ensureCustomerProfile(session.user);
  if (!profile.success || !profile.customer) {
    return mapUserToSession(session.user);
  }

  return mapCustomerToSession(session.user, profile.customer);
}

export function onAuthStateChange(callback: (session: UserSession | null) => void) {
  return supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      const userSession = await getSession();
      callback(userSession);
    } else {
      callback(null);
    }
  });
}

async function ensureCustomerProfile(
  user: User,
  fullName?: string
): Promise<{ success: boolean; error?: string; customer?: CustomerProfile }> {
  const email = normalizeEmail(user.email || '');
  const name = fullName?.trim() || getMetadataName(user) || getNameFromEmail(email);

  const { data, error } = await supabase
    .from('customers')
    .upsert(
      {
        auth_id: user.id,
        full_name: name,
        email,
        phone: user.phone || null,
        verified: true,
      },
      { onConflict: 'auth_id' }
    )
    .select('*')
    .single<CustomerProfile>();

  if (error) {
    return {
      success: false,
      error:
        getFriendlyAuthError(error.message) ||
        'Could not save your customer profile. Make sure the customers table supports email login.',
    };
  }

  return { success: true, customer: data };
}

function mapCustomerToSession(user: User, customer: CustomerProfile): UserSession {
  return {
    id: customer.id,
    email: customer.email || user.email || '',
    phone: customer.phone || user.phone || '',
    fullName: customer.full_name || getMetadataName(user) || getNameFromEmail(user.email || ''),
    verified: Boolean(customer.verified),
  };
}

function mapUserToSession(user: User): UserSession {
  return {
    id: user.id,
    email: user.email || '',
    phone: user.phone || '',
    fullName: getMetadataName(user) || getNameFromEmail(user.email || ''),
    verified: Boolean(user.email_confirmed_at || user.confirmed_at),
  };
}

function getMetadataName(user: User) {
  const fullName = user.user_metadata?.full_name;
  return typeof fullName === 'string' ? fullName : '';
}

function getNameFromEmail(email: string) {
  return email.split('@')[0] || 'Customer';
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidEmailOtp(token: string) {
  return new RegExp(`^\\d{${MIN_EMAIL_OTP_LENGTH},${MAX_EMAIL_OTP_LENGTH}}$`).test(token);
}

function getEmailRedirectTo() {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/customer`;
}

async function requestEmailOtp({
  email,
  shouldCreateUser,
  fullName,
}: {
  email: string;
  shouldCreateUser: boolean;
  fullName?: string;
}) {
  try {
    return await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser,
        emailRedirectTo: getEmailRedirectTo(),
        data: fullName ? { full_name: fullName } : undefined,
      },
    });
  } catch (error) {
    return { data: null, error: toAuthError(error) };
  }
}

function getFriendlyAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (
    !message ||
    message === '{}' ||
    normalized.includes('504') ||
    normalized.includes('gateway timeout') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('fetch failed')
  ) {
    return 'Supabase timed out while sending the email code. Check Auth > SMTP Settings, then try again.';
  }

  if (normalized.includes('email address not authorized')) {
    return 'Supabase is not allowed to email this address yet. Use an organization member email or configure custom SMTP in Supabase Auth.';
  }

  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Please wait a minute before requesting another code.';
  }

  if (normalized.includes('invalid login credentials') || normalized.includes('otp')) {
    return 'That code is invalid or expired. Request a new code and try again.';
  }

  return message;
}

function toAuthError(error: unknown) {
  if (error instanceof Error) return error;

  if (typeof error === 'string') {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error('Supabase timed out while sending the email code.');
  }
}
