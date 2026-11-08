'use client';

import { requireSupabase } from './supabase';

/** The briefing as a PDF, fetched from the function that also attaches it to
    the booking mail. Same file either way, so what somebody downloads on the
    day is what they were sent.

    Only the database knows the real role ids; the sample assignments on the
    static build have none, and the button stays away from them. */
export function hasBriefingFile(roleId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roleId);
}

export async function openBriefing(roleId: string): Promise<void> {
  const { data, error } = await requireSupabase().functions.invoke('invite-member', {
    body: { action: 'briefing', role_id: roleId },
  });

  if (error) throw new Error(error.message);
  if (!(data instanceof Blob)) {
    // The function answers JSON when it refuses; that is the message to show.
    const msg = (data as { error?: string } | null)?.error;
    throw new Error(msg ?? 'Could not build the briefing.');
  }

  const url = URL.createObjectURL(data);
  // Opened rather than downloaded: on a phone that is the PDF viewer, and
  // sharing or saving from there is one tap.
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    // Popup blocked. Fall back to a navigation in this tab.
    window.location.href = url;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
