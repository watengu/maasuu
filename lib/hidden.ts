// 「一覧から消す」の端末内記録（段階1）。
// 本人だけの表示制御に使う。相手の画面・DB の記録には触らない。
// DB 化（connections / introduction_sets 側のフラグ）は Supabase の管理トークン
// 復旧後に移行する。それまでの置き場として localStorage を使う。

export type HiddenStore = {
  connections: string[];
  invites: string[];
};

const EMPTY: HiddenStore = { connections: [], invites: [] };

function key(userId: string): string {
  return `maasuu.hidden.v1.${userId}`;
}

export function loadHidden(userId: string): HiddenStore {
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<HiddenStore>;
    return {
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      invites: Array.isArray(parsed.invites) ? parsed.invites : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(userId: string, store: HiddenStore): void {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(store));
  } catch {
    // 保存できなくても画面は動かす
  }
}

export function hideConnection(userId: string, connectionId: string): HiddenStore {
  const store = loadHidden(userId);
  if (!store.connections.includes(connectionId)) {
    store.connections = [...store.connections, connectionId];
    save(userId, store);
  }
  return store;
}

export function hideInvite(userId: string, inviteId: string): HiddenStore {
  const store = loadHidden(userId);
  if (!store.invites.includes(inviteId)) {
    store.invites = [...store.invites, inviteId];
    save(userId, store);
  }
  return store;
}
