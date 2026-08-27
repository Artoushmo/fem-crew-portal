'use client';

import { requireSupabase } from './supabase';

/** SHA-256 of a file, computed in the browser before it is uploaded.

    This is what turns "they clicked sign" into "they signed this exact
    document": the hash is stored beside the file and copied onto the signature,
    so a file replaced afterwards no longer matches what anyone signed against.

    SubtleCrypto needs a secure context. Localhost counts, plain http on a LAN
    address does not -- hence the explicit failure rather than a silent null,
    which would leave signatures quietly unprovable. */
export async function sha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot fingerprint the file. Use https.');
  }

  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Short, quotable, and unique enough to be found in a list. Not a secret: the
    row it points at is protected by row level security, and a reference nobody
    can read out over the phone is no use on a receipt. */
export function signingReference(): string {
  const year = new Date().getFullYear();
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `FEM-SIG-${year}-${rand}`;
}

export interface SignatureEvidence {
  id: string;
  reference: string;
  signer_name: string | null;
  signer_email: string | null;
  document_kind: 'agreement' | 'job-contract';
  document_name: string;
  document_sha256: string | null;
  signed_at: string;
  ip: string | null;
  user_agent: string | null;
}

/** Writes the signing event. Everything that identifies the signer -- who, when,
    from where -- is filled in by the database from the verified session, so the
    values here are only the ones about the document. */
export async function recordSignature(input: {
  documentKind: 'agreement' | 'job-contract';
  documentName: string;
  documentSha256: string | null;
  documentPath: string | null;
  subjectType: 'agreement' | 'assignment_role';
  subjectId: string;
}): Promise<string> {
  const reference = signingReference();

  const { error } = await requireSupabase().from('signatures').insert({
    reference,
    document_kind: input.documentKind,
    document_name: input.documentName,
    document_sha256: input.documentSha256,
    document_path: input.documentPath,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
  });

  if (error) throw new Error(error.message);
  return reference;
}

export async function signaturesFor(
  subjectType: 'agreement' | 'assignment_role',
  subjectId: string,
): Promise<SignatureEvidence[]> {
  const { data } = await requireSupabase()
    .from('signatures')
    .select(
      'id, reference, signer_name, signer_email, document_kind, document_name, document_sha256, signed_at, ip, user_agent',
    )
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('signed_at', { ascending: false });

  return (data as SignatureEvidence[]) ?? [];
}

export function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** The hash is 64 characters, which nobody reads. Both ends are what you check
    against another copy. */
export function shortHash(hash: string | null): string {
  if (!hash) return 'not recorded';
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}
