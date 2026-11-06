// 宣伝ページ（/p/[code]）: ログイン不要の公開プロフィール。
// anon key で読む。RLS により promo_on = true のプロフィールとそのカードだけが返る。
// OFF の場合や存在しない場合は「公開されていません」と表示する。
// ページ上部には「公開ページ」の帯をこのページ側で付ける（操作性修正
// 2026-11-06）。本人のホーム（ProfilePageView の見え方）は変えない。
import { notFound } from "next/navigation";
import Link from "next/link";
import ProfilePageView from "../../profile-page-view";
import type { Profile, ProfileCard } from "../../../lib/types";
import { resolveTodaysMood } from "../../../lib/mood";
import { jstDateKey } from "../../../lib/lucky";
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

  // 今日の気分: 公開ページでは「公開（pub）」かつ日付が今日（JST）のものだけ出す。
  // 非公開（priv）の気分はここでは出さない。
  const resolvedMood = resolveTodaysMood(cards, jstDateKey(), false);
  const mood = resolvedMood
    ? { src: resolvedMood.stamp.src, label: resolvedMood.stamp.label }
    : null;

  return (
    <main className="flex min-h-dvh w-full flex-col">
      <p
        className="py-1.5 text-center text-[11px] font-bold tracking-[0.18em]"
        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
      >
        公開ページ
      </p>
      <ProfilePageView
        profile={profile}
        cards={cards}
        mood={mood}
        className="flex-1"
        footer={
          <p className="text-center text-xs leading-relaxed opacity-85">
            <Link href="/" className="underline underline-offset-2">
              マァスゥ
            </Link>
            のプロフィールページです（紹介制のため、参加には招待が必要です）
          </p>
        }
      />
    </main>
  );
}
