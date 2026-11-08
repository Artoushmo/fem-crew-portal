import { formatEuro } from '@/lib/use-staff-assignments';
import { formatFee } from '@/lib/assignments';

/** An amount with what it is: ex or incl VAT, small, every time. A fee with
    nothing after it gets read both ways, and the wrong way costs somebody 21%. */
export function Money({
  cents,
  amount,
  vat = 'ex',
  className,
}: {
  /** Whole cents (FEM side) ... */
  cents?: number;
  /** ... or euros (freelancer side). One of the two. */
  amount?: number;
  vat?: 'ex' | 'incl';
  className?: string;
}) {
  const text = cents !== undefined ? formatEuro(cents) : formatFee(amount ?? 0);
  return (
    <span className={className ? `money ${className}` : 'money'}>
      {text}
      <small className="money__vat">{vat}</small>
    </span>
  );
}
