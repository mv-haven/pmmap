import { memo, useContext } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MapActions } from '../MapActions.js';

// A single mind-map node. Committed nodes are solid and can spawn proposals.
// Proposed nodes are dashed and show a vote tally + (for admins) merge/dismiss.
function MindNode({ data }) {
  const actions = useContext(MapActions);
  const { threshold, isAdmin, hasVoted } = actions;
  const proposed = data.status === 'proposed';
  const voted = hasVoted(data.id);

  return (
    <div
      className={`node ${proposed ? 'node--proposed' : 'node--committed'}`}
      style={proposed ? undefined : { '--accent': data.color }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="node__text">{data.text}</div>

      {proposed ? (
        <div className="node__proposal">
          <button
            className={`vote nodrag ${voted ? 'vote--done' : ''}`}
            onClick={() => actions.onVote(data.id)}
            disabled={voted}
            title={voted ? 'You already upvoted this' : 'Upvote to help it merge'}
          >
            ▲ {data.upvotes}/{threshold}
          </button>
          {isAdmin && (
            <span className="node__admin">
              <button className="mini mini--commit nodrag" onClick={() => actions.onCommit(data.id)}>
                Commit
              </button>
              <button className="mini mini--dismiss nodrag" onClick={() => actions.onDismiss(data.id)}>
                Dismiss
              </button>
            </span>
          )}
        </div>
      ) : (
        <button className="node__add nodrag" onClick={() => actions.onPropose(data.id)}>
          + propose
        </button>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default memo(MindNode);
