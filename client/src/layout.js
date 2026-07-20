// Auto-layout the tree with dagre so the map always reads as a tidy mind map.
// Committed and proposed nodes are laid out together; the visual distinction
// (solid vs. dashed) is handled by the node component, not the layout.
import Dagre from '@dagrejs/dagre';

const NODE_W = 190;
const NODE_H = 64;

export function layoutTree(nodes, links = []) {
  // Multigraph so a distinctly-named extra-parent edge can coexist alongside
  // the primary tree edges without collision.
  const g = new Dagre.graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 90 });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const validLinks = links.filter((l) => byId.has(l.parentId) && byId.has(l.childId));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId)) g.setEdge(n.parentId, n.id);
  }
  // Extra parent links participate in layout so a shared child sits sensibly
  // relative to all its parents.
  for (const l of validLinks) g.setEdge(l.parentId, l.childId, {}, `link:${l.parentId}:${l.childId}`);
  Dagre.layout(g);

  const flowNodes = nodes.map((n) => {
    const pos = g.node(n.id);
    // Stored (x, y) from a manual drag wins; otherwise fall back to the
    // dagre-computed baseline so new nodes still land tidily.
    const hasManual = typeof n.x === 'number' && typeof n.y === 'number';
    return {
      id: n.id,
      type: 'mind',
      position: hasManual
        ? { x: n.x, y: n.y }
        : { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: n,
    };
  });

  const primaryEdges = nodes
    .filter((n) => n.parentId && byId.has(n.parentId))
    .map((n) => ({
      id: `${n.parentId}->${n.id}`,
      source: n.parentId,
      target: n.id,
      animated: n.status === 'proposed',
      data: { kind: 'primary' },
      style: {
        stroke: n.status === 'proposed' ? '#94a3b8' : '#cbd5e1',
        strokeDasharray: n.status === 'proposed' ? '6 4' : undefined,
        strokeWidth: 2,
      },
    }));

  // Extra parent edges: distinct purple so they read as added connections,
  // and removable (admin clicks them).
  const linkEdges = validLinks.map((l) => ({
    id: `link:${l.parentId}->${l.childId}`,
    source: l.parentId,
    target: l.childId,
    data: { kind: 'link', parentId: l.parentId, childId: l.childId },
    style: { stroke: '#8b5cf6', strokeWidth: 2 },
  }));

  return { flowNodes, flowEdges: [...primaryEdges, ...linkEdges] };
}
