import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Celebration } from "../components/Celebration";
import { prizeText } from "../components/PackageCard";
import { useToast } from "../components/Toast";
import {
  Button,
  Coins,
  Countdown,
  ErrorBox,
  ModeBadge,
  PageHeader,
  Spinner,
} from "../components/ui";
import { api } from "../lib/api";
import { fmtDateTime, ticketLabel } from "../lib/time";
import type { Draw } from "../lib/types";
import { DRAW_PACKAGE_COLORS, themeGradient } from "../theme";

const HOW = [
  'Buy as many tickets as you like, one number per ticket.',
  'Pick a free number from the grid, or tap Random Number and let the server choose.',
  'Tickets cost play coins. Coins have no real-world value and cannot be cashed out.',
  'At draw time the winning ticket is announced and the prize coins are credited automatically.',
  'The draw mode (Random draw / Admin-selected winner) is shown on this screen. Random draws are provably fair: verify any result on the Verify page.',
  'If too few tickets are sold, the draw is cancelled and everyone is refunded.',
];

// Sequence (Name admin mein bilkul aise hi hona chahiye)
const ORDER = ["1 करोड़", "2 करोड़", "5 लाख", "10 लाख", "20 लाख"];
const LABELS = [
  "GRAND PRIZE",
  "MEGA PRIZE",
  "SPECIAL PRIZE",
  "SPECIAL PRIZE",
  "SUPER PRIZE",
];
// Card images (user/public/cards/)
const CARD_IMG = ["/1.png", "/2.png", "/5.png", "/10.png", "/20.png"];
// [light, dark, button, deep shadow]
// 3D text (sirf tab use hota hai jab image na ho)
const bigText: React.CSSProperties = {
  background: "linear-gradient(180deg, #fff3b0 0%, #ffd34d 45%, #e8a200 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextStroke: "1px rgba(120,60,0,0.55)",
  filter:
    "drop-shadow(0 2px 0 #9a5b00) drop-shadow(0 4px 0 #7a4400) drop-shadow(0 8px 6px rgba(0,0,0,0.45))",
};

export function DrawPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [panel, setPanel] = useState<"prize" | "how" | null>(null);
  const [party, setParty] = useState(false);
  const prev = useRef<string | null>(null);

  const q = useQuery({
    queryKey: ["draw", id],
    queryFn: () => api<Draw>(`/draws/${id}`),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d || d.status === "completed" || d.status === "cancelled")
        return false;
      return Date.parse(d.drawTime) - Date.now() < 90_000 ? 2000 : 5000;
    },
  });
  const d = q.data;

  useEffect(() => {
    if (!d) return;
    const was = prev.current;
    prev.current = d.status;
    if (
      was &&
      was !== d.status &&
      (d.status === "completed" || d.status === "cancelled")
    ) {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      if (d.iWon) setParty(true);
      else if (d.status === "completed")
        toast(`Winning ticket: #${ticketLabel(d.winningTicketNo!)}`, "info");
      else toast("Draw cancelled. Any tickets were refunded.", "info");
    }
  }, [d, qc, toast]);

  if (q.isLoading)
    return (
      <>
        <PageHeader title="Draw" back="/" />
        <Spinner />
      </>
    );
  if (q.error || !d)
    return (
      <>
        <PageHeader title="Draw" back="/" />
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      </>
    );

  const open = d.status === "open";
  const idx = ORDER.indexOf(d.packageName.trim());
  const col = DRAW_PACKAGE_COLORS[d.packageName.trim()] ?? null;
  const label =
    idx >= 0 ? LABELS[idx] : (prizeText(d) ?? "Grand prize").toUpperCase();
  const pageStyle: React.CSSProperties = col
    ? {
        backgroundColor: "#090b12",
        backgroundImage: `radial-gradient(ellipse at 50% 0%, ${col[0]}66 0%, transparent 48%), radial-gradient(ellipse at 100% 38%, ${col[1]} 0%, transparent 42%), linear-gradient(160deg, #191b29 0%, #0b0d15 58%, #07090f 100%)`,
      }
    : themeGradient(d.theme);
  const btnStyle: React.CSSProperties | undefined = col
    ? {
        background: `linear-gradient(180deg, ${col[0]}, ${col[2]})`,
        boxShadow: `0 5px 0 ${col[3]}, 0 10px 14px rgba(0,0,0,0.3), inset 0 2px 0 rgba(255,255,255,0.35)`,
      }
    : undefined;
  const cardStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.25)",
    border: "5px solid #f5c542",
    boxShadow:
      "0 0 0 2px #8a5a00, 0 10px 0 #6b4300, 0 18px 24px rgba(0,0,0,0.45)",
  };
  const whiteCard: React.CSSProperties = {
    boxShadow:
      "0 6px 0 rgba(0,0,0,0.18), 0 12px 16px rgba(0,0,0,0.25), inset 0 2px 0 #fff",
  };

  const goNext = async () => {
    try {
      nav(
        `/draw/${(await api<Draw>(`/packages/${d.packageId}/current-draw`)).id}`,
        { replace: true },
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "No open draw yet", "error");
    }
  };

  return (
    <div className="min-h-screen" style={pageStyle}>
      <div className="relative flex items-center justify-center px-4 py-3 text-white">
        <button
          type="button"
          onClick={() => nav("/")}
          aria-label="Back"
          className="absolute left-3 p-2 text-2xl leading-none"
        >
          ‹
        </button>
        <h1 className="text-lg font-bold">{d.packageName} Draw</h1>
      </div>
      {party && (
        <Celebration
          ticketNo={d.winningTicketNo!}
          prize={d.prizeAmount}
          onClose={() => setParty(false)}
        />
      )}

      <div className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-4 md:max-w-lg md:pt-6">
        {/* Prize badge: image (agar naam match kare), warna purana text card */}
        {idx >= 0 ? (
          <div className="text-center text-white">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.015 }}
              transition={{ duration: 0.35 }}
              className="relative flex h-[300px] w-full items-center justify-center overflow-hidden rounded-2xl border p-2 shadow-2xl md:h-[350px]"
              style={{
                background: `linear-gradient(145deg, ${col?.[1]}, #101323 55%, ${col?.[3]})`,
                borderColor: `${col?.[0]}aa`,
                boxShadow: `0 0 0 1px ${col?.[0]}55, 0 12px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.3)`,
              }}
            >
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -inset-y-1/2 left-0 z-10 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ['-180%', '480%'] }}
                transition={{ duration: 4, repeat: Infinity, repeatDelay: 1, ease: 'linear' }}
              />
              <img
                src={CARD_IMG[idx]}
                alt={`${d.packageName} ${label}`}
                className="relative z-0 h-full w-full select-none object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.55)]"
                draggable={false}
              />
            </motion.div>
            <div className="mt-4 text-sm text-white/90">
              Prize:{" "}
              {d.prizeType === "fixed" ? (
                <Coins n={d.prizeValue} size={14} />
              ) : (
                <>
                  {d.prizeValue}% of pool (<Coins n={d.prizeAmount} size={14} />
                  )
                </>
              )}
            </div>
            <div className="mt-2">
              <ModeBadge mode={d.mode} />
            </div>
            <div className="mt-3 text-xs text-white/80">
              Draw Date &amp; Time
            </div>
            <div
              className="text-lg font-semibold"
              style={{ textShadow: "0 2px 2px rgba(0,0,0,0.4)" }}
            >
              {fmtDateTime(d.drawTime)}
            </div>
            {open && (
              <div className="mt-1 text-xs text-white/85">
                ⏱ <Countdown target={d.drawTime} serverTime={d.serverTime} /> ·{" "}
                {d.soldCount}/{d.maxTickets} sold
              </div>
            )}
          </div>
        ) : (
          <div
            className="relative rounded-card p-4 pb-5 pt-8 text-center text-white"
            style={cardStyle}
          >
            <div
              className="absolute -top-8 left-1/2 -ml-7 text-6xl"
              aria-hidden
            >
              👑
            </div>
            <div
              className="text-6xl font-extrabold leading-tight"
              style={bigText}
            >
              {d.packageName}
            </div>
            <div className="mt-2 inline-block rounded-btn border-2 border-gold bg-black/30 px-5 py-1 text-lg font-extrabold tracking-wide text-[#fff3b0]">
              {label}
            </div>
            <div className="mt-2 text-sm text-white/90">
              Prize:{" "}
              {d.prizeType === "fixed" ? (
                <Coins n={d.prizeValue} size={14} />
              ) : (
                <>
                  {d.prizeValue}% of pool (<Coins n={d.prizeAmount} size={14} />
                  )
                </>
              )}
            </div>
            <div className="mt-2">
              <ModeBadge mode={d.mode} />
            </div>
            <div className="mt-3 text-xs text-white/80">
              Draw Date &amp; Time
            </div>
            <div className="text-lg font-semibold">
              {fmtDateTime(d.drawTime)}
            </div>
            {open && (
              <div className="mt-1 text-xs text-white/85">
                ⏱ <Countdown target={d.drawTime} serverTime={d.serverTime} /> ·{" "}
                {d.soldCount}/{d.maxTickets} sold
              </div>
            )}
          </div>
        )}

        {d.status === "completed" && (
          <div
            className="rounded-card bg-white p-4 text-center"
            style={whiteCard}
          >
            <div className="text-xs font-semibold uppercase text-muted">
              Winning ticket
            </div>
            <div className="text-4xl font-extrabold tracking-widest text-bad">
              #{ticketLabel(d.winningTicketNo!)}
            </div>
            <div className="text-sm text-muted">
              Winner {d.winnerName} · <Coins n={d.prizeAmount} />
            </div>
            {d.iWon && (
              <div className="mt-2 rounded-btn bg-gold-light py-2 font-bold text-[#6b4a00]">
                🎉 That is your ticket! Prize credited.
              </div>
            )}
            <Link
              to={`/verify/${d.id}`}
              className="mt-2 inline-block text-sm font-semibold text-brand underline"
            >
              Verify this result
            </Link>
          </div>
        )}
        {d.status === "cancelled" && (
          <div
            className="rounded-card bg-white p-4 text-center text-sm"
            style={whiteCard}
          >
            Draw cancelled (not enough tickets sold). Tickets were refunded.
          </div>
        )}

        {/* Ticket price + Book Now */}
        <div className="rounded-card bg-white p-4" style={whiteCard}>
          <div
            className="text-center text-sm font-semibold"
            style={{ color: col ? col[1] : undefined }}
          >
            Ticket Price
          </div>
          <div
            className="mb-3 text-center text-3xl font-extrabold"
            style={{ color: col ? col[1] : undefined }}
          >
            <Coins n={d.ticketPrice} size={26} />
          </div>
          {open && d.myTicketNos.length > 0 && (
            <div className="mb-3 rounded-btn bg-brand-light py-3 text-center text-sm font-bold text-brand-dark">
              Your tickets: {d.myTicketNos.map((n) => `#${ticketLabel(n)}`).join(', ')}
            </div>
          )}
          {open && (btnStyle
            ? <button onClick={() => nav(`/book/${d.id}`)} style={btnStyle} className="w-full rounded-btn py-3 text-lg font-bold text-white active:translate-y-1">{d.myTicketNos.length ? 'Book Another' : 'Book Now'}</button>
            : <Button onClick={() => nav(`/book/${d.id}`)}>{d.myTicketNos.length ? 'Book Another' : 'Book Now'}</Button>)}
          {!open && <Button onClick={goNext}>Go to next draw</Button>}
        </div>

        {/* Prize Details / Past Results / How to Play */}
        <div
          className="grid grid-cols-3 gap-2 rounded-card bg-white p-2 text-center text-[11px] font-medium"
          style={whiteCard}
        >
          <button
            onClick={() => setPanel(panel === "prize" ? null : "prize")}
            className="rounded-btn py-2"
          >
            <div className="text-xl">🏅</div>Prize Details
          </button>
          <Link
            to={`/results?packageId=${d.packageId}`}
            className="block rounded-btn py-2"
          >
            <div className="text-xl">📋</div>Past Results
          </Link>
          <button
            onClick={() => setPanel(panel === "how" ? null : "how")}
            className="rounded-btn py-2"
          >
            <div className="text-xl">❓</div>How to Play
          </button>
        </div>

        {panel === 'prize' && (
          <div className="space-y-1 rounded-card bg-white p-4 text-sm" style={whiteCard}>
            <p><b>Prize:</b> {d.prizeType === 'fixed' ? <Coins n={d.prizeValue} /> : `${d.prizeValue}% of the ticket pool (now `}{d.prizeType !== 'fixed' && <><Coins n={d.prizeAmount} />)</>}</p>
            <p><b>Tickets:</b> max {d.maxTickets}. The draw runs even if only one ticket is sold; with no tickets it is skipped.</p>
            <p><b>Winner selection:</b> {d.mode === 'random' ? 'Random (HMAC of a pre-committed server seed).' : 'Chosen by the admin before draw time.'}</p>
            <div className="pt-2 text-[11px] text-muted">
              <div className="font-semibold">
                Provably fair commitment (SHA-256 of server seed)
              </div>
              <button
                className="mt-1 block w-full break-all text-left font-mono"
                onClick={() => {
                  navigator.clipboard?.writeText(d.serverSeedHash);
                  toast("Hash copied", "success");
                }}
              >
                {d.serverSeedHash}
              </button>
              {d.serverSeed && (
                <div className="mt-1 break-all">
                  <span className="font-semibold">Revealed seed:</span>{" "}
                  <span className="font-mono">{d.serverSeed}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {panel === "how" && (
          <ol
            className="list-decimal space-y-1 rounded-card bg-white p-4 pl-8 text-sm"
            style={whiteCard}
          >
            {HOW.map(([title, detail]) => (
              <li key={title}>
                <strong>{title}</strong>
                <br />
                {detail}
              </li>
            ))}
            <li className="mt-2 list-none font-semibold text-bad">
              🔴 <strong>Note:</strong> Always double-check draw times, ticket prices, and official results. Good luck! 🤞🍀
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
