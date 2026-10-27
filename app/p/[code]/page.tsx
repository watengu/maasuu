// 宣伝ページ（/p/[code]）: ログイン不要の公開プロフィール。
// anon key で読む。RLS により promo_on = true のプロフィールとそのカードだけが返る。
// OFF の場合や存在しない場合は「公開されていません」と表示する。
import { notFound } from "next/navigation";
import Link from "next/link";
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
      <div className="text-center">
        {profile.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.icon_url}
            alt=""
            className="mx-auto h-24 w-24 rounded-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/stamps/stamp-07.png" alt="まぁ＆すぅ" className="mx-auto w-24" />
        )}
        <h1 className="mt-3 text-xl font-bold">{profile.display_name}</h1>
        {profile.status_line && (
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {profile.status_line}
          </p>
        )}
      </div>

      {cards.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {cards.map((c) =>
            c.kind === "link" && c.url ? (
              <li key={c.id}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-2xl border px-4 py-3 text-center text-sm font-bold"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--surface)",
                    color: "var(--accent-strong)",
                  }}
                >
                  {c.title}
                </a>
              </li>
            ) : (
              <li
                key={c.id}
                className="rounded-2xl border px-4 py-3 text-sm leading-relaxed"
                style={{ borderColor: "var(--line)", background: "var(--surface)" }}
              >
                {c.title}
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
          カードはまだありません。
        </p>
      )}

      <p className="mt-10 text-center text-xs" style={{ color: "var(--muted)" }}>
        <Link href="/" className="underline underline-offset-2">
          マァスゥ
        </Link>
        のプロフィールページです（紹介制のため、参加には招待が必要です）
      </p>
    </main>
  );
}
