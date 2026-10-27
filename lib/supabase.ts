// Supabase PostgREST クライアント（SDK なし・fetch 直叩き。Enaema と同方式）
// 認証は auth-client.ts のセッション（localStorage）から access token を取り、
// RLS が効く前提でユーザーのトークンで読み書きする。
// 宣伝ページ（/p/[code]）の未ログイン閲覧は anon key で読む（RLS 側で promo_on のみ許可）。

import { getSession } from "../app/auth-client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

type RestOptions = {
  method?: string;
  body?: unknown;
  /** 指定すればこのトークンを使う（未指定ならセッション→anon の順） */
  token?: string | null;
  prefer?: string;
};

export async function rest<T>(path: string, opts: RestOptions = {}): Promise<T> {
  let token = opts.token;
  if (token === undefined) {
    const s = await getSession();
    token = s?.accessToken ?? SUPABASE_ANON_KEY;
  }
  const headers: Record<string, string> = { apikey: SUPABASE_ANON_KEY };
  if (token) {
    const bearer = "Bearer " + token;
    headers["Authorization"] = bearer;
  }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.prefer) headers["Prefer"] = opts.prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`REST ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** SELECT（配列で返す） */
export function selectRows<T>(path: string, token?: string | null): Promise<T[]> {
  return rest<T[]>(path, { token });
}

/** SELECT して最初の1行（なければ null） */
export async function selectOne<T>(path: string, token?: string | null): Promise<T | null> {
  const rows = await rest<T[]>(path, { token });
  return rows.length > 0 ? rows[0] : null;
}

/** INSERT して作成された行を返す */
export async function insertRow<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const rows = await rest<T[]>(table, {
    method: "POST",
    body: row,
    prefer: "return=representation",
  });
  return rows[0];
}

/** UPDATE（query は PostgREST のフィルタ文字列）して更新行を返す */
export function updateRows<T>(
  table: string,
  query: string,
  patch: Record<string, unknown>,
): Promise<T[]> {
  return rest<T[]>(`${table}?${query}`, {
    method: "PATCH",
    body: patch,
    prefer: "return=representation",
  });
}

/** DELETE */
export function deleteRows(table: string, query: string): Promise<void> {
  return rest<void>(`${table}?${query}`, { method: "DELETE" });
}

/** RPC（report_user など） */
export function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  return rest<T>(`rpc/${fn}`, { method: "POST", body: args });
}

export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export { SUPABASE_URL, SUPABASE_ANON_KEY };
