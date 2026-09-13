'use client';

import Link from 'next/link';
import { CURRENT_VERSION } from '@/lib/changelog';
import type { AppRole } from '@/lib/auth';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { avatarUrl } from '@/lib/use-profile';
import { ChevronIcon, ProfileIcon } from './Icons';

const ROLE_LABEL: Record<string, string> = {
  freelancer: 'Freelancer',
  staff: 'FEM staff',
  admin: 'Administrator',
  superadmin: 'Superadmin',
};

/** Who you are and how to leave, in one place. Sits at the foot of the rail on
    desktop and in the masthead on mobile — the two spots people already look. */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { profile, session, signOut, configured, realRole, viewAs, setViewAs } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const email = profile?.email ?? session?.user?.email ?? '';
  const name = profile?.full_name?.trim() || email.split('@')[0] || 'Account';
  const avatar = avatarUrl(profile?.avatar_path);
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '?';

  return (
    <div className={`account ${compact ? 'account--compact' : ''}`} ref={wrapper}>
      <button
        type="button"
        className="account__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="account__avatar" />
        ) : (
          <span className="account__avatar account__avatar--initials" aria-hidden>
            {initials}
          </span>
        )}

        {!compact && (
          <>
            <span className="account__who">
              <span className="account__name">{name}</span>
              <span className="account__role">
                {ROLE_LABEL[profile?.role ?? 'freelancer'] ?? 'Freelancer'}
              </span>
            </span>
            <span className="account__caret" aria-hidden>
              <ChevronIcon size={12} />
            </span>
          </>
        )}

        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div className="account__menu" role="menu">
          <div className="account__header">
            <p className="account__name">{name}</p>
            {email && <p className="account__email">{email}</p>}
          </div>

          <Link
            href="/profile"
            role="menuitem"
            className="account__item"
            onClick={() => setOpen(false)}
          >
            <ProfileIcon size={15} />
            Profile settings
          </Link>

          {/* Switching costs a sign-out otherwise, which is enough friction that
              nobody checks how a screen looks to their crew. */}
          {realRole === 'superadmin' && (
            <div className="account__viewas">
              <p className="account__viewas-label">View the portal as</p>
              {(['superadmin', 'staff', 'freelancer'] as AppRole[]).map((r) => {
                const on = r === 'superadmin' ? viewAs === null : viewAs === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    className={`account__item account__item--pick ${on ? 'is-on' : ''}`}
                    onClick={() => {
                      setViewAs(r === 'superadmin' ? null : r);
                      setOpen(false);
                    }}
                  >
                    {r === 'superadmin' ? 'Myself (Superadmin)' : ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Not in the rail: people read it once when something changed, not
              every day. Here it is findable without taking a place from the
              screens they actually work in. */}
          <Link
            href="/changelog"
            role="menuitem"
            className="account__item"
            onClick={() => setOpen(false)}
          >
            <span className="account__version">v{CURRENT_VERSION}</span>
            What&rsquo;s new
          </Link>

          {configured && (
            <button
              type="button"
              role="menuitem"
              className="account__item account__item--danger"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
