'use client';

import { useEffect, useRef, useState } from 'react';
import { requireSupabase } from '@/lib/supabase';
import { avatarUrl } from '@/lib/use-profile';
import type { ProfileRow } from '@/lib/profile-types';
import { Field, SectionForm } from './SectionForm';

const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

export function PersonalSection({
  profile,
  onSaved,
}: {
  profile: ProfileRow | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    base_city: '',
    country: 'NL',
    bio: '',
  });
  const [initial, setInitial] = useState(form);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    const next = {
      full_name: profile.full_name ?? '',
      phone: profile.phone ?? '',
      base_city: profile.base_city ?? '',
      country: profile.country ?? 'NL',
      bio: profile.bio ?? '',
    };
    setForm(next);
    setInitial(next);
    setAvatar(avatarUrl(profile.avatar_path));
  }, [profile]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    const { error } = await requireSupabase()
      .from('profiles')
      .update({
        full_name: form.full_name.trim() || null,
        phone: form.phone.trim() || null,
        base_city: form.base_city.trim() || null,
        country: form.country.trim() || 'NL',
        bio: form.bio.trim() || null,
      })
      .eq('id', profile!.id);

    if (error) throw new Error(error.message);
    setInitial(form);
    onSaved();
  };

  const pickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setAvatarError(null);

    if (!file.type.startsWith('image/')) {
      setAvatarError('Pick an image file.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('That image is over 4 MB. Try a smaller one.');
      return;
    }

    setUploading(true);
    try {
      const client = requireSupabase();
      // Storage policy only allows writing into a folder named after your own
      // user id, so the path is not decoration.
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;

      // No upsert: the timestamped path is always new, and upsert would send a
      // PUT that needs an update policy on top of the insert one.
      const { error: uploadError } = await client.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const { error: updateError } = await client
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', profile.id);
      if (updateError) throw updateError;

      setAvatar(avatarUrl(path));
      onSaved();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (filePicker.current) filePicker.current.value = '';
    }
  };

  const initials =
    (form.full_name || profile?.email || '?')
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '?';

  return (
    <>
      <section className="panel">
        <h2 className="panel__title">Photo</h2>
        <p className="panel__hint">
          Producers use this to find you on a busy set. A clear headshot works best.
        </p>

        <div className="avatar-row">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="avatar-row__image" />
          ) : (
            <span className="avatar-row__placeholder" aria-hidden>
              {initials}
            </span>
          )}

          <div className="avatar-row__actions">
            <input
              ref={filePicker}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={pickAvatar}
            />
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => filePicker.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : avatar ? 'Replace photo' : 'Upload photo'}
            </button>
            <p className="field__hint">JPG or PNG, up to 4 MB.</p>
          </div>
        </div>

        {avatarError && (
          <p className="auth__error" role="alert">
            {avatarError}
          </p>
        )}
      </section>

      <SectionForm
        title="Details"
        onSave={save}
        dirty={dirty}
        onReset={() => setForm(initial)}
      >
        <div className="grid-2">
          <Field label="Full name">
            <input
              className="field__input"
              value={form.full_name}
              onChange={set('full_name')}
              autoComplete="name"
            />
          </Field>

          <Field label="Phone" hint="Reachable on a shoot day.">
            <input
              className="field__input"
              value={form.phone}
              onChange={set('phone')}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+31 6 12 34 56 78"
            />
          </Field>

          <Field label="Based in">
            <input
              className="field__input"
              value={form.base_city}
              onChange={set('base_city')}
              placeholder="Amsterdam"
              autoComplete="address-level2"
            />
          </Field>

          <Field label="Country">
            <input
              className="field__input"
              value={form.country}
              onChange={set('country')}
              maxLength={2}
              placeholder="NL"
              autoComplete="country"
            />
          </Field>
        </div>

        <Field label="Short intro" hint="A line or two. Producers read this when booking.">
          <textarea
            className="field__input field__input--area"
            value={form.bio}
            onChange={set('bio')}
            rows={3}
            maxLength={400}
          />
        </Field>

        <p className="field__hint">
          Email is {profile?.email} — changing it means changing how you sign in, so
          ask your FEM producer.
        </p>
      </SectionForm>
    </>
  );
}
