// プロフィールページの見た目（リットリンク式カード）の表示専用コンポーネント。
// 公開ページ（/p/[code]、サーバー側）と、ホーム画面の「自分のページ」（クライアント側）で
// 同じ見た目を使うため、ここに一本化する。データ取得は呼び出し側の責務。
import type { Profile, ProfileCard } from "../lib/types";

export default function ProfilePageView({
  profile,
  cards,
}: {
  profile: Profile;
  cards: ProfileCard[];
}) {
  return (
    <>
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
    </>
  );
}
