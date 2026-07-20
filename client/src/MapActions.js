import { createContext } from 'react';

// Actions + view state shared with every custom node without threading props
// through the layout engine. Provided by App, consumed by MindNode.
export const MapActions = createContext({
  threshold: 10,
  isAdmin: false,
  hasVoted: () => false,
  onVote: () => {},
  onPropose: () => {},
  onCommit: () => {},
  onDismiss: () => {},
});
