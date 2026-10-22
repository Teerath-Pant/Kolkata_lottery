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
  const msg = `${APP_NAME} join karo aur bonus coins pao! Mera referral code: ${code}\n${window.location.origin}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Code copy ho gaya', 'success');
    } catch {
      toast('Copy nahi hua', 'error');
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
        <Card className="text-center">
          <div className="text-5xl">🎁</div>
          <h2 className="mt-2 text-lg font-bold text-brand-dark">दोस्त को बुलाओ, बोनस पाओ</h2>
          <p className="mt-1 text-xs text-muted">Apna code dost ko bhejo. Wo signup kare to dono ko bonus coins milenge.</p>
        </Card>

        <Card className="text-center">
          <div className="text-xs text-muted">Aapka Referral Code</div>
          <div className="my-2 rounded-btn border-2 border-dashed border-bad bg-red-50 py-3 text-2xl font-extrabold tracking-widest text-bad">{code}</div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={copy} className="rounded-btn border-2 border-brand/30 bg-white py-3 font-bold text-brand">Copy</button>
            <button type="button" onClick={share} className="rounded-btn bg-gradient-to-b from-green-500 to-green-700 py-3 font-bold text-white shadow-card">Share</button>
          </div>
        </Card>

        <Card>
          <div className="mb-2 font-semibold">Kaise kaam karta hai</div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Apna code dost ko share karo.</li>
            <li>Dost signup mein wo code daale.</li>
            <li>Dono ko bonus coins milenge.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}