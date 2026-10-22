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
  });
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-xs text-muted">
          Changes apply to the next draw that opens. Draws already open keep the
          rules players bought into.
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
      const { id, ...body } = f;
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
  const daily = f.dailyTime !== null;
  const num = (k: keyof AdminPkg) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: Number(e.target.value) });
  return (
    <Card>
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
            <option>green</option>
            <option>red</option>
            <option>blue</option>
            <option>purple</option>
            <option>pink</option>
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
    </Card>
  );
}
