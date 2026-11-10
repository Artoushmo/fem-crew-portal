'use client';

import { useState } from 'react';
import {
  CRAFT_LABEL,
  CREDENTIAL_LABEL,
  GEAR_LABEL,
  TRAVEL_SCOPE_LABEL,
  type GearCategory,
  type GearRow,
} from '@/lib/profile-types';
import { credentialUrl, useMemberProfile } from '@/lib/use-member-profile';
import { BrandLoader } from '../BrandLoader';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** What FEM sees of a freelancer: everything the person filled in, read-only,
    in the same panels the person sees on their own profile. Opened from the
    team list, so a producer can check kit, licences, where someone works and
    how to invoice them without booking them first. */
export function MemberProfile({ id }: { id: string }) {
  const { profile, crafts, gear, credentials, loading, error } = useMemberProfile(id);
  const [docError, setDocError] = useState<string | null>(null);

  if (loading) return <BrandLoader label="Opening profile" />;
  if (error)
    return (
      <p className="auth__error" role="alert">
        {error}
      </p>
    );
  if (!profile) return <p className="state state--idle">Nothing on file.</p>;

  const today = new Date().toISOString().slice(0, 10);

  // Kit grouped the way the owner sees it: bodies together, lenses together.
  const byCategory = Object.values(
    gear.reduce<Record<string, { category: GearCategory; items: GearRow[] }>>((acc, g) => {
      (acc[g.category] ??= { category: g.category, items: [] }).items.push(g);
      return acc;
    }, {}),
  );

  return (
    <div className="mprof">
      <div className="mprof__grid">
        <section className="panel">
          <h2 className="panel__title">Where they work</h2>
          <dl className="specs">
            <Row label="Based in" value={profile.base_city} />
            <Row label="Travels" value={TRAVEL_SCOPE_LABEL[profile.travel_scope]} />
            <Row label="Notice" value={profile.notice_hours ? `${profile.notice_hours} hours` : null} />
          </dl>
          {profile.bio && <p className="mprof__bio">{profile.bio}</p>}
        </section>

        <section className="panel">
          <h2 className="panel__title">Reach them</h2>
          <dl className="specs">
            <Row label="Phone" value={profile.phone} href={profile.phone ? `tel:${profile.phone}` : undefined} />
            <Row label="Email" value={profile.email} href={profile.email ? `mailto:${profile.email}` : undefined} />
          </dl>
          {profile.phone && (
            <div className="panel__actions panel__actions--spaced">
              <a
                className="btn btn--outline btn--sm"
                href={`https://wa.me/${profile.phone.replace(/[^\d]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
              <a className="btn btn--outline btn--sm" href={`tel:${profile.phone}`}>
                Call
              </a>
            </div>
          )}
        </section>

        <section className="panel">
          <h2 className="panel__title">Crafts</h2>
          {crafts.length === 0 ? (
            <p className="state state--idle">No crafts on their profile yet.</p>
          ) : (
            <ul className="tagrow">
              {crafts.map((c) => (
                <li key={c.craft} className={`tag ${c.is_primary ? 'tag--ok' : 'tag--wait'}`}>
                  {CRAFT_LABEL[c.craft]}
                  {c.years_experience != null && ` · ${c.years_experience}y`}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2 className="panel__title">Invoicing</h2>
          <dl className="specs">
            <Row label="Company" value={profile.company_name} />
            <Row label="IBAN" value={profile.iban} copy />
            <Row label="VAT" value={profile.vat_number} copy />
            <Row label="CoC" value={profile.coc_number} copy />
          </dl>
        </section>
      </div>

      <section className="panel">
        <h2 className="panel__title">Kit</h2>
        {gear.length === 0 ? (
          <p className="state state--idle">No kit listed.</p>
        ) : (
          <div className="kit mprof__kit">
            {byCategory.map(({ category, items }) => (
              <div key={category} className="kit__group">
                <h3 className="kit__heading">{GEAR_LABEL[category]}</h3>
                <ul className="kit__items">
                  {items.map((g) => (
                    <li key={g.id} className="kit__item">
                      <span className="kit__name">
                        {g.quantity > 1 && <span className="kit__count">{g.quantity}×</span>}
                        {g.brand ? `${g.brand} ` : ''}
                        {g.model}
                      </span>
                      {g.notes && <span className="mprof__note">{g.notes}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel__title">Licences &amp; insurance</h2>
        {credentials.length === 0 ? (
          <p className="state state--idle">None on file.</p>
        ) : (
          <dl className="specs">
            {credentials.map((c) => {
              const expired = c.expires_on != null && c.expires_on < today;
              return (
                <div key={c.id}>
                  <dt>
                    {c.label}
                    <span className="mprof__note"> · {CREDENTIAL_LABEL[c.kind]}</span>
                    {c.reference && <span className="mprof__note"> · {c.reference}</span>}
                  </dt>
                  <dd className={expired ? 'mprof__expired' : undefined}>
                    {c.expires_on
                      ? `${expired ? 'Expired' : 'Valid to'} ${fmtDate(c.expires_on)}`
                      : 'No expiry'}
                    {c.document_path && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          className="link-arrow link-arrow--button"
                          onClick={async () => {
                            setDocError(null);
                            try {
                              window.open(await credentialUrl(c.document_path!), '_blank', 'noopener');
                            } catch (err) {
                              setDocError(err instanceof Error ? err.message : 'Could not open that file.');
                            }
                          }}
                        >
                          Open
                        </button>
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
        {docError && (
          <p className="auth__error" role="alert">
            {docError}
          </p>
        )}
      </section>
    </div>
  );
}

/** One line of a specs list. An empty value says so in grey rather than
    leaving a gap, so a producer can see at a glance what is still missing. */
function Row({
  label,
  value,
  href,
  copy = false,
}: {
  label: string;
  value: string | null;
  href?: string;
  copy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const shown = value && value.trim() !== '' ? value : null;

  return (
    <div>
      <dt>{label}</dt>
      {shown == null ? (
        <dd className="mprof__missing">Not on file</dd>
      ) : href ? (
        <dd>
          <a className="mprof__link" href={href}>
            {shown}
          </a>
        </dd>
      ) : copy ? (
        <dd>
          <button
            type="button"
            className="mprof__copy"
            title="Copy"
            onClick={async () => {
              await navigator.clipboard.writeText(shown);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? 'Copied' : shown}
          </button>
        </dd>
      ) : (
        <dd>{shown}</dd>
      )}
    </div>
  );
}
