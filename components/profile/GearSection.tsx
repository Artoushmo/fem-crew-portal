'use client';

import { useState } from 'react';
import { requireSupabase } from '@/lib/supabase';
import {
  GEAR_CATEGORIES,
  GEAR_LABEL,
  type GearCategory,
  type GearRow,
  type ProfileRow,
} from '@/lib/profile-types';

const BLANK = { category: 'camera' as GearCategory, brand: '', model: '', quantity: '1' };

export function GearSection({
  profile,
  gear,
  onSaved,
}: {
  profile: ProfileRow | null;
  gear: GearRow[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !draft.model.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const { error: insertError } = await requireSupabase().from('gear').insert({
        profile_id: profile.id,
        category: draft.category,
        brand: draft.brand.trim() || null,
        model: draft.model.trim(),
        quantity: Number(draft.quantity) || 1,
      });
      if (insertError) throw new Error(insertError.message);
      setDraft({ ...BLANK, category: draft.category });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    const { error: deleteError } = await requireSupabase().from('gear').delete().eq('id', id);
    if (deleteError) setError(deleteError.message);
    else onSaved();
  };

  const byCategory = GEAR_CATEGORIES.map((category) => ({
    category,
    items: gear.filter((g) => g.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="panel">
      <h2 className="panel__title">Your kit</h2>
      <p className="panel__hint">
        What you own and bring. FEM checks this before putting you on a job that needs
        specific glass or a drone, so keep it current.
      </p>

      {byCategory.length === 0 ? (
        <p className="state state--idle">Nothing listed yet.</p>
      ) : (
        <div className="kit">
          {byCategory.map(({ category, items }) => (
            <div key={category} className="kit__group">
              <h3 className="kit__heading">{GEAR_LABEL[category]}</h3>
              <ul className="kit__items">
                {items.map((item) => (
                  <li key={item.id} className="kit__item">
                    <span className="kit__name">
                      {item.quantity > 1 && (
                        <span className="kit__count">{item.quantity}×</span>
                      )}
                      {item.brand ? `${item.brand} ` : ''}
                      {item.model}
                    </span>
                    <button
                      type="button"
                      className="link-arrow link-arrow--button link-arrow--danger"
                      onClick={() => remove(item.id)}
                      aria-label={`Remove ${item.model}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <form className="kit__add" onSubmit={add}>
        <label className="field field--inline">
          <span className="field__label">Type</span>
          <select
            className="field__input"
            value={draft.category}
            onChange={(e) =>
              setDraft((d) => ({ ...d, category: e.target.value as GearCategory }))
            }
          >
            {GEAR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {GEAR_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="field field--inline">
          <span className="field__label">Brand</span>
          <input
            className="field__input"
            value={draft.brand}
            onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
            placeholder="Sony"
          />
        </label>

        <label className="field field--inline field--grow">
          <span className="field__label">Model</span>
          <input
            className="field__input"
            value={draft.model}
            onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
            placeholder="A7 IV"
            required
          />
        </label>

        <label className="field field--inline field--narrow">
          <span className="field__label">Qty</span>
          <input
            className="field__input"
            value={draft.quantity}
            onChange={(e) =>
              setDraft((d) => ({ ...d, quantity: e.target.value.replace(/\D/g, '').slice(0, 2) }))
            }
            inputMode="numeric"
          />
        </label>

        <button
          type="submit"
          className="btn btn--primary btn--sm kit__submit"
          disabled={busy || !draft.model.trim()}
        >
          Add
        </button>
      </form>

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
