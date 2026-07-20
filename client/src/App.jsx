import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
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
// Sentinel used as the "parent" when proposing an unconnected (island) node.
const ROOT_SENTINEL = '__root__';

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
  const [reorg, setReorg] = useState(null); // { ids: [...], label } of nodes being moved
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null); // { ids, label, isBulk }
  const [banner, setBanner] = useState(null);
  const votedRef = useRef(loadVoted());
  const wsRef = useRef(null);
  const draggingRef = useRef(false);

  const mapIdRef = useRef(null);

  // React Flow owns node positions locally so drags feel instant; the map is
  // still the source of truth and re-seeds these whenever it changes.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);

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

  const clearSelection = useCallback(() => {
    setRfNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setSelectedIds([]);
  }, [setRfNodes]);

  // Delete is destructive and cascades, so it always routes through a confirm.
  const onDelete = useCallback((nodeId, text) => {
    setConfirmDelete({ ids: [nodeId], label: `“${text}”`, isBulk: false });
  }, []);

  const performDelete = useCallback(async () => {
    const target = confirmDelete;
    setConfirmDelete(null);
    if (!target) return;
    try {
      const { deleted } = await api.bulkDelete(target.ids);
      flash(`Deleted ${deleted} node${deleted === 1 ? '' : 's'} and everything under.`);
      if (target.isBulk) clearSelection();
      await loadMap(mapIdRef.current);
    } catch (e) {
      flash(`Delete failed: ${e.message}`);
    }
  }, [confirmDelete, loadMap, clearSelection]);

  const onSelectionChange = useCallback(({ nodes }) => {
    setSelectedIds(nodes.map((n) => n.id));
  }, []);

  // Re-org: "Move" arms one or many nodes, then the next node/canvas click
  // reparents the whole set. Single and bulk moves share this one path.
  const onStartReorg = useCallback((ids, label) => {
    setReorg({ ids, label });
  }, []);

  const applyReparent = useCallback(
    async (newParentId) => {
      const moving = reorg;
      setReorg(null);
      if (!moving) return;
      const ids = moving.ids.filter((id) => id !== newParentId); // never onto self
      if (!ids.length) return;
      try {
        const { moved, failed } = await api.bulkReparent(ids, newParentId);
        const skipped = failed?.length ? `, ${failed.length} skipped` : '';
        const plural = moved === 1 ? '' : 's';
        flash(
          newParentId
            ? `Moved ${moved} node${plural} under new parent${skipped}.`
            : `Detached ${moved} node${plural} to a root${skipped}.`
        );
        clearSelection();
        await loadMap(mapIdRef.current);
      } catch (e) {
        flash(`Move failed: ${e.message}`);
      }
    },
    [reorg, loadMap, clearSelection]
  );

  const onBulkMove = useCallback(() => {
    setReorg({ ids: selectedIds, label: `${selectedIds.length} nodes` });
  }, [selectedIds]);

  const onBulkDelete = useCallback(() => {
    setConfirmDelete({ ids: selectedIds, label: `${selectedIds.length} nodes`, isBulk: true });
  }, [selectedIds]);

  // Esc cancels an in-progress move.
  useEffect(() => {
    if (!reorg) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setReorg(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reorg]);

  const submitProposal = useCallback(
    async (text, color) => {
      const raw = proposeParent;
      setProposeParent(null);
      if (!text?.trim()) return;
      const parentId = raw === ROOT_SENTINEL ? null : raw;
      try {
        const result = await api.propose(mapIdRef.current, { parentId, text, color });
        if (result.merged) {
          // The dup was folded into a vote/commit on the existing proposal.
          votedRef.current.add(result.node.id);
          localStorage.setItem(VOTED_KEY, JSON.stringify([...votedRef.current]));
          flash(
            result.committed
              ? 'That was already proposed — it is now committed.'
              : 'Already proposed — added your upvote to the existing one.'
          );
        } else if (result.committed) {
          flash('Node added to the master map.');
        } else {
          flash('Proposal added. Collect upvotes to merge it.');
        }
        await loadMap(mapIdRef.current);
      } catch (e) {
        const msg =
          e.message === 'duplicate-committed'
            ? 'That already exists in the master map.'
            : `Could not propose: ${e.message}`;
        flash(msg);
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

  const flowEdges = useMemo(
    () => (map ? layoutTree(map.nodes, map.links).flowEdges : []),
    [map]
  );

  // Re-seed positions from the map on every change — except mid-drag, so an
  // incoming live update never yanks the node out from under the cursor.
  useEffect(() => {
    if (!map || draggingRef.current) return;
    setRfNodes(layoutTree(map.nodes, map.links).flowNodes);
  }, [map, setRfNodes]);

  // Dragging from one node's handle to another (admin) adds an extra parent
  // edge: source becomes an additional parent of target.
  const onConnect = useCallback(
    async ({ source, target }) => {
      if (!source || !target) return;
      try {
        await api.addParent(target, source);
        flash('Added a parent connection.');
        await loadMap(mapIdRef.current);
      } catch (e) {
        const msg = {
          'would-create-cycle': "Can't connect — that would create a loop.",
          'already-a-parent': 'Those nodes are already connected.',
          'both-must-be-committed': 'Both nodes must be committed to connect.',
          'cannot-parent-to-self': "Can't connect a node to itself.",
        };
        flash(msg[e.message] || `Could not connect: ${e.message}`);
      }
    },
    [loadMap]
  );

  // Clicking an extra (purple) link edge removes that parent connection.
  const onEdgeClick = useCallback(
    async (_evt, edge) => {
      if (!isAdmin || edge.data?.kind !== 'link') return;
      try {
        await api.removeParent(edge.data.childId, edge.data.parentId);
        flash('Removed the parent connection.');
        await loadMap(mapIdRef.current);
      } catch (e) {
        flash(`Could not remove: ${e.message}`);
      }
    },
    [isAdmin, loadMap]
  );

  const onNodeDragStart = useCallback(() => {
    draggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(async (_evt, node) => {
    draggingRef.current = false;
    try {
      await api.moveNode(node.id, { x: node.position.x, y: node.position.y });
    } catch (e) {
      flash(`Could not move node: ${e.message}`);
    }
  }, []);

  const actions = useMemo(
    () => ({
      threshold,
      isAdmin,
      hasVoted,
      onVote,
      onPropose: setProposeParent,
      onCommit,
      onDismiss,
      onDelete,
      onStartReorg,
      reorgIds: reorg?.ids || [],
    }),
    [threshold, isAdmin, hasVoted, onVote, onCommit, onDismiss, onDelete, onStartReorg, reorg]
  );

  const counts = useMemo(() => {
    const committed = map?.nodes.filter((n) => n.status === 'committed').length || 0;
    const proposed = map?.nodes.filter((n) => n.status === 'proposed').length || 0;
    return { committed, proposed };
  }, [map]);

  // How many nodes a pending delete would actually remove — DAG-aware, mirroring
  // the server: a child is only removed when ALL its parents (primary + extra
  // links) are in the delete set. A shared child with another parent survives.
  const deleteImpact = useMemo(() => {
    if (!confirmDelete || !map) return 0;
    const parentsOf = (id) => {
      const prim = map.nodes.find((n) => n.id === id)?.parentId;
      const extra = (map.links || []).filter((l) => l.childId === id).map((l) => l.parentId);
      return [...(prim ? [prim] : []), ...extra];
    };
    const del = new Set(confirmDelete.ids);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of map.nodes) {
        if (del.has(n.id)) continue;
        const ps = parentsOf(n.id);
        if (ps.length > 0 && ps.every((p) => del.has(p))) {
          del.add(n.id);
          changed = true;
        }
      }
    }
    return del.size;
  }, [confirmDelete, map]);

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
            <button className="primarybtn" onClick={() => setProposeParent(ROOT_SENTINEL)}>
              + New node
            </button>
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

        {reorg && (
          <div className="banner banner--reorg">
            Moving {reorg.label} — click a node to make it the new parent, or click
            empty canvas to detach to a root. (Esc to cancel)
          </div>
        )}

        <div className="body">
          <div className="canvas">
            <ReactFlowProvider>
              <ReactFlow
                nodes={rfNodes}
                edges={flowEdges}
                onNodesChange={onNodesChange}
                onNodeDragStart={onNodeDragStart}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={reorg ? (_e, node) => applyReparent(node.id) : undefined}
                onPaneClick={reorg ? () => applyReparent(null) : undefined}
                onSelectionChange={onSelectionChange}
                onConnect={isAdmin ? onConnect : undefined}
                onEdgeClick={onEdgeClick}
                nodesConnectable={isAdmin}
                panOnDrag
                selectionOnDrag={false}
                selectionKeyCode="Shift"
                multiSelectionKeyCode={['Meta', 'Control']}
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

          {isAdmin && selectedIds.length >= 2 && !reorg && (
            <div className="bulkbar">
              <span className="bulkbar__count">{selectedIds.length} selected</span>
              <button className="primarybtn" onClick={onBulkMove}>
                Move
              </button>
              <button className="ghostbtn ghostbtn--danger" onClick={onBulkDelete}>
                Delete
              </button>
              <button className="ghostbtn" onClick={clearSelection}>
                Clear
              </button>
            </div>
          )}
        </div>

        {proposeParent && (
          <ProposeDialog
            isRoot={proposeParent === ROOT_SENTINEL}
            isAdmin={isAdmin}
            onCancel={() => setProposeParent(null)}
            onSubmit={submitProposal}
          />
        )}

        {confirmDelete && (
          <ConfirmDialog
            title={
              confirmDelete.isBulk
                ? `Delete ${confirmDelete.ids.length} selected nodes?`
                : `Delete ${confirmDelete.label}?`
            }
            message={
              deleteImpact > confirmDelete.ids.length
                ? `This removes ${deleteImpact} nodes in total — the ${
                    confirmDelete.isBulk ? 'selection' : 'node'
                  } plus everything nested underneath. This can't be undone.`
                : `This removes ${deleteImpact} node${
                    deleteImpact === 1 ? '' : 's'
                  }. This can't be undone.`
            }
            confirmLabel="Delete"
            onCancel={() => setConfirmDelete(null)}
            onConfirm={performDelete}
          />
        )}
      </div>
    </MapActions.Provider>
  );
}

function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }) {
  // Esc cancels. Deliberately no Enter-to-confirm — too easy to fire by accident
  // on a destructive action.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="dialog__hint">{message}</p>
        <div className="dialog__actions">
          <button className="ghostbtn" onClick={onCancel}>
            Cancel
          </button>
          <button className="dangerbtn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProposeDialog({ isRoot, isAdmin, onCancel, onSubmit }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const title = isAdmin
    ? isRoot
      ? 'New root node'
      : 'New node'
    : isRoot
      ? 'New unconnected node'
      : 'Propose a new node';
  const hint = isAdmin
    ? 'As admin, this is added straight to the master map — no proposal or votes needed.'
    : isRoot
      ? 'Starts as a free-floating proposal with no parent. It merges into the master map as its own island once it hits the vote threshold (or an admin commits it).'
      : 'It joins as a pending proposal. Once it hits the vote threshold (or an admin commits it), it merges into the master map.';
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="dialog__hint">{hint}</p>
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
          <button className="primarybtn" onClick={() => onSubmit(text, color)}>
            {isAdmin ? 'Add node' : 'Add proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}
