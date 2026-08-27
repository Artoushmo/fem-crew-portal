'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { sha256 as hashFile } from './signing';
import { requireSupabase, supabase } from './supabase';

export interface AgreementDoc {
  year: number;
  storage_path: string;
  original_name: string;
  uploaded_at: string;
  sha256: string | null;
  size_bytes: number | null;
}

const MAX_BYTES = 10 * 1024 * 1024;

/** The document FEM asks freelancers to sign, and the link to read it.

    The bucket is private and the file is reached through a signed url that
    expires, so a link copied out of the portal stops working instead of turning
    into a contract anyone can fetch. */
export function useAgreementDoc(year = new Date().getFullYear()) {
  const { profile, stage } = useAuth();
  const [doc, setDoc] = useState<AgreementDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManage = profile ? profile.role !== 'freelancer' : false;

  const load = useCallback(async () => {
    if (!supabase || stage !== 'ready') return;
    setError(null);

    const { data, error: queryError } = await supabase
      .from('agreement_documents')
      .select('year, storage_path, original_name, uploaded_at, sha256, size_bytes')
      .eq('year', year)
      .maybeSingle();

    if (queryError) {
      setError(
        queryError.message.includes('does not exist')
          ? 'The agreement table is missing. Run migration 0013 in Supabase.'
          : queryError.message,
      );
    }

    setDoc((data as AgreementDoc) ?? null);
    setLoading(false);
  }, [stage, year]);

  useEffect(() => {
    load();
  }, [load]);

  /** A short-lived url, minted per click rather than stored. */
  const openUrl = useCallback(async (): Promise<string> => {
    if (!doc) throw new Error('There is no agreement to open.');

    const { data, error: signError } = await requireSupabase()
      .storage.from('agreements')
      .createSignedUrl(doc.storage_path, 300);

    if (signError || !data) throw new Error(signError?.message ?? 'Could not open the document.');
    return data.signedUrl;
  }, [doc]);

  const upload = useCallback(
    async (file: File) => {
      if (file.type !== 'application/pdf') {
        throw new Error('The agreement has to be a PDF.');
      }
      if (file.size > MAX_BYTES) {
        throw new Error('That file is over 10 MB.');
      }

      // Fingerprinted before it leaves the browser, so what people sign against
      // can be checked against what is stored.
      const digest = await hashFile(file);
      const client = requireSupabase();
      // Versioned by upload time rather than overwritten: replacing the terms
      // under a signature that was already given would rewrite what people
      // agreed to.
      const path = `${year}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '-')}`;

      const { error: uploadError } = await client.storage
        .from('agreements')
        .upload(path, file, { contentType: 'application/pdf' });

      if (uploadError) throw new Error(uploadError.message);

      const { error: writeError } = await client.from('agreement_documents').upsert({
        year,
        storage_path: path,
        original_name: file.name,
        sha256: digest,
        size_bytes: file.size,
        uploaded_by: profile?.id ?? null,
        uploaded_at: new Date().toISOString(),
      });

      if (writeError) {
        await client.storage.from('agreements').remove([path]);
        throw new Error(writeError.message);
      }

      await load();
    },
    [load, profile?.id, year],
  );

  return { doc, loading, error, canManage, upload, openUrl, reload: load };
}
