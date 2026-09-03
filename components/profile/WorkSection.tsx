'use client';

import { useEffect, useState } from 'react';
import { requireSupabase } from '@/lib/supabase';
import {
  CRAFTS,
  CRAFT_LABEL,
  TRAVEL_SCOPES,
  TRAVEL_SCOPE_LABEL,
  type CraftRow,
  type Craft,
  type ProfileRow,
  type TravelScope,
} from '@/lib/profile-types';
import { Field, SectionForm } from './SectionForm';

export function WorkSection({
  profile,
  crafts,
  onSaved,
}: {
  profile: ProfileRow | null;
  crafts: CraftRow[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Craft[]>([]);
  const [primary, setPrimary] = useState<Craft | null>(null);
  const [years, setYears] = useState<Record<string, string>>({});
  const [reach, setReach] = useState({ travel_scope: 'nl' as TravelScope, notice_hours: '' });
  const [snapshot, setSnapshot] = useState('');

  useEffect(() => {
    const picked = crafts.map((c) => c.craft);
    setSelected(picked);
    setPrimary(crafts.find((c) => c.is_primary)?.craft ?? picked[0] ?? null);
    setYears(
      Object.fromEntries(crafts.map((c) => [c.craft, c.years_experience?.toString() ?? ''])),
    );
    const next = {
      travel_scope: (profile?.travel_scope ?? 'nl') as TravelScope,
      notice_hours: profile?.notice_hours?.toString() ?? '',
    };
    setReach(next);
    setSnapshot(JSON.stringify({ picked, primary: crafts.find((c) => c.is_primary)?.craft ?? null, years: Object.fromEntries(crafts.map((c) => [c.craft, c.years_experience?.toString() ?? ''])), next }));
    // Only while nothing has been typed. Saving another section reloads the
    // profile, and reseeding here threw away half-made craft selections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, crafts.length]);

  const current = JSON.stringify({ picked: selected, primary, years, next: reach });
  const dirty = snapshot !== '' && current !== snapshot;

  const toggle = (craft: Craft) => {
    setSelected((list) => {
      const has = list.includes(craft);
      const next = has ? list.filter((c) => c !== craft) : [...list, craft];
      if (has && primary === craft) setPrimary(next[0] ?? null);
      if (!has && !primary) setPrimary(craft);
      return next;
    });
  };

  const save = async () => {
    if (!profile) return;
    const client = requireSupabase();

    // Replace the set rather than diffing: a handful of rows, and it keeps the
    // single-primary constraint from tripping over an intermediate state.
    const { error: clearError } = await client
      .from('freelancer_crafts')
      .delete()
      .eq('profile_id', profile.id);
    if (clearError) throw new Error(clearError.message);

    if (selected.length > 0) {
      const rows = selected.map((craft) => ({
        profile_id: profile.id,
        craft,
        is_primary: craft === primary,
        years_experience: years[craft] ? Number(years[craft]) : null,
      }));
      const { error } = await client.from('freelancer_crafts').insert(rows);
      if (error) throw new Error(error.message);
    }

    const { error: profileError } = await client
      .from('profiles')
      .update({
        travel_scope: reach.travel_scope,
        notice_hours: reach.notice_hours ? Number(reach.notice_hours) : null,
      })
      .eq('id', profile.id);
    if (profileError) throw new Error(profileError.message);

    setSnapshot(current);
    onSaved();
  };

  return (
    <SectionForm
      title="What you do"
      hint="FEM matches assignments on this. Pick everything you take work for, and mark the one you are booked as most."
      onSave={save}
      dirty={dirty}
    >
      <ul className="crafts">
        {CRAFTS.map((craft) => {
          const on = selected.includes(craft);
          return (
            <li key={craft} className={`craft ${on ? 'craft--on' : ''}`}>
              <label className="craft__pick">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(craft)}
                  className="sr-only"
                />
                <span className="check__box" aria-hidden />
                <span className="craft__name">{CRAFT_LABEL[craft]}</span>
              </label>

              {on && (
                <div className="craft__meta">
                  <label className="craft__primary">
                    <input
                      type="radio"
                      name="primary-craft"
                      checked={primary === craft}
                      onChange={() => setPrimary(craft)}
                    />
                    <span>Primary</span>
                  </label>
                  <label className="craft__years">
                    <input
                      className="field__input field__input--tiny"
                      value={years[craft] ?? ''}
                      onChange={(e) =>
                        setYears((y) => ({
                          ...y,
                          [craft]: e.target.value.replace(/\D/g, '').slice(0, 2),
                        }))
                      }
                      inputMode="numeric"
                      placeholder="0"
                      aria-label={`Years of experience as ${CRAFT_LABEL[craft]}`}
                    />
                    <span>yrs</span>
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="grid-2 grid-2--spaced">
        <Field label="How far you travel" hint="What a producer checks before offering you a day.">
          <select
            className="field__input"
            value={reach.travel_scope}
            onChange={(e) =>
              setReach((r) => ({ ...r, travel_scope: e.target.value as TravelScope }))
            }
          >
            {TRAVEL_SCOPES.map((v) => (
              <option key={v} value={v}>
                {TRAVEL_SCOPE_LABEL[v]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notice needed" hint="Hours of warning before a shoot.">
          <input
            className="field__input"
            value={reach.notice_hours}
            onChange={(e) =>
              setReach((r) => ({
                ...r,
                notice_hours: e.target.value.replace(/\D/g, '').slice(0, 4),
              }))
            }
            inputMode="numeric"
            placeholder="48"
          />
        </Field>
      </div>
    </SectionForm>
  );
}
