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

  const links = () =>
    calendarLinks(assignment, `${window.location.origin}/assignments/${assignment.id}`);

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
        Add to Calendar
      </button>

      {open && (
        <div className={`calendar__menu ${onDark ? 'calendar__menu--below' : ''}`} role="menu">
          <button
            type="button"
            role="menuitem"
            className="calendar__item"
            onClick={() => {
              window.open(links().google, '_blank', 'noopener');
              setOpen(false);
            }}
          >
            Google Calendar
          </button>
          <button type="button" role="menuitem" className="calendar__item" onClick={downloadIcs}>
            Apple Calendar
          </button>
          <button
            type="button"
            role="menuitem"
            className="calendar__item"
            onClick={() => {
              window.open(links().outlook, '_blank', 'noopener');
              setOpen(false);
            }}
          >
            Outlook
          </button>
        </div>
      )}
    </div>
  );
}
