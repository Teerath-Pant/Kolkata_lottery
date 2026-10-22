export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const ticketLabel = (n: number) => String(n).padStart(6, '0');
export const fmtNum = (n: number) => n.toLocaleString('en-IN');
