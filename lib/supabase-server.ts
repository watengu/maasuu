// サーバーコンポーネント用: 公開情報（URL と anon key）の定数だけを切り出したもの。
// lib/supabase.ts は認証セッション（localStorage）に依存するため、
// 未ログイン閲覧の宣伝ページはこちらを使う。
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
