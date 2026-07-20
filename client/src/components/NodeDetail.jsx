import { useEffect, useState } from 'react';

// Detail panel for a single selected node: its name, alternative names, an
// editable description, and its child connections. Editing is admin-only.
export default function NodeDetail({ node, children, isAdmin, onSave, onSelectNode, onSwap, onClose }) {
  const [text, setText] = useState(node.text);
  const [aliases, setAliases] = useState((node.aliases || []).join(', '));
  const [description, setDescription] = useState(node.description || '');
  const [saving, setSaving] = useState(false);

  // Reset the form whenever a different node is selected.
  useEffect(() => {
    setText(node.text);
    setAliases((node.aliases || []).join(', '));
    setDescription(node.description || '');
  }, [node.id, node.text, node.description, node.aliases]);

  const dirty =
    text.trim() !== node.text ||
    description !== (node.description || '') ||
    aliases !== (node.aliases || []).join(', ');

  const save = async () => {
    setSaving(true);
    await onSave({
      text,
      description,
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
    });
    setSaving(false);
  };

  return (
    <aside className="detail">
      <div className="detail__top">
        <span className={`detail__status detail__status--${node.status}`}>{node.status}</span>
        <button className="detail__close" onClick={onClose} title="Close">×</button>
      </div>

      {isAdmin ? (
        <input className="detail__name" value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <h2 className="detail__name detail__name--ro">{node.text}</h2>
      )}

      <label className="detail__label">Also known as</label>
      {isAdmin ? (
        <input
          className="detail__input"
          placeholder="e.g. Make Ready, Turn"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
        />
      ) : (node.aliases || []).length ? (
        <div className="detail__aliases">
          {node.aliases.map((a) => (
            <span key={a} className="detail__alias">{a}</span>
          ))}
        </div>
      ) : (
        <p className="detail__empty">No alternative names.</p>
      )}

      <label className="detail__label">Definition</label>
      {isAdmin ? (
        <textarea
          className="detail__desc"
          placeholder="What does this term mean? Keep it to the shared standard."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
        />
      ) : node.description ? (
        <p className="detail__descro">{node.description}</p>
      ) : (
        <p className="detail__empty">No definition yet.</p>
      )}

      {isAdmin && dirty && (
        <button className="primarybtn detail__save" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      )}

      <label className="detail__label">
        Connections {children.length > 0 && <span className="detail__count">{children.length}</span>}
      </label>
      {children.length ? (
        <ul className="detail__children">
          {children.map((c) => (
            <li key={c.id} className="detail__childrow">
              <button className="detail__child" onClick={() => onSelectNode(c.id)}>
                <span
                  className="detail__dot"
                  style={{ background: c.status === 'proposed' ? '#94a3b8' : c.color }}
                />
                <span className="detail__childname">{c.text}</span>
                {c.via === 'link' && <span className="detail__viatag">linked</span>}
              </button>
              {isAdmin && (
                <button
                  className="detail__swap"
                  title={`Swap direction: make ${c.text} the parent of ${node.text}`}
                  onClick={() => onSwap(c.id)}
                >
                  ⇄
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="detail__empty">No child connections.</p>
      )}
    </aside>
  );
}
