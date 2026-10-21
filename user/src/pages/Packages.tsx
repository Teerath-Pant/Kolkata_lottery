import { useQuery } from '@tanstack/react-query';
import { PackageRow } from '../components/PackageCard';
import { ErrorBox, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import type { Pkg } from '../lib/types';

export function Packages() {
  const q = useQuery({ queryKey: ['packages'], queryFn: () => api<{ packages: Pkg[] }>('/packages'), refetchInterval: 5000 });
  return (
    <div>
      <PageHeader title="Select Prize Amount" back="/" />
      <div className="grid gap-3 p-4 md:mx-auto md:max-w-5xl md:grid-cols-2 md:gap-5 md:px-6 lg:grid-cols-3">
        {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} retry={() => q.refetch()} /> :
          q.data!.packages.map((p) => <PackageRow key={p.id} pkg={p} />)}
      </div>
    </div>
  );
}
