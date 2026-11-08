'use client';

import { useEffect, useRef, useState } from 'react';
import { calendarLinks, type Assignment } from '@/lib/assignments';

export function AddToCalendar({
  assignment,
  onDark = false,
}: {
  assignment: Assignment;
  onDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const links = (day = 0) =>
    calendarLinks(assignment, `${window.location.origin}/assignments/${assignment.id}`, day);

  // Google and Outlook take one event per link. With several days the menu
  // offers each; the .ics carries them all at once.
  const dayCount = Math.max(1, assignment.days.length);
  const dayLabel = (i: number) => (dayCount > 1 ? ` \u00b7 ${assignment.days[i].label}` : '');

  const downloadIcs = () => {
    const { ics, filename } = links();
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <div className="calendar" ref={wrapper}>
      <button
        type="button"
        className={`btn ${onDark ? 'btn--outline-dark' : 'btn--outline'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Add to calendar
      </button>

      {open && (
        <div className={`calendar__menu ${onDark ? 'calendar__menu--below' : ''}`} role="menu">
          {Array.from({ length: dayCount }, (_, i) => (
            <button
              key={`g${i}`}
              type="button"
              role="menuitem"
              className="calendar__item"
              onClick={() => {
                window.open(links(i).google, '_blank', 'noopener');
                setOpen(false);
              }}
            >
              Google Calendar{dayLabel(i)}
            </button>
          ))}
          <button type="button" role="menuitem" className="calendar__item" onClick={downloadIcs}>
            Apple Calendar{dayCount > 1 ? ' \u00b7 all days' : ''}
          </button>
          {Array.from({ length: dayCount }, (_, i) => (
            <button
              key={`o${i}`}
              type="button"
              role="menuitem"
              className="calendar__item"
              onClick={() => {
                window.open(links(i).outlook, '_blank', 'noopener');
                setOpen(false);
              }}
            >
              Outlook{dayLabel(i)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
