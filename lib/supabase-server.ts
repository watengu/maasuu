// サーバーコンポーネント用: 公開情報（URL と anon key）の定数だけを切り出したもの。
// lib/supabase.ts は認証セッション（localStorage）に依存するため、
// 未ログイン閲覧の宣伝ページはこちらを使う。
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Publishable キーは公開前提の鍵（データ保護は RLS 側）なので直書きする。
// 2026-10-28: Vercel の env に REST URL が誤登録され Invalid API key になったため env 参照を廃止。
export const SUPABASE_ANON_KEY = "sb_publishable_TT6R4e0toQOQ14fM1VgAkA_EgJTUb6O";
