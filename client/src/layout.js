// Auto-layout the tree with dagre so the map always reads as a tidy mind map.
// Committed and proposed nodes are laid out together; the visual distinction
// (solid vs. dashed) is handled by the node component, not the layout.
import Dagre from '@dagrejs/dagre';

const NODE_W = 190;
const NODE_H = 64;

export function layoutTree(nodes) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 90 });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId)) g.setEdge(n.parentId, n.id);
  }
  Dagre.layout(g);

  const flowNodes = nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: 'mind',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: n,
    };
  });

  const flowEdges = nodes
    .filter((n) => n.parentId && byId.has(n.parentId))
    .map((n) => ({
      id: `${n.parentId}->${n.id}`,
      source: n.parentId,
      target: n.id,
      animated: n.status === 'proposed',
      style: {
        stroke: n.status === 'proposed' ? '#94a3b8' : '#cbd5e1',
        strokeDasharray: n.status === 'proposed' ? '6 4' : undefined,
        strokeWidth: 2,
      },
    }));

  return { flowNodes, flowEdges };
}
