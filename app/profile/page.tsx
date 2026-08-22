import { Masthead } from '@/components/Masthead';
import { agreement, freelancer } from '@/lib/assignments';

export default function ProfilePage() {
  return (
    <>
      <Masthead>
        <h1 className="hero__greeting">Profile</h1>
        <p className="hero__sub">{freelancer.name}</p>
      </Masthead>

      <main className="content">
        <p className="eyebrow">Your details</p>

        <dl className="detail-list">
          <div>
            <dt>Name</dt>
            <dd>{freelancer.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${freelancer.email}`}>{freelancer.email}</a>
            </dd>
          </div>
          <div>
            <dt>Primary role</dt>
            <dd>{freelancer.role}</dd>
          </div>
          <div>
            <dt>Agreement</dt>
            <dd>
              {agreement.year} — {agreement.signed ? 'signed' : 'not signed'}
            </dd>
          </div>
        </dl>
      </main>
    </>
  );
}
