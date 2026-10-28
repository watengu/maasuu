// 宣伝ページ（/p/[code]）: ログイン不要の公開プロフィール。
// anon key で読む。RLS により promo_on = true のプロフィールとそのカードだけが返る。
// OFF の場合や存在しない場合は「公開されていません」と表示する。
import { notFound } from "next/navigation";
import Link from "next/link";
import ProfilePageView from "../../profile-page-view";
import type { Profile, ProfileCard } from "../../../lib/types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

async function fetchAnon<T>(path: string): Promise<T[]> {
  const headers: Record<string, string> = { apikey: SUPABASE_ANON_KEY };
  const bearer = "Bearer " + SUPABASE_ANON_KEY;
  headers["Authorization"] = bearer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

export default async function PromoPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const profiles = await fetchAnon<Profile>(
    `profiles?promo_code=eq.${encodeURIComponent(code)}&select=*`,
  );
  const profile = profiles[0];
  if (!profile || !profile.promo_on) {
    notFound();
  }
  const cards = await fetchAnon<ProfileCard>(
    `profile_cards?user_id=eq.${profile.id}&order=sort.asc,id.asc&select=*`,
  );

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <ProfilePageView profile={profile} cards={cards} />

      <p className="mt-10 text-center text-xs" style={{ color: "var(--muted)" }}>
        <Link href="/" className="underline underline-offset-2">
          マァスゥ
        </Link>
        のプロフィールページです（紹介制のため、参加には招待が必要です）
      </p>
    </main>
  );
}
