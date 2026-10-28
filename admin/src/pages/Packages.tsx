import { ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/Toast";
import { Button, Card, field, Load } from "../components/ui";
import { api } from "../lib/api";
import type { AdminPkg } from "../lib/types";
import { theme } from "../theme";

export function Packages() {
  const q = useQuery({
    queryKey: ["admin-packages"],
    queryFn: () => api<{ packages: AdminPkg[] }>("/admin/packages"),
    refetchInterval: 15_000, // lock state follows ticket sales
  });
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-xs text-muted">
          A package can be edited only while its running draw has no tickets sold. Once a ticket
          is sold it stays locked until that draw's result is announced.
        </p>
        <div className="w-full shrink-0 sm:w-40">
          <Button variant="ghost" onClick={() => setCreating(!creating)}>
            {creating ? "Close" : "+ New package"}
          </Button>
        </div>
      </div>
      {creating && <PackageForm onDone={() => setCreating(false)} />}
      <Load q={q}>
        {(d) => (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {d.packages.map((p) => (
              <PackageForm key={p.id} pkg={p} />
            ))}
          </div>
        )}
      </Load>
    </div>
  );
}

const L = ({ t, children }: { t: string; children: ReactNode }) => (
  <label className="block text-[11px] font-medium text-muted">
    {t}
    {children}
  </label>
);

function PackageForm({ pkg, onDone }: { pkg?: AdminPkg; onDone?: () => void }) {
  const [f, setF] = useState<AdminPkg>(
    pkg ?? {
      id: 0,
      name: "",
      price: 50,
      prizeType: "fixed",
      prizeValue: 1000,
      maxTickets: 100,
      drawIntervalMinutes: 30,
      dailyTime: null,
      theme: "green",
      isActive: true,
    },
  );
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => {
      const { id, tierPrizes, ...body } = f;
      return pkg
        ? api(`/admin/packages/${pkg.id}`, { method: "PATCH", body })
        : api("/admin/packages", { body });
    },
    onSuccess: () => {
      toast(pkg ? "Package updated" : "Package created", "success");
      ["admin-packages", "admin-draws", "admin-audit"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
      onDone?.();
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Failed", "error"),
  });
  const remove = useMutation({
    mutationFn: () => api(`/admin/packages/${pkg!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Package deleted", "success");
      ["admin-packages", "admin-draws", "admin-audit"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Failed", "error"),
  });
  const daily = f.dailyTime !== null;
  const locked = (pkg?.openDrawSold ?? 0) > 0;
  const num = (k: keyof AdminPkg) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: Number(e.target.value) });
  return (
    <Card>
      {locked && (
        <div className="mb-3 rounded-btn bg-amber-50 p-2 text-xs font-semibold text-amber-800">
          🔒 {pkg!.openDrawSold} ticket{pkg!.openDrawSold === 1 ? "" : "s"} sold in the running draw. Editing unlocks after its result is announced.
        </div>
      )}
      <fieldset disabled={locked} className="disabled:opacity-60">
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="col-span-2 flex items-center gap-2">
            <span
              className="h-4 w-4 shrink-0 rounded-full"
              style={{ background: theme.packages[f.theme].from }}
            />
            <input
              className={field}
              placeholder="Name"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              required
            />
          </div>
          <L t="Price (coins)">
            <input
              className={field}
              type="number"
              min={1}
              value={f.price}
              onChange={num("price")}
            />
          </L>
          <L t="Theme">
            <select
              className={field}
              value={f.theme}
              onChange={(e) =>
                setF({ ...f, theme: e.target.value as AdminPkg["theme"] })
              }
            >
              {Object.keys(theme.packages).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </L>
          <L t="Prize type">
            <select
              className={field}
              value={f.prizeType}
              onChange={(e) =>
                setF({ ...f, prizeType: e.target.value as AdminPkg["prizeType"] })
              }
            >
              <option value="fixed">Fixed coins</option>
              <option value="pool_percent">% of pool</option>
            </select>
          </L>
          <L t={f.prizeType === "fixed" ? "Prize (coins)" : "Prize (% of pool)"}>
            <input
              className={field}
              type="number"
              min={1}
              max={f.prizeType === "pool_percent" ? 100 : undefined}
              value={f.prizeValue}
              onChange={num("prizeValue")}
            />
          </L>
          <L t="Max tickets (≤9999)">
            <input
              className={field}
              type="number"
              min={1}
              max={9999}
              value={f.maxTickets}
              onChange={num("maxTickets")}
            />
          </L>
          <fieldset className="col-span-2 space-y-2 rounded-btn border border-line p-2">
            <legend className="px-1 text-[11px] font-medium text-muted">
              Draw schedule
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className={`space-y-1 ${daily ? "opacity-60" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name={`sched-${f.id}`}
                    checked={!daily}
                    onChange={() =>
                      setF({
                        ...f,
                        drawIntervalMinutes: f.drawIntervalMinutes ?? 30,
                        dailyTime: null,
                      })
                    }
                  />
                  Repeat every (min)
                </label>
                <input
                  className={field}
                  type="number"
                  min={1}
                  disabled={daily}
                  required={!daily}
                  value={f.drawIntervalMinutes ?? ""}
                  onChange={num("drawIntervalMinutes")}
                  aria-label="Draw interval in minutes"
                />
              </div>
              <div className={`space-y-1 ${daily ? "" : "opacity-60"}`}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name={`sched-${f.id}`}
                    checked={daily}
                    onChange={() =>
                      setF({
                        ...f,
                        drawIntervalMinutes: null,
                        dailyTime: f.dailyTime ?? "18:00",
                      })
                    }
                  />
                  Every day at (IST)
                </label>
                <input
                  className={field}
                  type="time"
                  disabled={!daily}
                  required={daily}
                  value={f.dailyTime ?? ""}
                  onChange={(e) => setF({ ...f, dailyTime: e.target.value })}
                  aria-label="Daily draw time in IST"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted"></p>
          </fieldset>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={f.isActive}
              onChange={(e) => setF({ ...f, isActive: e.target.checked })}
            />{" "}
            Active
          </label>
          <div className="col-span-2">
            <Button disabled={save.isPending}>{pkg ? "Save" : "Create"}</Button>
          </div>
        </form>
        {pkg && <TierPrizes pkg={pkg} />}
        {pkg && (
          <Button
            type="button"
            variant="ghost"
            className="mt-3 !border-bad/40 !text-bad"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Delete package "${pkg.name}"? It disappears from the app and gets no new draws. Past results stay.`)) remove.mutate();
            }}
          >
            {remove.isPending ? "Deleting…" : "Delete package"}
          </Button>
        )}
      </fieldset>
    </Card>
  );
}

const TIERS = [5, 4, 3, 2, 1];

/** Consolation prizes by matching leading digits of the winning number (6 digits = main prize above). */
function TierPrizes({ pkg }: { pkg: AdminPkg }) {
  const initial = () => Object.fromEntries(TIERS.map((k) => [k, String(pkg.tierPrizes?.[k] ?? 0)]));
  const [v, setV] = useState<Record<number, string>>(initial);
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/packages/${pkg.id}/tier-prizes`, {
        method: "PUT",
        body: { prizes: TIERS.map((k) => ({ matchDigits: k, prize: Math.max(0, Math.floor(Number(v[k]) || 0)) })) },
      }),
    onSuccess: () => {
      toast("Digit prizes saved", "success");
      ["admin-packages", "admin-audit"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Failed", "error"),
  });
  return (
    <form
      className="mt-3 space-y-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="text-[11px] font-medium text-muted">
        Digit-match prizes (coins). A ticket gets the prize for its longest run of matching digits from the left of the
        winning number; 6 digits is the main prize. 0 turns a tier off.
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-1.5">
        {TIERS.map((k) => (
          <L key={k} t={`${k} digit${k > 1 ? "s" : ""}`}>
            <input
              className={`${field} !px-2 text-center tabular-nums`}
              type="number"
              min={0}
              value={v[k]}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
            />
          </L>
        ))}
      </div>
      <Button variant="ghost" disabled={save.isPending}>Save digit prizes</Button>
    </form>
  );
}
