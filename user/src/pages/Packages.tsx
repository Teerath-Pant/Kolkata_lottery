import { useQuery } from '@tanstack/react-query';
import { PackageRow } from '../components/PackageCard';
import { ErrorBox, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import type { Pkg } from '../lib/types';

// Sequence (Name admin mein bilkul aise hi hona chahiye)
const ORDER = ['1 करोड़', '2 करोड़', '5 लाख', '10 लाख', '20 लाख'];
const rank = (name: string) => {
  const i = ORDER.indexOf(name.trim());
  return i === -1 ? 99 : i;
};

export function Packages() {
  const q = useQuery({ queryKey: ['packages'], queryFn: () => api<{ packages: Pkg[] }>('/packages'), refetchInterval: 5000 });
  const sorted = q.data ? [...q.data.packages].sort((a, b) => rank(a.name) - rank(b.name)) : [];
  return (
    <div>
      <PageHeader title="Select Prize Amount" back="/" />
      <div className="mx-auto grid max-w-md gap-3 p-4">
        {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} retry={() => q.refetch()} /> :
          sorted.map((p, i) => <PackageRow key={p.id} pkg={p} index={i} />)}
      </div>
    </div>
  );
}