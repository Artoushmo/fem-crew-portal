'use client';

import { useState } from 'react';
import {
  CRAFT_LABEL,
  CREDENTIAL_LABEL,
  GEAR_LABEL,
  TRAVEL_SCOPE_LABEL,
} from '@/lib/profile-types';
import { credentialUrl, useMemberProfile } from '@/lib/use-member-profile';
import { BrandLoader } from '../BrandLoader';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** What FEM sees of a freelancer: everything the person filled in, read-only.
    Opened from the team list, so a producer can check kit, licences, where
    someone works and how to invoice them without booking them first. */
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
  const primary = crafts.find((c) => c.is_primary);

  return (
    <div className="memberprofile">
      {/* Where they work and how far they go: the first thing a producer
          checks before putting someone on a job. */}
      <div className="memberprofile__grid">
        <Fact label="Based in" value={profile.base_city} />
        <Fact label="Travels" value={TRAVEL_SCOPE_LABEL[profile.travel_scope]} />
        <Fact label="Phone" value={profile.phone} href={profile.phone ? `tel:${profile.phone}` : undefined} />
        <Fact label="Email" value={profile.email} href={profile.email ? `mailto:${profile.email}` : undefined} />
        <Fact label="Notice" value={profile.notice_hours ? `${profile.notice_hours} h` : null} />
        <Fact label="Country" value={profile.country} />
      </div>

      {profile.bio && (
        <section className="memberprofile__block">
          <h4 className="memberprofile__title">About</h4>
          <p className="prose">{profile.bio}</p>
        </section>
      )}

      <section className="memberprofile__block">
        <h4 className="memberprofile__title">Crafts</h4>
        {crafts.length === 0 ? (
          <p className="memberprofile__none">No crafts on their profile yet.</p>
        ) : (
          <ul className="tagrow">
            {crafts.map((c) => (
              <li key={c.craft} className={`tag ${c.is_primary ? 'tag--ok' : 'tag--wait'}`}>
                {CRAFT_LABEL[c.craft]}
                {c.years_experience != null && ` · ${c.years_experience}y`}
                {c.is_primary && primary?.craft === c.craft ? ' · main' : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="memberprofile__block">
        <h4 className="memberprofile__title">Kit</h4>
        {gear.length === 0 ? (
          <p className="memberprofile__none">No kit listed.</p>
        ) : (
          <ul className="memberprofile__list">
            {gear.map((g) => (
              <li key={g.id}>
                <span className="memberprofile__gear">
                  {g.quantity > 1 ? `${g.quantity}× ` : ''}
                  {[g.brand, g.model].filter(Boolean).join(' ')}
                </span>
                <span className="memberprofile__meta">
                  {GEAR_LABEL[g.category]}
                  {g.notes ? ` · ${g.notes}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="memberprofile__block">
        <h4 className="memberprofile__title">Licences &amp; insurance</h4>
        {credentials.length === 0 ? (
          <p className="memberprofile__none">None on file.</p>
        ) : (
          <ul className="memberprofile__list">
            {credentials.map((c) => {
              const expired = c.expires_on != null && c.expires_on < today;
              return (
                <li key={c.id}>
                  <span className="memberprofile__gear">
                    {c.label}
                    <span className="memberprofile__meta"> · {CREDENTIAL_LABEL[c.kind]}</span>
                  </span>
                  <span className="memberprofile__meta">
                    {c.reference ? `${c.reference} · ` : ''}
                    {c.expires_on ? (
                      <span className={expired ? 'memberprofile__expired' : undefined}>
                        {expired ? 'expired ' : 'valid to '}
                        {fmtDate(c.expires_on)}
                      </span>
                    ) : (
                      'no expiry'
                    )}
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
                          Document
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Invoicing: what a producer needs to pay them, in one place. */}
      <section className="memberprofile__block">
        <h4 className="memberprofile__title">Invoicing</h4>
        <div className="memberprofile__grid">
          <Fact label="Company" value={profile.company_name} />
          <Fact label="IBAN" value={profile.iban} copy />
          <Fact label="VAT" value={profile.vat_number} copy />
          <Fact label="CoC" value={profile.coc_number} copy />
        </div>
      </section>

      {docError && (
        <p className="auth__error" role="alert">
          {docError}
        </p>
      )}
    </div>
  );
}

function Fact({
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
    <div className="memberprofile__fact">
      <span className="memberprofile__label">{label}</span>
      {shown == null ? (
        <span className="memberprofile__missing">Not on file</span>
      ) : href ? (
        <a className="memberprofile__value" href={href}>
          {shown}
        </a>
      ) : copy ? (
        <button
          type="button"
          className="memberprofile__value memberprofile__value--copy"
          onClick={async () => {
            await navigator.clipboard.writeText(shown);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : shown}
        </button>
      ) : (
        <span className="memberprofile__value">{shown}</span>
      )}
    </div>
  );
}
