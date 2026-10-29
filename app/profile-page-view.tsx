// プロフィールページの見た目（全面背景の没入型ページ）の表示専用コンポーネント。
// 公開ページ（/p/[code]、サーバー側）と、ホーム画面の「自分のページ」、
// 設定画面のライブプレビュー（いずれもクライアント側）で同じ見た目を使うため、
// ここに一本化する。データ取得は呼び出し側の責務。
//
// デザイン（第4弾 2026-10-29）: カード型をやめ、背景が画面いっぱいに広がる
// フルブリード構成。モチーフは「夕景の丘とマーモット（マァ＆スゥ）の温かい
// 世界観」で、情景は CSS グラデーション＋インライン SVG のシルエットで描く
// 独自のシーン（外部画像は使わない）。背景の優先順位は
// cover_url（写真）＞ テーマシーン ＞ default。
// リンクカードは URL から SNS を自動判定し、アイコン行とボタンに反映する。
import type { CSSProperties, ReactNode } from "react";
import type { Profile, ProfileCard } from "../lib/types";

/** 背景テーマシーン（profiles.theme にキーを保存。cover_url がある場合はそちらが優先） */
export type ProfileTheme = {
  label: string;
  /** スウォッチ表示にも使う代表グラデーション */
  gradient: string;
  /** true = 暗い背景（白文字）、false = 明るい背景（濃色文字） */
  dark: boolean;
};

export const PROFILE_THEMES: Record<string, ProfileTheme> = {
  default: {
    label: "夕焼けの丘",
    gradient:
      "linear-gradient(180deg, #f7c98b 0%, #f2a56b 26%, #dd7f63 48%, #8a6a72 74%, #3f4a4a 100%)",
    dark: true,
  },
  morning: {
    label: "朝の丘",
    gradient:
      "linear-gradient(180deg, #fff8e1 0%, #fdf3d3 30%, #e9f3d9 62%, #cfe8d2 100%)",
    dark: false,
  },
  night: {
    label: "星の丘",
    gradient:
      "linear-gradient(180deg, #070d24 0%, #16224d 45%, #2c2a5e 75%, #453a6b 100%)",
    dark: true,
  },
  sea: {
    label: "海辺",
    gradient:
      "linear-gradient(180deg, #0f5e6b 0%, #128091 35%, #2aa5a0 65%, #7fd1c0 100%)",
    dark: true,
  },
  sakura: {
    label: "桜の丘",
    gradient:
      "linear-gradient(180deg, #ffeef3 0%, #ffd9e4 40%, #ffc9d6 72%, #f6b8c8 100%)",
    dark: false,
  },
};

/** 保存済みキーをシーンキーに解決する（旧キー sunset は default と同じ見た目にする） */
export function resolveThemeKey(key: string | null | undefined): string {
  if (key === "sunset") return "default";
  return key && PROFILE_THEMES[key] ? key : "default";
}

/** 明るいシーンでの前景色（濃色） */
const LIGHT_FG: Record<string, string> = {
  morning: "#44503c",
  sakura: "#63384a",
};

/** 丘のシルエット（2層）。viewBox は 400x140 で横いっぱいに伸ばす */
function Hills({ back, front }: { back: string; front: string }) {
  return (
    <svg
      className="absolute inset-x-0 bottom-0 h-[130px] w-full"
      viewBox="0 0 400 140"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0,84 C60,58 130,72 190,62 C250,52 330,68 400,54 L400,140 L0,140 Z"
        fill={back}
      />
      <path
        d="M0,108 C70,86 150,98 220,90 C280,83 340,94 400,86 L400,140 L0,140 Z"
        fill={front}
      />
    </svg>
  );
}

/** 波のシルエット（2層） */
function Waves({ back, front }: { back: string; front: string }) {
  return (
    <svg
      className="absolute inset-x-0 bottom-0 h-[120px] w-full"
      viewBox="0 0 400 140"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0,78 C60,58 120,100 200,82 C280,64 340,96 400,76 L400,140 L0,140 Z"
        fill={back}
      />
      <path
        d="M0,104 C70,86 140,118 220,102 C300,86 350,112 400,100 L400,140 L0,140 Z"
        fill={front}
      />
    </svg>
  );
}

/** シーンの装飾レイヤー（陽のグロー・星・花びら・丘/波）。cover 表示時は使わない */
function SceneArt({ sceneKey }: { sceneKey: string }) {
  switch (sceneKey) {
    case "morning":
      return (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 260px 160px at 50% 110px, rgba(255, 244, 180, 0.85), rgba(255, 244, 180, 0) 70%)",
            }}
          />
          <Hills back="rgba(130, 170, 115, 0.40)" front="rgba(88, 128, 88, 0.60)" />
        </>
      );
    case "night":
      return (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: [
                "radial-gradient(2px 2px at 24px 36px, rgba(255,255,255,0.95), transparent)",
                "radial-gradient(1.5px 1.5px at 132px 84px, rgba(255,255,255,0.7), transparent)",
                "radial-gradient(1px 1px at 196px 28px, rgba(255,255,255,0.85), transparent)",
                "radial-gradient(1.8px 1.8px at 84px 150px, rgba(255,255,255,0.6), transparent)",
                "radial-gradient(1.2px 1.2px at 168px 190px, rgba(255,255,255,0.75), transparent)",
                "radial-gradient(1px 1px at 44px 224px, rgba(255,255,255,0.55), transparent)",
              ].join(", "),
              backgroundSize: "240px 260px",
            }}
          />
          <Hills back="rgba(4, 7, 18, 0.55)" front="rgba(3, 5, 14, 0.85)" />
        </>
      );
    case "sea":
      return (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 260px 150px at 50% 90px, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0) 70%)",
            }}
          />
          <Waves back="rgba(6, 70, 84, 0.30)" front="rgba(4, 52, 66, 0.50)" />
        </>
      );
    case "sakura":
      return (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: [
                "radial-gradient(5px 3.5px at 30px 50px, rgba(255,255,255,0.75), transparent)",
                "radial-gradient(4px 3px at 140px 120px, rgba(238, 130, 160, 0.45), transparent)",
                "radial-gradient(5px 3.5px at 210px 40px, rgba(255,255,255,0.6), transparent)",
                "radial-gradient(4px 3px at 90px 210px, rgba(238, 130, 160, 0.4), transparent)",
                "radial-gradient(5px 3.5px at 180px 250px, rgba(255,255,255,0.65), transparent)",
              ].join(", "),
              backgroundSize: "260px 300px",
            }}
          />
          <Hills back="rgba(150, 95, 115, 0.30)" front="rgba(120, 70, 92, 0.45)" />
        </>
      );
    default:
      // 夕焼けの丘
      return (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 250px 160px at 50% 115px, rgba(255, 240, 200, 0.85), rgba(255, 240, 200, 0) 70%)",
            }}
          />
          <Hills back="rgba(46, 64, 52, 0.55)" front="rgba(30, 44, 36, 0.78)" />
        </>
      );
  }
}

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

/** SNS の簡易アイコン（クリーム色の丸バッジの中身）。LINE / note は文字バッジで代用する */
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
  footer,
  compact = false,
  className,
}: {
  profile: Profile;
  cards: ProfileCard[];
  /** 背景エリア最下部に出す注記・リンク類（公開ページの注記、ホームの各種リンク） */
  footer?: ReactNode;
  /** 設定画面のライブプレビュー用に余白とアイコンを詰める */
  compact?: boolean;
  className?: string;
}) {
  const sceneKey = resolveThemeKey(profile.theme);
  const theme = PROFILE_THEMES[sceneKey];
  const hasCover = Boolean(profile.cover_url);
  const dark = hasCover || theme.dark;
  const fg = dark ? "#ffffff" : (LIGHT_FG[sceneKey] ?? "#46323a");
  const shellStyle: CSSProperties = hasCover
    ? { color: fg }
    : { backgroundImage: theme.gradient, color: fg };

  // SNS アイコン行: リンクカードからサービスごとに最初の1件を抽出する
  const snsRow: { service: SnsService; url: string }[] = [];
  {
    const seen = new Set<string>();
    for (const c of cards) {
      if (c.kind !== "link" || !c.url) continue;
      const s = detectSns(c.url);
      if (s && !seen.has(s.name)) {
        seen.add(s.name);
        snsRow.push({ service: s, url: c.url });
      }
    }
  }

  const iconSize = compact ? "h-20 w-20" : "h-28 w-28";
  const statusPillCls = dark
    ? "border-white/30 bg-white/15 text-white"
    : "border-black/10 bg-white/55";

  return (
    <div
      className={`relative flex flex-col overflow-hidden ${className ?? ""}`}
      style={shellStyle}
    >
      {hasCover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.cover_url ?? ""}
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
      ) : (
        <SceneArt sceneKey={sceneKey} />
      )}

      <div
        className={`relative flex flex-1 flex-col px-5 ${compact ? "pb-9 pt-4" : "pb-14 pt-6"}`}
      >
        <div
          className="text-[13px] font-bold tracking-[0.18em]"
          style={dark ? { textShadow: "0 1px 8px rgba(0, 0, 0, 0.35)" } : undefined}
        >
          まぁすぅ
        </div>

        <div className={`text-center ${compact ? "mt-3" : "mt-5"}`}>
          {profile.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.icon_url}
              alt=""
              className={`mx-auto ${iconSize} rounded-full object-cover shadow-lg ring-4 ring-[#fff6e9]`}
            />
          ) : (
            <div
              className={`mx-auto flex ${iconSize} items-center justify-center rounded-full bg-[#fff6e9] shadow-lg ring-4 ring-white/60`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/stamps/stamp-07.png"
                alt="まぁ＆すぅ"
                className={`${compact ? "h-16 w-16" : "h-24 w-24"} object-contain`}
              />
            </div>
          )}
          <h1
            className={`${compact ? "mt-3 text-xl" : "mt-4 text-2xl"} font-bold`}
            style={
              dark ? { textShadow: "0 2px 14px rgba(0, 0, 0, 0.45)" } : undefined
            }
          >
            {profile.display_name}
          </h1>
          {profile.status_line && (
            <p
              className={`mt-3 inline-block rounded-full border px-4 py-1.5 text-sm backdrop-blur-sm ${statusPillCls}`}
            >
              {profile.status_line}
            </p>
          )}
        </div>

        {snsRow.length > 0 && (
          <div className={`flex flex-wrap justify-center gap-3 ${compact ? "mt-4" : "mt-5"}`}>
            {snsRow.map(({ service, url }) => (
              <a
                key={service.name}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={service.name}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fffbf3] shadow-md transition hover:opacity-90"
              >
                <SnsIcon service={service} />
              </a>
            ))}
          </div>
        )}

        {cards.length > 0 ? (
          <ul className={`${compact ? "mt-5 space-y-2.5" : "mt-7 space-y-3"}`}>
            {cards.map((c) => {
              if (c.kind === "link" && c.url) {
                const sns = detectSns(c.url);
                const label = c.title.trim() ? c.title : (sns?.name ?? c.title);
                const sub =
                  sns && c.title.trim() && c.title.trim() !== sns.name
                    ? sns.name
                    : null;
                return (
                  <li key={c.id}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-[20px] px-4 py-3.5 shadow-md transition hover:opacity-95"
                      style={{ background: "#fffbf3", color: "#43302a" }}
                    >
                      {sns ? (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5">
                          <SnsIcon service={sns} />
                        </span>
                      ) : (
                        <span
                          className="ml-1 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: "#c9a227" }}
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{label}</span>
                        {sub && (
                          <span className="block text-[11px]" style={{ color: "#9a7d6d" }}>
                            {sub}
                          </span>
                        )}
                      </span>
                    </a>
                  </li>
                );
              }
              return (
                <li
                  key={c.id}
                  className="rounded-[20px] px-4 py-3.5 text-sm leading-relaxed backdrop-blur-md"
                  style={
                    dark
                      ? {
                          background: "rgba(255, 246, 233, 0.18)",
                          border: "1px solid rgba(255, 255, 255, 0.25)",
                        }
                      : {
                          background: "rgba(255, 255, 255, 0.55)",
                          border: "1px solid rgba(70, 40, 30, 0.08)",
                        }
                  }
                >
                  {c.title}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-7 text-center text-xs opacity-85">
            ホームに載せる内容はまだありません。
          </p>
        )}

        <div className="mt-auto pt-10">
          {footer}
          <p className="mt-4 text-center text-[10.5px] tracking-[0.14em] opacity-85">
            紹介制SNS まぁすぅ
          </p>
        </div>
      </div>
    </div>
  );
}
