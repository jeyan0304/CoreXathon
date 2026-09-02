import { useState } from 'react';
import type { FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { signIn } from '../services/auth';

export function SignInPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      onSignedIn();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-2 text-slate-900"><ShieldCheck className="text-blue-600" /><h1 className="text-xl font-bold">Sign in to CoreX</h1></div>
      <p className="text-sm text-slate-600">Use your Supabase account. Workflow access is limited to its authenticated owner.</p>
      <label className="block text-sm font-medium">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label>
      <label className="block text-sm font-medium">Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button disabled={loading} className="w-full rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>;
}
