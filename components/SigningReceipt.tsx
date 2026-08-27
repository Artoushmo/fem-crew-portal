'use client';

import { useEffect, useState } from 'react';
import {
  formatMoment,
  shortHash,
  signaturesFor,
  type SignatureEvidence,
} from '@/lib/signing';

/** What was actually recorded when someone signed.

    Shown rather than filed away: a signature nobody can inspect is the same
    problem as no signature at all when it is questioned a year later. Printing
    this page is the receipt -- there is no separate document to keep in step
    with the record. */
export function SigningReceipt({
  subjectType,
  subjectId,
}: {
  subjectType: 'agreement' | 'assignment_role';
  subjectId: string;
}) {
  const [rows, setRows] = useState<SignatureEvidence[] | null>(null);

  useEffect(() => {
    let live = true;
    signaturesFor(subjectType, subjectId)
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [subjectType, subjectId]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="receipt">
      {rows.map((r) => (
        <details key={r.id} className="receipt__item">
          <summary className="receipt__summary">
            Signed by {r.signer_name ?? r.signer_email ?? 'you'} on {formatMoment(r.signed_at)}
          </summary>

          <dl className="receipt__facts">
            <dt>Reference</dt>
            <dd className="receipt__mono">{r.reference}</dd>

            <dt>Document</dt>
            <dd>{r.document_name}</dd>

            <dt>Fingerprint</dt>
            <dd className="receipt__mono" title={r.document_sha256 ?? undefined}>
              {shortHash(r.document_sha256)}
            </dd>

            <dt>Signed by</dt>
            <dd>
              {r.signer_name ?? 'Unnamed'}
              {r.signer_email ? ` (${r.signer_email})` : ''}
            </dd>

            <dt>From</dt>
            <dd className="receipt__mono">{r.ip ?? 'not recorded'}</dd>

            {r.user_agent && (
              <>
                <dt>Browser</dt>
                <dd className="receipt__ua">{r.user_agent}</dd>
              </>
            )}
          </dl>

          <p className="receipt__note">
            The fingerprint is a SHA-256 of the document as it was signed. Re-hashing the
            stored file gives the same value unless the file has changed. Identity, time
            and address were recorded by the server from the signed-in session, not sent
            by the browser.
          </p>

          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => window.print()}
          >
            Print this receipt
          </button>
        </details>
      ))}
    </div>
  );
}
