export const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function billFinancials(bill) {
  const totalCents = Math.round(Number(bill.totalAmount || 0) * 100);
  const paidCents = Number.isSafeInteger(bill.paidCents) ? bill.paidCents : bill.paymentStatus === 'paid' ? totalCents : 0;
  return { paidCents, balanceCents: Math.max(0, totalCents - paidCents) };
}
export const indiaDate = date => date ? new Date(date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';
