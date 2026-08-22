'use client';

import { useEffect, useState } from 'react';
import { countdownLabel } from '@/lib/assignments';

/** Renders nothing until mounted. The pages are statically prerendered, so a
    countdown computed on the server would be frozen at build time — and rendering
    it during hydration would mismatch. */
export function Countdown({ startsAt }: { startsAt: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => setLabel(countdownLabel(startsAt)), [startsAt]);

  if (!label) return null;
  return <span className="countdown">{label}</span>;
}
