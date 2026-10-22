import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Item, item } from "../components/motion";
import { Countdown, ErrorBox, Spinner } from "../components/ui";
import { APP_NAME } from "../config";
import { Logo } from "../components/Logo";
import { api } from "../lib/api";
import type { Pkg } from "../lib/types";
import { headerGradient } from "../theme";

const MLink = motion.create(Link);

// Tile ke colours (position ke hisaab se)
const tileColors = [
  "from-red-500 to-red-700",
  "from-blue-500 to-blue-700",
  "from-green-500 to-green-700",
  "from-purple-500 to-purple-700",
  "from-pink-500 to-fuchsia-700",
];

// Tile ke neeche ka label (position ke hisaab se)
const tileLabels = [
  "Grand Prize",
  "Mega Prize",
  "Special Prize",
  "Special Prize",
  "Super Prize",
];

// Tiles ka sequence (Name admin mein bilkul aise hi likha hona chahiye)
const ORDER = ["1 करोड़", "2 करोड़", "5 लाख", "10 लाख", "20 लाख"];
const rank = (name: string) => {
  const i = ORDER.indexOf(name.trim());
  return i === -1 ? 99 : i;
};

export function Home() {
  const q = useQuery({
    queryKey: ["packages"],
    queryFn: () => api<{ packages: Pkg[]; serverTime: string }>("/packages"),
    refetchInterval: 5000,
  });
  const next = q.data?.packages
    .map((p) => p.currentDraw)
    .filter(Boolean)
    .sort((a, b) => +new Date(a!.drawTime) - +new Date(b!.drawTime))[0];
  const sorted = q.data
    ? [...q.data.packages].sort((a, b) => rank(a.name) - rank(b.name))
    : [];

  return (
    <div>
      {/* Mobile header (PC pe Layout ka nav dikhta hai, isliye yahan md:hidden) */}
      <header
        className="grid grid-cols-3 items-center px-3 py-2 text-white md:hidden"
        style={headerGradient}
      >
        <div className="flex justify-start">
          <Link
            to="/more"
            aria-label="Menu"
            className="p-2 text-2xl leading-none"
          >
            ☰
          </Link>
        </div>
        <div className="flex justify-center">
          <Logo size={64} className="shrink-0" />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            aria-label="Notifications"
            className="p-2 text-2xl leading-none"
          >
            🔔
          </button>
        </div>
      </header>

      <div className="space-y-3 p-3 md:mx-auto md:max-w-5xl md:space-y-5 md:px-6 md:py-8">
        {/* Banner + countdown */}


              {/* Ek curved box: andar banner + lottery ticket */}
        <Item>
          <div className="mx-auto w-full overflow-hidden rounded-card bg-white shadow-card md:max-w-3xl">
            <img
              src="/banner.webp"
              alt="Banner"
              className="block h-auto w-full object-contain"
            />

            <div className="relative px-2 pb-2">
              <img
                src="/lottery.webp"
                alt="Lucky Ticket"
                className="block h-auto w-full rounded-lg object-contain"
              />
              <motion.span
                animate={{ opacity: [1, 0.55, 1] }}
                transition={{ repeat: Infinity, duration: 1.6 }}
                className="absolute right-4 top-2 rounded-full bg-bad px-3 py-1.5 text-center text-[10px] font-extrabold uppercase leading-tight text-white shadow-lg md:right-6 md:top-3 md:text-xs"
              >
                Live<br />Draw
              </motion.span>
            </div>
          </div>
        </Item>

        {/* Prize tiles */}
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={() => q.refetch()} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
            {sorted.map((p, i) => (
              <MLink
                key={p.id}
              to={p.currentDraw ? `/draw/${p.currentDraw.id}` : '/packages'}
                variants={item}
                whileTap={{ scale: 0.96 }}
                whileHover={{ y: -3 }}
                className={`flex min-h-[120px] flex-col items-center justify-center rounded-card bg-gradient-to-br ${tileColors[i % tileColors.length]} p-3 text-center text-white shadow-card md:min-h-[160px]`}
              >
                <span className="text-2xl md:text-4xl">🏆</span>
                <span className="text-3xl font-extrabold leading-tight md:text-4xl">
                  {p.name}
                </span>
                <span className="text-sm font-medium text-white/90 md:text-base">
                  {tileLabels[i] ?? "Prize"}
                </span>
              </MLink>
            ))}

            <MLink
              to="/results"
              variants={item}
              whileTap={{ scale: 0.96 }}
              whileHover={{ y: -3 }}
              className="flex min-h-[120px] flex-col items-center justify-center rounded-card bg-gradient-to-br from-gold to-gold-dark p-3 text-center font-bold text-[#4a2e00] shadow-card md:min-h-[160px]"
            >
              <span className="text-3xl md:text-4xl">📋</span>
              <span className="text-xl">All Draws</span>
              <span className="text-sm font-medium">View All</span>
            </MLink>
          </div>
        )}
      </div>
    </div>
  );
}
