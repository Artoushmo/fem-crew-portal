'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  STAGES,
  STATUS_LABEL,
  formatFee,
  type Assignment,
} from '@/lib/assignments';
import { ChevronIcon } from './Icons';
import { StatusPill } from './StatusPill';

export function AssignmentList({ items }: { items: Assignment[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="list__empty">Nothing here yet.</p>;
  }

  return (
    <ul className="list">
      {items.map((a) => {
        const open = openId === a.id;
        const panelId = `panel-${a.id}`;

        return (
          <li key={a.id} className={`row ${open ? 'row--open' : ''}`}>
            <button
              type="button"
              className="row__summary"
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={`${a.title} — ${a.client}, ${a.dateLabel}`}
              onClick={() => setOpenId(open ? null : a.id)}
            >
              <span className="row__chevron" aria-hidden>
                <ChevronIcon size={14} />
              </span>

              <span className="row__main">
                <span className="row__title">{a.title}</span>
                <span className="row__client">{a.client}</span>
              </span>

              <span className="row__meta">
                <span className="row__date">{a.dateLabel}</span>
                <span className="row__role">{a.role}</span>
              </span>

              <span className="row__fee">{formatFee(a.fee)}</span>

              <StatusPill status={a.status} />
            </button>

            <div id={panelId} className="row__panel" hidden={!open}>
              <div className="row__progress">
                <div className="row__bar" aria-hidden>
                  <span style={{ width: `${(a.stage / (STAGES.length - 1)) * 100}%` }} />
                </div>
                <p className="row__stage">
                  Stage {a.stage + 1} of {STAGES.length} · {STAGES[a.stage].label}
                </p>
              </div>

              <dl className="row__facts">
                <div>
                  <dt>On site</dt>
                  <dd>
                    {a.onSite} · wrap {a.wrapped}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>
                    {a.venue}, {a.city}
                  </dd>
                </div>
                <div>
                  <dt>FEM contact</dt>
                  <dd>{a.contact.name}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{STATUS_LABEL[a.status]}</dd>
                </div>
              </dl>

              <p className="row__briefing">{a.briefing}</p>

              <div className="row__actions">
                <Link className="btn btn--primary" href={`/assignments/${a.id}`}>
                  {a.nextAction}
                </Link>
                <a
                  className="link-arrow"
                  href={a.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Maps →
                </a>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
