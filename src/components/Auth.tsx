import { useEffect, useState, type ReactNode } from 'react';
import { platform } from '../lib/platform';

/** On the website (Supabase mode) you sign in once; your data then syncs on every device. */
export function AuthGate({ children }: { children: ReactNode }) {
  const sb = platform.sb;
  const [state, setState] = useState<'checking' | 'in' | 'out'>(sb ? 'checking' : 'in');
  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setState(data.session ? 'in' : 'out'));
    const { data } = sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_OUT') location.reload();
      else if (session) setState('in');
    });
    return () => data.subscription.unsubscribe();
  }, [sb]);
  if (state === 'checking') return <div className="p-10 text-muted">Loading…</div>;
  if (state === 'out') return <Login />;
  return <>{children}</>;
}

function Login() {
  const sb = platform.sb!;
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg('');
    const { data, error } = mode === 'in'
      ? await sb.auth.signInWithPassword({ email: email.trim(), password: pw })
      : await sb.auth.signUp({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setMsg(/invalid login/i.test(error.message) ? 'Wrong email or password.' : /not allowed|disabled/i.test(error.message) ? 'New sign-ups are turned off for this SkillTrack.' : error.message);
    else if (mode === 'up' && !data.session) setMsg('Account created. Check your email to confirm it, then sign in.');
  };
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-[380px] p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent"><svg viewBox="0 0 32 32" className="h-8 w-8"><path d="M9 21l5-5 4 4 6-8" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          <div><h1 className="text-lg font-semibold leading-tight">SkillTrack</h1><p className="text-xs text-muted">{mode === 'in' ? 'Sign in to your roadmaps' : 'Create your account'}</p></div>
        </div>
        <label className="mb-3 flex flex-col gap-1"><span className="eyebrow">Email</span>
          <input id="login-email" type="email" required autoComplete="email" className="input" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="mb-4 flex flex-col gap-1"><span className="eyebrow">Password</span>
          <input id="login-pw" type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} className="input" value={pw} onChange={e => setPw(e.target.value)} /></label>
        <button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        {msg && <p className="mt-3 text-[13px] text-ink2">{msg}</p>}
        <p className="mt-4 text-center text-[13px] text-muted">
          {mode === 'in' ? <>First time here? <button type="button" className="font-medium text-accent hover:underline" onClick={() => { setMode('up'); setMsg(''); }}>Create an account</button></>
            : <>Already have an account? <button type="button" className="font-medium text-accent hover:underline" onClick={() => { setMode('in'); setMsg(''); }}>Sign in</button></>}
        </p>
      </form>
    </div>
  );
}
