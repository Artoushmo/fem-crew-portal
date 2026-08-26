'use client';

import { useEffect, useState } from 'react';
import { requireSupabase } from '@/lib/supabase';
import type { ProfileRow } from '@/lib/profile-types';
import { Field, SectionForm } from './SectionForm';

export function InvoicingSection({
  profile,
  onSaved,
}: {
  profile: ProfileRow | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    company_name: '',
    coc_number: '',
    vat_number: '',
    iban: '',
  });
  const [initial, setInitial] = useState(form);

  useEffect(() => {
    if (!profile) return;
    const next = {
      company_name: profile.company_name ?? '',
      coc_number: profile.coc_number ?? '',
      vat_number: profile.vat_number ?? '',
      iban: profile.iban ?? '',
    };
    setForm(next);
    setInitial(next);
  }, [profile]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    const { error } = await requireSupabase()
      .from('profiles')
      .update({
        company_name: form.company_name.trim() || null,
        coc_number: form.coc_number.trim() || null,
        vat_number: form.vat_number.trim() || null,
        iban: form.iban.replace(/\s/g, '').toUpperCase() || null,
      })
      .eq('id', profile!.id);

    if (error) throw new Error(error.message);
    setInitial(form);
    onSaved();
  };

  return (
    <SectionForm
      title="Invoicing"
      hint="Used on the invoices you send FEM. Only you and FEM's finance staff can read this."
      onSave={save}
      dirty={dirty}
      onReset={() => setForm(initial)}
    >
      <div className="grid-2">
        <Field label="Trading name">
          <input
            className="field__input"
            value={form.company_name}
            onChange={set('company_name')}
            placeholder="Alex Larsen Photography"
            autoComplete="organization"
          />
        </Field>

        <Field label="Chamber of Commerce" hint="KvK number.">
          <input
            className="field__input"
            value={form.coc_number}
            onChange={set('coc_number')}
            placeholder="12345678"
            inputMode="numeric"
          />
        </Field>

        <Field label="VAT number" hint="BTW-id, needed to invoice with VAT.">
          <input
            className="field__input"
            value={form.vat_number}
            onChange={set('vat_number')}
            placeholder="NL001234567B01"
          />
        </Field>

        <Field label="IBAN">
          <input
            className="field__input"
            value={form.iban}
            onChange={set('iban')}
            placeholder="NL00 BANK 0123 4567 89"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </div>
    </SectionForm>
  );
}
