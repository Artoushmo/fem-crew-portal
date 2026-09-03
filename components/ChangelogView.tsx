'use client';

import { useState } from 'react';
import { RELEASES } from '@/lib/changelog';
import { useAuth } from '@/lib/auth';
import { Masthead } from './Masthead';

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** What changed, per release.
 *
 * Filtered by who it was for, because a freelancer reading about the client
 * book learns nothing except that the portal is bigger than their part of it.
 * The filter defaults to their own side and can be turned off. */
export function ChangelogView() {
  const { profile } = useAuth();
  const isStaff = profile ? profile.role !== 'freelancer' : false;
  const [mine, setMine] = useState(true);

  const side = isStaff ? 'fem' : 'crew';

  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">What&rsquo;s new</h1>
        <p className="hero__sub">Every change to the portal, newest first.</p>
      </Masthead>

      <main className="content content--wide">
        <div className="toolbar">
          <div className="segmented segmented--inline" role="tablist" aria-label="Which changes">
            <button
              type="button"
              role="tab"
              aria-selected={mine}
              className={`segmented__item ${mine ? 'is-on' : ''}`}
              onClick={() => setMine(true)}
            >
              For you
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!mine}
              className={`segmented__item ${!mine ? 'is-on' : ''}`}
              onClick={() => setMine(false)}
            >
              Everything
            </button>
          </div>
        </div>

        {RELEASES.map((release, i) => {
          const changes = mine
            ? release.changes.filter((c) => !c.who || c.who === side)
            : release.changes;

          if (changes.length === 0) return null;

          return (
            <section key={release.version} className="release">
              <div className="release__head">
                <h2 className="release__version">
                  Version {release.version}
                  {i === 0 && <span className="tag tag--ok">Live now</span>}
                </h2>
                <p className="release__date">{dateLabel(release.date)}</p>
              </div>

              <p className="release__summary">{release.summary}</p>

              <ul className="release__list">
                {changes.map((c) => (
                  <li key={c.title} className="release__item">
                    <p className="release__title">
                      {c.title}
                      {!mine && c.who && (
                        <span className="release__who">{c.who === 'fem' ? 'FEM' : 'Crew'}</span>
                      )}
                    </p>
                    <p className="release__body">{c.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>
    </>
  );
}
