// Commit log — the GitHub-style history that makes merges feel like commits.
function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ActivityFeed({ activity, isAdmin, onRevert }) {
  return (
    <aside className="feed">
      <h2 className="feed__title">Commit log</h2>
      {(!activity || activity.length === 0) && (
        <p className="feed__empty">No commits yet. Proposals land here when they merge.</p>
      )}
      <ul className="feed__list">
        {activity?.map((a) => (
          <li key={a.id} className="feed__item">
            <span className={`feed__dot ${a.kind === 'edit' ? 'feed__dot--edit' : ''}`} />
            <div className="feed__body">
              <strong>{a.text}</strong>
              <div className="feed__meta">
                {a.kind === 'edit' ? a.summary : `under ${a.parentText}`} · {timeAgo(a.at ?? a.committedAt)}
              </div>
            </div>
            {isAdmin && a.kind === 'edit' && a.eventId && (
              <button className="feed__revert" title="Revert this edit" onClick={() => onRevert(a.eventId)}>
                ↺
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
