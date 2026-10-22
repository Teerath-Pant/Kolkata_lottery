import { Card, PageHeader } from '../components/ui';

export function Payment() {
  return (
    <div>
      <PageHeader title="Payment" />
      <div className="p-4 md:mx-auto md:max-w-2xl md:px-6">
        <Card>
          <p className="text-center text-sm text-muted">Payment options will be added here.</p>
        </Card>
      </div>
    </div>
  );
}
