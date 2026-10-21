import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button, field } from '../components/ui';
import { useToast } from '../components/Toast';
import { APP_NAME } from '../config';
import { useAuth } from '../lib/auth';
import { headerGradient } from '../theme';

export function Login() {
  const { admin, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const to = (loc.state as { from?: string } | null)?.from ?? '/';
  if (admin) return <Navigate to={to} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await login(mobile, password); nav(to, { replace: true }); }
    catch (err) { toast(err instanceof Error ? err.message : 'Login failed', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4" style={headerGradient}>
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 20 }} className="w-full max-w-sm space-y-3 rounded-card bg-white p-5 shadow-card sm:p-6">
        <div className="text-center">
          <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 3 }} className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-gold bg-gradient-to-b from-[#ff3b30] to-[#8a0c0c] text-3xl" aria-label="logo">🎟️</motion.div>
          <h1 className="mt-2 text-xl font-extrabold text-brand-dark">{APP_NAME}</h1>
          <p className="text-sm text-muted">Admin Panel login</p>
        </div>
        <input className={field} inputMode="numeric" maxLength={10} placeholder="Admin mobile number" value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} required autoComplete="username" />
        <input className={field} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        <Button disabled={busy}>{busy ? 'Please wait…' : 'Login'}</Button>
      </motion.form>
    </div>
  );
}
