'use client';

import { useState } from 'react';
import { useAuth, type AppRole } from '@/lib/auth';
import { avatarUrl } from '@/lib/use-profile';
import { ROLES, ROLE_LABEL, ROLE_NOTE, useTeam, type Member } from '@/lib/use-team';
import { BrandLoader } from '../BrandLoader';
import { Masthead } from '../Masthead';
import { InviteForm } from './InviteForm';

export function TeamView() {
  const { profile } = useAuth();
  const { members, loading, error, canManage, invite, setRole, setAccess } = useTeam();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowNote, setRowNote] = useState<string | null>(null);

  const staff = members.filter((m) => m.role !== 'freelancer');
  const crew = members.filter((m) => m.role === 'freelancer');
  const activeCrew = crew.filter((m) => m.status === 'active');
  const activeStaff = staff.filter((m) => m.status === 'active');

  const change = async (id: string, role: AppRole) => {
    setBusyId(id);
    setRowError(null);
    setRowNote(null);
    try {
      await setRole(id, role);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not change that role.');
    } finally {
      setBusyId(null);
    }
  };

  const access = async (member: Member, action: 'revoke' | 'restore') => {
    setBusyId(member.id);
    setRowError(null);
    setRowNote(null);
    try {
      setRowNote(await setAccess(member.id, action));
    } catch (err) {
      setRowError(
        err instanceof Error
          ? err.message
          : action === 'revoke'
            ? 'Could not end their access.'
            : 'Could not restore their access.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Team</h1>
        <p className="hero__sub">
          {activeStaff.length} at FEM &middot; {activeCrew.length} crew
        </p>
      </Masthead>

      <main className="content content--wide">
        {error && (
          <p className="auth__error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <BrandLoader label="Loading the team" />
        ) : (
          <>
            {canManage && <InviteForm onInvite={invite} />}

            {rowError && (
              <p className="auth__error" role="alert">
                {rowError}
              </p>
            )}

            {rowNote && (
              <p className="state state--ok" role="status">
                {rowNote}
              </p>
            )}

            <p className="eyebrow eyebrow--spaced">Fast Elevate Media</p>
            <MemberList
              members={staff}
              canManage={canManage}
              selfId={profile?.id}
              busyId={busyId}
              onRole={change}
              onAccess={access}
              empty="No one at FEM yet."
            />

            <p className="eyebrow eyebrow--spaced">Crew</p>
            <MemberList
              members={crew}
              canManage={canManage}
              selfId={profile?.id}
              busyId={busyId}
              onRole={change}
              onAccess={access}
              empty="No freelancers yet. Invite one above."
            />
          </>
        )}
      </main>
    </>
  );
}

function MemberList({
  members,
  canManage,
  selfId,
  busyId,
  onRole,
  onAccess,
  empty,
}: {
  members: Member[];
  canManage: boolean;
  selfId?: string;
  busyId: string | null;
  onRole: (id: string, role: AppRole) => void;
  onAccess: (m: Member, action: 'revoke' | 'restore') => void;
  empty: string;
}) {
  // Ending someone's access is not undoable from their side, so it takes two
  // deliberate clicks rather than a dialog that gets dismissed by habit.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (members.length === 0) return <p className="state state--idle">{empty}</p>;

  return (
    <ul className="list">
      {members.map((m) => {
        const isSelf = m.id === selfId;
        const name = m.full_name?.trim() || m.email?.split('@')[0] || 'Unnamed';
        const avatar = avatarUrl(m.avatar_path);
        const revoked = m.status === 'revoked';
        const needsMfa = !revoked && m.role !== 'freelancer' && !m.mfa_enrolled;
        const confirming = confirmId === m.id;

        return (
          <li key={m.id} className={revoked ? 'row row--muted' : 'row'}>
            <div className="member">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="member__avatar" />
              ) : (
                <span className="member__avatar member__avatar--initials" aria-hidden>
                  {name.slice(0, 2).toUpperCase()}
                </span>
              )}

              <div className="member__who">
                <span className="member__name">
                  {name}
                  {isSelf && <span className="member__you">you</span>}
                </span>
                <span className="member__email">{m.email}</span>
              </div>

              <div className="member__state">
                {revoked ? (
                  <span className="tag tag--warn">Access ended</span>
                ) : (
                  <>
                    {!m.accepted && <span className="tag tag--wait">Not signed in yet</span>}
                    {needsMfa && <span className="tag tag--warn">No authenticator</span>}
                    {m.mfa_enrolled && <span className="tag tag--ok">2FA on</span>}
                  </>
                )}
              </div>

              <div className="member__controls">
                {canManage && !isSelf ? (
                  <>
                    <label className="sr-only" htmlFor={`role-${m.id}`}>
                      Role for {name}
                    </label>
                    <select
                      id={`role-${m.id}`}
                      className="field__input member__role"
                      value={m.role}
                      disabled={busyId === m.id || revoked}
                      onChange={(e) => onRole(m.id, e.target.value as AppRole)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>

                    {revoked ? (
                      <button
                        type="button"
                        className="link-arrow link-arrow--button"
                        disabled={busyId === m.id}
                        onClick={() => onAccess(m, 'restore')}
                      >
                        Restore access
                      </button>
                    ) : confirming ? (
                      <>
                        <button
                          type="button"
                          className="link-arrow link-arrow--button link-arrow--danger"
                          disabled={busyId === m.id}
                          onClick={() => {
                            setConfirmId(null);
                            onAccess(m, 'revoke');
                          }}
                        >
                          {busyId === m.id ? 'Ending...' : 'Yes, end it'}
                        </button>
                        <button
                          type="button"
                          className="link-arrow link-arrow--button"
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="link-arrow link-arrow--button link-arrow--danger"
                        disabled={busyId === m.id}
                        onClick={() => setConfirmId(m.id)}
                      >
                        End access
                      </button>
                    )}
                  </>
                ) : (
                  <span className="member__role-static">{ROLE_LABEL[m.role]}</span>
                )}
              </div>
            </div>

            {confirming && (
              <p className="member__warning">
                {name} will not be able to sign in again. Their assignments, invoices and
                history stay exactly as they are, and you can restore access later.
              </p>
            )}

            {revoked && m.revoked_at && (
              <p className="member__warning">
                Access ended on{' '}
                {new Date(m.revoked_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                .
              </p>
            )}

            {needsMfa && (
              <p className="member__warning">
                {ROLE_LABEL[m.role]} requires two-factor. Until they link an authenticator,
                the database refuses every read — they will see an empty portal.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export { ROLE_NOTE };
