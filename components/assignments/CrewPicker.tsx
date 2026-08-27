'use client';

import { useState } from 'react';
import { CRAFT_LABEL, type Craft } from '@/lib/profile-types';
import { rankForCraft, useCrew } from '@/lib/use-crew';
import { avatarUrl } from '@/lib/use-profile';
import { BrandLoader } from '../BrandLoader';

/** Picks someone for one role. Every reason for the order is on the card, so a
    surprising ranking can be read rather than trusted. */
export function CrewPicker({
  craft,
  city,
  shootDate,
  onPick,
  onCancel,
}: {
  craft: Craft;
  city: string | null;
  shootDate: string;
  onPick: (freelancerId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { crew, loading, error } = useCrew(shootDate);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const ranked = rankForCraft(crew, craft, city);
  const fitting = ranked.filter((r) => r.fits);
  const shown = showAll ? ranked : fitting;

  const pick = async (id: string) => {
    setBusyId(id);
    setPickError(null);
    try {
      await onPick(id);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not book them.');
      setBusyId(null);
    }
  };

  return (
    <div className="picker">
      <div className="picker__head">
        <div>
          <p className="eyebrow">Book a {CRAFT_LABEL[craft].toLowerCase()}</p>
          <p className="picker__hint">
            Booking offers the shoot straight away. They see it the next time they open the
            portal.
          </p>
        </div>
        <button type="button" className="link-arrow link-arrow--button" onClick={onCancel}>
          Close
        </button>
      </div>

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}
      {pickError && (
        <p className="auth__error" role="alert">
          {pickError}
        </p>
      )}

      {loading ? (
        <BrandLoader label="Finding crew" />
      ) : shown.length === 0 ? (
        <p className="state state--idle">
          {crew.length === 0
            ? 'No freelancers yet. Add one under Team.'
            : `Nobody lists ${CRAFT_LABEL[craft].toLowerCase()} as a craft.`}
          {crew.length > 0 && !showAll && (
            <>
              {' '}
              <button
                type="button"
                className="link-arrow link-arrow--button"
                onClick={() => setShowAll(true)}
              >
                Show everyone anyway
              </button>
            </>
          )}
        </p>
      ) : (
        <>
          <ul className="picker__list">
            {shown.map(({ member: m, fits }) => {
              const blocked = m.unavailable || m.clash;
              const avatar = avatarUrl(m.avatar_path);
              const name = m.full_name?.trim() || m.email?.split('@')[0] || 'Unnamed';

              return (
                <li key={m.id} className={`picker__row ${blocked ? 'is-blocked' : ''}`}>
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="member__avatar" />
                  ) : (
                    <span className="member__avatar member__avatar--initials" aria-hidden>
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                  )}

                  <div className="picker__who">
                    <span className="member__name">{name}</span>
                    <span className="member__email">
                      {[
                        m.base_city,
                        m.travel_radius_km ? `travels ${m.travel_radius_km} km` : null,
                        m.gear_count > 0 ? `${m.gear_count} items of kit` : 'no kit listed',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>

                  <div className="picker__tags">
                    {m.primary_craft === craft && <span className="tag tag--ok">Main craft</span>}
                    {!fits && <span className="tag tag--warn">Different craft</span>}
                    {m.clash && <span className="tag tag--warn">Booked that day</span>}
                    {m.unavailable && <span className="tag tag--warn">Marked unavailable</span>}
                    {m.expiring.length > 0 && (
                      <span className="tag tag--warn">
                        {m.expiring.length === 1
                          ? `${m.expiring[0]} expired`
                          : `${m.expiring.length} certificates expired`}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    disabled={busyId === m.id}
                    onClick={() => pick(m.id)}
                  >
                    {busyId === m.id ? 'Booking...' : blocked ? 'Book anyway' : 'Book'}
                  </button>
                </li>
              );
            })}
          </ul>

          {!showAll && ranked.length > fitting.length && (
            <button
              type="button"
              className="link-arrow link-arrow--button"
              onClick={() => setShowAll(true)}
            >
              Show the other {ranked.length - fitting.length} freelancers
            </button>
          )}
        </>
      )}
    </div>
  );
}
