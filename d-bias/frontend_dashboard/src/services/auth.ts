import { supabase } from '../lib/supabase';
const SUPABASE_BUCKET_ANALYSIS_JSON = (import.meta as any).env?.VITE_SUPABASE_BUCKET_ANALYSIS_JSON || 'analysis_json';
const SUPABASE_BUCKET_PDF_BIAS_REPORTS = (import.meta as any).env?.VITE_SUPABASE_BUCKET_PDF_BIAS_REPORTS || 'pdf_bias_reports';

export type SignUpPayload = {
  name?: string;
  email: string;
  password: string;
};

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // best-effort session log
  try { await logSession('login'); } catch {}
  return data;
}

export async function signUp(payload: SignUpPayload) {
  const { email, password, name } = payload;

  // 1️⃣ Sign up via Supabase Auth (include metadata + redirect when available)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name, name },
      emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  } as any);
  if (error) {
    console.error('Supabase Auth signup error:', error);
    throw error;
  }

  const user = data.user;
  if (!user) return data;

  const username = (name && name.trim()) || email.split('@')[0] || 'user';

  // 2️⃣ Ensure users row exists
  try {
    await supabase
      .from('users')
      .upsert({ user_id: user.id, username }, { onConflict: 'user_id' });
  } catch (err) {
    console.error('Error inserting/upserting user profile:', err);
    throw err;
  }

  // 3️⃣ Log session
  try { await logSession('signup'); } catch (err) {
    console.error('Error logging signup session:', err);
  }

  return data;
}


export async function signOut() {
  try { await logSession('logout'); } catch {}
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

export function onAuthStateChange(cb: (event: string) => void) {
  const { data } = supabase.auth.onAuthStateChange((event) => cb(event));
  return () => data.subscription.unsubscribe();
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

// lightweight session logging into public.session_log (requires RLS policy)
async function logSession(action: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await supabase.from('session_log').insert({ user_id: user.id, action });
}
