const SESSION_KEY = 'corexathon.access_token';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event('corexathon:unauthorized'));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export async function signOut(): Promise<void> {
  const accessToken = getAccessToken();
  clearSession();
  if (!accessToken || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return;
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to sign in.');
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object' || typeof (payload as { access_token?: unknown }).access_token !== 'string') {
    const message = payload && typeof payload === 'object' && typeof (payload as { error_description?: unknown }).error_description === 'string'
      ? (payload as { error_description: string }).error_description
      : 'Sign in failed.';
    throw new Error(message);
  }
  localStorage.setItem(SESSION_KEY, (payload as { access_token: string }).access_token);
}
