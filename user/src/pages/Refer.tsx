import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import { Card, PageHeader } from '../components/ui';
import { APP_NAME } from '../config';

export function Refer() {
  const { user } = useAuth();
  const toast = useToast();

  // Abhi UI-only: asli referral code backend se aayega. Tab tak mobile se banaya hua code dikhega.
  const mobile = String((user as { mobile?: string } | null)?.mobile ?? '');
  const code = `LTD${mobile.slice(-6) || '000000'}`;
  const msg = `Join ${APP_NAME} and get bonus coins! Use my referral code: ${code}\n${window.location.origin}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Referral code copied', 'success');
    } catch {
      toast('Could not copy referral code', 'error');
    }
  };

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: msg }); } catch { /* user ne cancel kiya */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  return (
    <div>
      <PageHeader title="Refer & Earn" back="/more" />
      <div className="mx-auto max-w-md space-y-4 p-4">
        <Card className="relative overflow-hidden border border-amber-200 !bg-gradient-to-br from-amber-50 via-white to-yellow-100 text-center shadow-[0_10px_30px_rgba(202,138,4,0.2)]">
          <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-yellow-300/50 blur-2xl" />
          <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-4xl shadow-lg">🎁</div>
          <h2 className="relative mt-3 text-xl font-extrabold text-amber-950">Invite Friends, Earn Rewards</h2>
          <p className="relative mx-auto mt-1 max-w-xs text-sm leading-relaxed text-amber-950/75">Share your referral code. When a friend signs up, you both receive bonus coins.</p>
        </Card>

        <Card className="border border-blue-100 bg-gradient-to-br from-white to-blue-50 text-center shadow-[0_10px_28px_rgba(30,86,200,0.14)]">
          <div className="text-xs font-bold uppercase tracking-wider text-muted">Your Referral Code</div>
          <div className="my-3 rounded-btn border-2 border-dashed border-brand/50 bg-white py-4 text-2xl font-extrabold tracking-[0.2em] text-brand-dark shadow-inner">{code}</div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={copy} className="rounded-btn border border-brand/30 bg-white py-3 font-bold text-brand shadow-sm transition hover:bg-brand-light">Copy Code</button>
            <button type="button" onClick={share} className="rounded-btn bg-gradient-to-b from-green-500 to-green-700 py-3 font-bold text-white shadow-card transition hover:brightness-105">Share</button>
          </div>
        </Card>

        <Card className="border border-line bg-gradient-to-br from-white to-slate-50 shadow-card">
          <div className="mb-3 font-bold text-brand-dark">How It Works</div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted marker:font-bold marker:text-brand">
            <li>Share your referral code with a friend.</li>
            <li>Your friend enters the code when signing up.</li>
            <li>You both receive bonus coins.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}