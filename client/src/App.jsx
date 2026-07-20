import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { api, getAdminKey, setAdminKey } from './api.js';
import { layoutTree } from './layout.js';
import { MapActions } from './MapActions.js';
import MindNode from './components/MindNode.jsx';
import ActivityFeed from './components/ActivityFeed.jsx';

const nodeTypes = { mind: MindNode };
const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
const VOTED_KEY = 'mindmap.voted';

function loadVoted() {
  try {
    return new Set(JSON.parse(localStorage.getItem(VOTED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export default function App() {
  const [map, setMap] = useState(null);
  const [threshold, setThreshold] = useState(10);
  const [isAdmin, setIsAdmin] = useState(Boolean(getAdminKey()));
  const [proposeParent, setProposeParent] = useState(null);
  const [banner, setBanner] = useState(null);
  const votedRef = useRef(loadVoted());
  const wsRef = useRef(null);

  const mapIdRef = useRef(null);

  const loadMap = useCallback(async (id) => {
    const fresh = await api.getMap(id);
    setMap(fresh);
  }, []);

  // Boot: resolve which map to show (URL path or the default master map),
  // load config + map, and open the live WebSocket channel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await api.config();
      if (!cancelled) setThreshold(cfg.threshold);

      const pathMatch = window.location.pathname.match(/^\/map\/([\w-]+)/);
      let id = pathMatch?.[1];
      if (!id) {
        const def = await api.defaultMap();
        id = def.id;
        window.history.replaceState(null, '', `/map/${id}`);
      }
      mapIdRef.current = id;
      await loadMap(id);

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws?mapId=${id}`);
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'map:update') setMap(msg.map);
      };
      wsRef.current = ws;

      // Verify a previously stored admin key still works.
      if (getAdminKey()) {
        fetch('/api/admin/check', { headers: { 'x-admin-key': getAdminKey() } })
          .then((r) => setIsAdmin(r.ok))
          .catch(() => setIsAdmin(false));
      }
    })();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [loadMap]);

  const flash = (text) => {
    setBanner(text);
    setTimeout(() => setBanner(null), 2600);
  };

  const hasVoted = useCallback((id) => votedRef.current.has(id), []);

  const onVote = useCallback(
    async (nodeId) => {
      try {
        const { committed } = await api.vote(nodeId);
        votedRef.current.add(nodeId);
        localStorage.setItem(VOTED_KEY, JSON.stringify([...votedRef.current]));
        if (committed) flash('Reached threshold — committed to the master map.');
        await loadMap(mapIdRef.current);
      } catch (e) {
        flash(`Could not vote: ${e.message}`);
      }
    },
    [loadMap]
  );

  const onCommit = useCallback(
    async (nodeId) => {
      try {
        await api.adminCommit(nodeId);
        flash('Committed by admin.');
        await loadMap(mapIdRef.current);
      } catch (e) {
        flash(`Commit failed: ${e.message}`);
      }
    },
    [loadMap]
  );

  const onDismiss = useCallback(
    async (nodeId) => {
      try {
        await api.adminDismiss(nodeId);
        flash('Proposal dismissed.');
        await loadMap(mapIdRef.current);
      } catch (e) {
        flash(`Dismiss failed: ${e.message}`);
      }
    },
    [loadMap]
  );

  const submitProposal = useCallback(
    async (text, color) => {
      const parentId = proposeParent;
      setProposeParent(null);
      if (!text?.trim()) return;
      try {
        await api.propose(mapIdRef.current, { parentId, text, color });
        flash('Proposal added. Collect upvotes to merge it.');
        await loadMap(mapIdRef.current);
      } catch (e) {
        flash(`Could not propose: ${e.message}`);
      }
    },
    [proposeParent, loadMap]
  );

  const unlockAdmin = async () => {
    const key = window.prompt('Enter admin key');
    if (!key) return;
    try {
      await api.unlockAdmin(key);
      setIsAdmin(true);
      flash('Admin unlocked.');
    } catch {
      flash('Invalid admin key.');
    }
  };

  const logoutAdmin = () => {
    setAdminKey('');
    setIsAdmin(false);
    flash('Admin locked.');
  };

  const { flowNodes, flowEdges } = useMemo(
    () => (map ? layoutTree(map.nodes) : { flowNodes: [], flowEdges: [] }),
    [map]
  );

  const actions = useMemo(
    () => ({ threshold, isAdmin, hasVoted, onVote, onPropose: setProposeParent, onCommit, onDismiss }),
    [threshold, isAdmin, hasVoted, onVote, onCommit, onDismiss]
  );

  const counts = useMemo(() => {
    const committed = map?.nodes.filter((n) => n.status === 'committed').length || 0;
    const proposed = map?.nodes.filter((n) => n.status === 'proposed').length || 0;
    return { committed, proposed };
  }, [map]);

  return (
    <MapActions.Provider value={actions}>
      <div className="app">
        <header className="topbar">
          <div className="topbar__left">
            <span className="logo">◇ MindMerge</span>
            <span className="submeta">
              {counts.committed} committed · {counts.proposed} proposed · merge at {threshold} ▲
            </span>
          </div>
          <div className="topbar__right">
            <button className="ghostbtn" onClick={() => navigator.clipboard?.writeText(window.location.href).then(() => flash('Link copied.'))}>
              Share link
            </button>
            {isAdmin ? (
              <button className="ghostbtn ghostbtn--admin" onClick={logoutAdmin}>
                Admin ✓
              </button>
            ) : (
              <button className="ghostbtn" onClick={unlockAdmin}>
                Unlock admin
              </button>
            )}
          </div>
        </header>

        {banner && <div className="banner">{banner}</div>}

        <div className="body">
          <div className="canvas">
            <ReactFlowProvider>
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
                minZoom={0.2}
              >
                <Background gap={22} color="#e2e8f0" />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeColor={(n) => (n.data.status === 'proposed' ? '#cbd5e1' : n.data.color)} />
              </ReactFlow>
            </ReactFlowProvider>
          </div>
          <ActivityFeed activity={map?.activity} />
        </div>

        {proposeParent && (
          <ProposeDialog onCancel={() => setProposeParent(null)} onSubmit={submitProposal} />
        )}
      </div>
    </MapActions.Provider>
  );
}

function ProposeDialog({ onCancel, onSubmit }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Propose a new node</h3>
        <p className="dialog__hint">It joins as a pending proposal. Once it hits the vote threshold (or an admin commits it), it merges into the master map.</p>
        <input
          autoFocus
          className="dialog__input"
          placeholder="Node text…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit(text, color)}
        />
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${c === color ? 'swatch--on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="dialog__actions">
          <button className="ghostbtn" onClick={onCancel}>Cancel</button>
          <button className="primarybtn" onClick={() => onSubmit(text, color)}>Add proposal</button>
        </div>
      </div>
    </div>
  );
}
