// プロフィールページの見た目（リットリンク式カード）の表示専用コンポーネント。
// 公開ページ（/p/[code]、サーバー側）と、ホーム画面の「自分のページ」（クライアント側）で
// 同じ見た目を使うため、ここに一本化する。データ取得は呼び出し側の責務。
//
// リットリンクの良いとこ取り（2026-10-29）:
// - 背景は全面写真（profiles.cover_url）またはテーマのグラデーションを敷き、
//   中身は白文字＋ガラス風ピルで背景の上に完結させる（テーマ変数には依存しない）。
// - リンクカードは URL から SNS を自動判定し、アイコン＋名前つきで表示する。
import type { CSSProperties } from "react";
import type { Profile, ProfileCard } from "../lib/types";

/** 背景テーマ（profiles.theme にキーを保存。cover_url がある場合はそちらが優先される） */
export const PROFILE_THEMES: Record<string, { label: string; gradient: string }> = {
  default: {
    label: "デフォルト",
    gradient: "linear-gradient(165deg, #14532d 0%, #2e7d5b 45%, #7bc47f 100%)",
  },
  night: {
    label: "ナイト",
    gradient: "linear-gradient(165deg, #0b1026 0%, #232a5e 50%, #5b2a86 100%)",
  },
  sunset: {
    label: "サンセット",
    gradient: "linear-gradient(165deg, #42275a 0%, #c94b6d 50%, #f6a15c 100%)",
  },
  sea: {
    label: "シー",
    gradient: "linear-gradient(165deg, #0b3d91 0%, #1e88c7 50%, #7fd4e8 100%)",
  },
  sakura: {
    label: "さくら",
    gradient: "linear-gradient(165deg, #a53860 0%, #e0658f 50%, #f7b7c8 100%)",
  },
};

type SnsService = { name: string; color: string; hosts: string[] };

const SNS_SERVICES: SnsService[] = [
  { name: "Instagram", color: "#d62976", hosts: ["instagram.com"] },
  { name: "TikTok", color: "#111111", hosts: ["tiktok.com"] },
  { name: "X", color: "#000000", hosts: ["x.com", "twitter.com"] },
  { name: "YouTube", color: "#ff0000", hosts: ["youtube.com", "youtu.be"] },
  { name: "Threads", color: "#000000", hosts: ["threads.net", "threads.com"] },
  { name: "LINE", color: "#06c755", hosts: ["line.me", "lin.ee"] },
  { name: "note", color: "#000000", hosts: ["note.com"] },
];

/** URL のホスト名から SNS を判定する（判定できなければ null） */
function detectSns(url: string): SnsService | null {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    const lower = url.toLowerCase();
    return SNS_SERVICES.find((s) => s.hosts.some((h) => lower.includes(h))) ?? null;
  }
  return (
    SNS_SERVICES.find((s) =>
      s.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
    ) ?? null
  );
}

/** SNS の簡易アイコン（白い丸バッジの中身）。LINE / note は文字バッジで代用する */
function SnsIcon({ service }: { service: SnsService }) {
  const c = service.color;
  switch (service.name) {
    case "Instagram":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={c} strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="0.8" fill={c} stroke="none" />
        </svg>
      );
    case "TikTok":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill={c}>
          <path d="M16.6 3c.4 2.1 1.8 3.6 3.9 3.9v3c-1.5 0-2.9-.5-3.9-1.2v6.3c0 3.5-2.6 6-5.9 6A5.75 5.75 0 0 1 5 14.3c0-3.2 2.6-5.8 5.9-5.7.3 0 .7 0 1 .1v3.1c-.3-.1-.7-.2-1-.2a2.7 2.7 0 0 0-2.7 2.7c0 1.5 1.2 2.7 2.7 2.7 1.6 0 2.8-1.2 2.8-2.9V3h2.9z" />
        </svg>
      );
    case "X":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill={c}>
          <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L2.4 3h6.4l4.4 5.9L17.8 3zm-1.1 16.1h1.7L7.7 4.7H5.9l10.8 14.4z" />
        </svg>
      );
    case "YouTube":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <rect x="2.5" y="5" width="19" height="14" rx="4" fill={c} />
          <path d="M10.2 9.4v5.2L14.9 12z" fill="#ffffff" />
        </svg>
      );
    case "Threads":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={c} strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <text
            x="12"
            y="16"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill={c}
            stroke="none"
          >
            @
          </text>
        </svg>
      );
    case "LINE":
      return (
        <span className="text-[8px] font-black tracking-tight" style={{ color: c }}>
          LINE
        </span>
      );
    case "note":
      return (
        <span className="text-[8px] font-black tracking-tight" style={{ color: c }}>
          note
        </span>
      );
    default:
      return null;
  }
}

export default function ProfilePageView({
  profile,
  cards,
}: {
  profile: Profile;
  cards: ProfileCard[];
}) {
  const theme =
    (profile.theme && PROFILE_THEMES[profile.theme]) || PROFILE_THEMES.default;
  const shellStyle: CSSProperties = profile.cover_url
    ? {}
    : { backgroundImage: theme.gradient };

  return (
    <div
      className="relative overflow-hidden rounded-[28px] text-white shadow-xl"
      style={shellStyle}
    >
      {profile.cover_url && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.cover_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(rgba(8, 10, 18, 0.38), rgba(8, 10, 18, 0.58))",
            }}
          />
        </>
      )}

      <div className="relative px-5 py-10">
        <div className="text-center">
          {profile.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.icon_url}
              alt=""
              className="mx-auto h-28 w-28 rounded-full object-cover shadow-lg ring-4 ring-white/90"
            />
          ) : (
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-white/90 shadow-lg ring-4 ring-white/70">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/stamps/stamp-07.png"
                alt="まぁ＆すぅ"
                className="h-24 w-24 object-contain"
              />
            </div>
          )}
          <h1
            className="mt-4 text-2xl font-bold"
            style={{ textShadow: "0 2px 14px rgba(0, 0, 0, 0.45)" }}
          >
            {profile.display_name}
          </h1>
          {profile.status_line && (
            <p className="mt-3 inline-block rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-sm text-white backdrop-blur-sm">
              {profile.status_line}
            </p>
          )}
        </div>

        {cards.length > 0 ? (
          <ul className="mt-8 space-y-3">
            {cards.map((c) => {
              if (c.kind === "link" && c.url) {
                const sns = detectSns(c.url);
                const label = c.title.trim() ? c.title : (sns?.name ?? c.title);
                return (
                  <li key={c.id}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2.5 rounded-full border border-white/40 bg-white/20 px-4 py-3 text-sm font-bold text-white shadow backdrop-blur-md transition hover:bg-white/30"
                    >
                      {sns && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow">
                          <SnsIcon service={sns} />
                        </span>
                      )}
                      <span className="truncate">{label}</span>
                    </a>
                  </li>
                );
              }
              return (
                <li
                  key={c.id}
                  className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-sm leading-relaxed text-white backdrop-blur-md"
                >
                  {c.title}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-8 text-center text-xs text-white/85">
            ホームに載せる内容はまだありません。
          </p>
        )}
      </div>
    </div>
  );
}
