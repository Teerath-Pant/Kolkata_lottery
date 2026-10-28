import { FormEvent, InputHTMLAttributes, ReactNode, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Item, Page, item } from '../components/motion';
import { Button } from '../components/ui';
import { useToast } from '../components/Toast';
import { Logo, Skyline } from '../components/Logo';
import { APP_NAME, MOTTO, TAGLINE } from '../config';
import { useAuth } from '../lib/auth';
import { headerGradient } from '../theme';

const icon = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const LockIcon = () => <svg {...icon}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.3" /></svg>;
const UserIcon = () => <svg {...icon}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
const GiftIcon = () => <svg {...icon}><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 13h18M12 8c-2-4-6-3-5 0 .5 1.3 3 1 5 0zm0 0c2-4 6-3 5 0-.5 1.3-3 1-5 0z" /></svg>;
const PhoneIcon = () => <svg {...icon}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>;
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg {...icon}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);

function Field({ icon: ic, right, ...p }: InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode; right?: ReactNode }) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">{ic}</span>
      <input
        {...p}
        className="w-full rounded-btn border border-line bg-white py-3.5 pl-12 pr-12 text-[15px] text-ink shadow-sm outline-none transition placeholder:text-muted/80 focus:border-brand focus:shadow-glow"
      />
      {right}
    </label>
  );
}

const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, exit: { opacity: 0, height: 0 } };

export function AuthPage() {
  const { user, login, register } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [sp] = useSearchParams();
  const refParam = sp.get('ref')?.trim() ?? '';
  // a shared referral link (/login?ref=CODE) opens straight on the sign-up form with the code filled in
  const [mode, setMode] = useState<'login' | 'register'>(refParam ? 'register' : 'login');
  const [referralCode, setReferralCode] = useState(refParam.toUpperCase());
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const to = (loc.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={to} replace />;
  const isLogin = mode === 'login';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isLogin) await login(username, password);
      else await register({ username, name, phone, password, referralCode });
      nav(to, { replace: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally { setBusy(false); }
  }

  const switchMode = () => { setMode(isLogin ? 'register' : 'login'); setForgot(false); };

  return (
    <Page className="flex min-h-[100dvh] flex-col bg-white md:flex-row">
      {/* tablet/desktop: brand panel on the left */}
      <Item className="relative hidden overflow-hidden text-white md:flex md:w-1/2 md:flex-col lg:w-[55%]" style={headerGradient}>
        <div className="flex flex-1 flex-col items-center justify-center px-8 pt-10 text-center">
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}>
            <Logo size={240} className="drop-shadow-[0_16px_32px_rgba(0,0,0,0.45)] lg:h-[246px] lg:w-[280px]" />
          </motion.div>
          <h1 className="mt-5 text-3xl font-extrabold text-gold lg:text-4xl">{APP_NAME}</h1>
          <p className="font-script text-3xl font-bold text-white lg:text-4xl">{TAGLINE}</p>
          <p className="mt-5 -rotate-3 font-script text-2xl font-bold leading-8 text-gold-light lg:text-3xl lg:leading-9">
            {MOTTO.split('|').map((l) => <span key={l} className="block">{l}</span>)}
          </p>
        </div>
        <Skyline fade={false} slice className="block h-[22vh] min-h-[110px] w-full shrink-0 opacity-70" />
      </Item>

      <div className="flex flex-1 flex-col md:min-h-[100dvh] md:justify-center md:overflow-y-auto">
      <div className="flex-1 px-6 pt-8 min-[380px]:px-7 min-[380px]:pt-10 md:mx-auto md:w-full md:max-w-md md:flex-none md:px-8 md:pt-0">
        <Item className="flex flex-col items-center text-center md:hidden">
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}>
            <Logo size={170} className="drop-shadow-[0_8px_16px_rgba(138,12,12,0.35)]" />
          </motion.div>
          <h1 className="mt-3 text-xl font-bold text-brand-dark min-[380px]:text-2xl">{APP_NAME}</h1>
          <p className="font-script text-[28px] font-bold leading-tight text-bad min-[380px]:text-[32px]">{TAGLINE}</p>
        </Item>
        <Item className="hidden md:block">
          <h2 className="text-3xl font-bold text-brand-dark">{isLogin ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-sm text-muted">{isLogin ? 'Login with your User ID to play.' : 'Sign up and get free starting coins.'}</p>
        </Item>

        <motion.form variants={item} onSubmit={submit} className="mt-6 space-y-3">
          <Field icon={<UserIcon />} maxLength={20} minLength={4} pattern="[A-Za-z0-9_]{4,20}" title="4-20 letters, digits or underscore" placeholder={isLogin ? 'User ID' : 'Enter User ID'} aria-label="User ID" value={username}
            onChange={(e) => setUsername(e.target.value.trim().toLowerCase())} required autoComplete="username" autoCapitalize="none" />
          <AnimatePresence initial={false}>
            {!isLogin && (
              <motion.div key="name" {...reveal} className="overflow-hidden">
                <Field icon={<UserIcon />} placeholder="Your Name" aria-label="Your name" value={name}
                  onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={40} autoComplete="name" />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {!isLogin && (
              <motion.div key="phone" {...reveal} className="space-y-3 overflow-hidden">
                <Field icon={<PhoneIcon />} type="tel" inputMode="numeric" maxLength={10} pattern="[6-9][0-9]{9}" title="10-digit mobile number"
                  placeholder="Mobile number" aria-label="Mobile number" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} required autoComplete="tel-national" />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {!isLogin && (
              <motion.div key="ref" {...reveal} className="overflow-hidden">
                <Field icon={<GiftIcon />} placeholder="Referral code" aria-label="Referral code" value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                  required maxLength={32} autoComplete="off" autoCapitalize="characters" />
              </motion.div>
            )}
          </AnimatePresence>
          <Field
            icon={<LockIcon />} type={show ? 'text' : 'password'} placeholder={isLogin ? 'Password' : 'Password (8+, letters & digits)'} aria-label="Password"
            value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isLogin ? 1 : 8}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            right={(
              <motion.button type="button" whileTap={{ scale: 0.8 }} onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
                <EyeIcon off={show} />
              </motion.button>
            )}
          />

          <Button disabled={busy} className="!py-3.5 text-lg">{busy ? 'Please wait…' : isLogin ? 'Login' : 'Create Account'}</Button>

          {isLogin && (
            <button type="button" onClick={() => setForgot((f) => !f)} className="block w-full text-center text-sm font-medium text-ink">
              Forgot Password?
            </button>
          )}
          <AnimatePresence initial={false}>
            {isLogin && forgot && (
              <motion.p key="forgot" {...reveal} className="overflow-hidden rounded-btn bg-brand-light px-3 py-2.5 text-center text-xs text-brand-dark">
                Password reset is done by support. Contact the admin with your User ID.
              </motion.p>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3 py-1 text-xs font-semibold text-muted">
            <span className="h-px flex-1 bg-line" />OR<span className="h-px flex-1 bg-line" />
          </div>

          <Button type="button" variant="outline" onClick={switchMode} className="!py-3 text-[15px]">
            {isLogin ? 'New User? Register Here' : 'Already have an account? Login'}
          </Button>
        </motion.form>
      </div>

      <Item className="relative mt-6 md:hidden">
        <p className="relative z-10 -mb-6 ml-auto mr-8 w-fit -rotate-6 text-center font-script text-[26px] font-bold leading-7 text-brand min-[380px]:text-[30px] min-[380px]:leading-8">
          {MOTTO.split('|').map((l) => <span key={l} className="block">{l}</span>)}
        </p>
        <Skyline className="block w-full" />
      </Item>
      </div>
    </Page>
  );
}
