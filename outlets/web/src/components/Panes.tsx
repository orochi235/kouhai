import { type ReactNode, useEffect, useRef } from 'react';
import {
  asNodeId,
  createNode,
  type LayoutStrategy,
  type NodeId,
  Store,
  stripStrategy,
} from 'windease';
import { type ChromeMap, Container, Provider, StrategyRegistryProvider } from 'windease/react';
import 'windease/styles.css';
import './Panes.css';

const KIND = 'pane';
const STRATEGIES = { strip: stripStrategy as unknown as LayoutStrategy<unknown> };
const STRIP = { axis: 'x', resizeMode: 'neighbor', fill: true };
/** Each pane's share of the width as last dragged, by pane id; per browser. */
const SHARES_KEY = 'dixeram.paneShares.v1';
const ZONE = asNodeId('dixeram-panes');
const idOf = (id: string): NodeId => asNodeId(`dixeram-pane-${id}`);

export type Pane = {
  id: string;
  node: ReactNode;
  /** Share of the width before it is dragged; unset on the one pane that takes what the others leave. */
  share?: number;
  /** The least it shrinks to, in px. */
  min: number;
};

function readShares(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SHARES_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function writeShares(s: Record<string, number>) {
  try {
    localStorage.setItem(SHARES_KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: widths last this visit.
  }
}

const shareOf = (store: Store, id: NodeId): number | undefined => {
  const share = (store.getNode(id)?.membership?.placement as { share?: unknown } | undefined)
    ?.share;
  const w = typeof share === 'number' ? share : (share as { w?: unknown } | undefined)?.w;
  return typeof w === 'number' ? w : undefined;
};

/** The page's columns side by side; dragging the seam between two trades width between them. */
export function Panes({ panes }: { panes: readonly Pane[] }) {
  const storeRef = useRef<Store | null>(null);
  const filler = panes.find((p) => p.share === undefined)?.id;
  if (!storeRef.current) {
    const stored = readShares();
    const store = new Store();
    store.registerNode(
      createNode({ kind: 'panes', id: ZONE, container: { strategyId: 'strip', config: STRIP } }),
    );
    for (const p of panes) {
      const id = idOf(p.id);
      store.registerNode(
        createNode({ kind: KIND, id, parentId: ZONE, hints: { minSize: { w: p.min, h: 0 } } }),
      );
      store.showNode(id);
      const share = stored[p.id] ?? p.share;
      if (p.id !== filler && share !== undefined) store.patchPlacement(id, { share: { w: share } });
    }
    storeRef.current = store;
  }
  const store = storeRef.current;

  // A drag writes both panes beside its seam. The filler's is let go at once, or it would stop taking
  // what the others leave; the rest are kept for the next visit.
  useEffect(
    () =>
      store.events.on('node.placementChanged', () => {
        if (filler && shareOf(store, idOf(filler)) !== undefined)
          store.patchPlacement(idOf(filler), { share: undefined, size: { w: undefined } });
        const shares = readShares();
        for (const p of panes) {
          const share = p.id === filler ? undefined : shareOf(store, idOf(p.id));
          if (share !== undefined) shares[p.id] = Math.round(share * 1000) / 1000;
        }
        writeShares(shares);
      }),
    [store],
  );

  const byId = new Map(panes.map((p) => [idOf(p.id), p]));
  const chrome: ChromeMap = {
    [KIND]: ({ node }) => (
      <div className="pane" data-pane={byId.get(node.id as NodeId)?.id}>
        {byId.get(node.id as NodeId)?.node}
      </div>
    ),
  };
  return (
    <Provider store={store}>
      <StrategyRegistryProvider strategies={STRATEGIES}>
        <Container parentId={ZONE} chrome={chrome} className="panes windease-zone" affordances />
      </StrategyRegistryProvider>
    </Provider>
  );
}
