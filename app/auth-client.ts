// マァスゥ 認証クライアント（SDK なし・Supabase Auth REST 直叩き）
// Enaema の実績パターン（auth-client.ts）を踏襲:
//   signInWithGoogle → Google → Supabase → /auth-callback（#フラグメントにトークン）
//   → saveSessionFromHash で保存。以後は getSession が有効期限を見て refresh する。
// 注意: トークンは localStorage 保管（プロトタイプ前提。公開拡大時は Cookie 方式へ格上げ）

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Publishable キーは公開前提の鍵（データ保護は RLS 側）なので直書きする。
// 2026-10-28: Vercel の env（NEXT_PUBLIC_SUPABASE_ANON_KEY）に REST URL が誤って
// 入っていて全 API が Invalid API key になりログイン不能になったため、env 参照を廃止。
const SUPABASE_ANON_KEY = "sb_publishable_TT6R4e0toQOQ14fM1VgAkA_EgJTUb6O";

const SESSION_KEY = "maasuu.session.v1";

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  userId: string;
  email: string;
  /** 匿名サインイン（ログインなし窓口）のゲストなら true */
  isGuest: boolean;
};

function loadRaw(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.accessToken || !s.refreshToken || !s.userId) return null;
    return s;
  } catch {
    return null;
  }
}

function save(s: Session) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても呼び出し側は続行する
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // 同上
  }
}

async function refresh(s: Session): Promise<Session | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: s.refreshToken }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const next: Session = {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? s.refreshToken,
      expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000,
      userId: j?.user?.id ?? s.userId,
      email: j?.user?.email ?? s.email,
      isGuest: Boolean(j?.user?.is_anonymous ?? s.isGuest),
    };
    save(next);
    return next;
  } catch {
    return null;
  }
}

// 有効なセッションを返す。期限が近い／切れていれば refresh を試み、失敗したら破棄して null
export async function getSession(): Promise<Session | null> {
  const s = loadRaw();
  if (!s) return null;
  if (s.expiresAt - Date.now() > 60_000) return s;
  const r = await refresh(s);
  if (!r) {
    clearSession();
    return null;
  }
  return r;
}

export function signInWithGoogle() {
  const redirectTo = `${window.location.origin}/auth-callback`;
  window.location.href =
    `${SUPABASE_URL}/auth/v1/authorize?provider=google` +
    `&redirect_to=${encodeURIComponent(redirectTo)}`;
}

// ログインなし窓口（運営発行の紹介セット専用）: Supabase の匿名サインイン。
// 空ボディの signup で匿名ユーザーが発行され、通常ユーザーと同じ role(authenticated)
// のセッションが返る。以後の RLS・RPC は通常ユーザーと全く同じに効く。
// identity はこの端末・このブラウザの localStorage に宿る（消去・機種変更で失われる）。
export async function signInAsGuest(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return false;
    const j = await res.json();
    const accessToken = j?.access_token;
    const refreshToken = j?.refresh_token;
    const userId = j?.user?.id ?? "";
    if (!accessToken || !refreshToken || !userId) return false;
    save({
      accessToken,
      refreshToken,
      expiresAt: Date.now() + Number(j?.expires_in ?? 3600) * 1000,
      userId,
      email: j?.user?.email ?? "",
      isGuest: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function signOut() {
  const s = loadRaw();
  if (s) {
    const bearer = "Bearer " + s.accessToken;
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          ["Authorization"]: bearer,
        },
      });
    } catch {
      // サーバ側ログアウトの失敗は無視する（ローカル破棄が正）
    }
  }
  clearSession();
}

// /auth-callback 用: URL フラグメント（#access_token=...）からセッションを保存する
export async function saveSessionFromHash(): Promise<boolean> {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const expiresIn = Number(params.get("expires_in") ?? "3600");
  if (!accessToken || !refreshToken) return false;
  let userId = "";
  let email = "";
  try {
    const bearer = "Bearer " + accessToken;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        ["Authorization"]: bearer,
      },
    });
    if (res.ok) {
      const j = await res.json();
      userId = j?.id ?? "";
      email = j?.email ?? "";
    }
  } catch {
    // 取れなくてもログイン自体は成立させる（userId が空なら後段で再取得を促す）
  }
  if (!userId) return false;
  save({
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    userId,
    email,
    isGuest: false,
  });
  return true;
}

// ログインをまたいで遷移先（招待ページなど）を保持する
const PENDING_PATH_KEY = "maasuu.pendingPath";

export function setPendingPath(path: string) {
  try {
    if (path.startsWith("/") && !path.startsWith("//")) {
      window.localStorage.setItem(PENDING_PATH_KEY, path);
    }
  } catch {
    // 無視
  }
}

export function takePendingPath(): string | null {
  try {
    const p = window.localStorage.getItem(PENDING_PATH_KEY);
    if (p) window.localStorage.removeItem(PENDING_PATH_KEY);
    return p && p.startsWith("/") && !p.startsWith("//") ? p : null;
  } catch {
    return null;
  }
}
