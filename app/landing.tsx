"use client";

// 入口ページ（ランディング）: 未ログイン時に表示する「サイトの顔」。
// 構図は雑誌の表紙: 上部に誌名のようなマストヘッド、その下に表紙写真の
// ようなメインビジュアル（夕焼けの丘＋まぁ＆すぅ）を大きく置き、周りに
// カバーライン（見出しコピー）を大小つけて配置する。特徴と始め方は
// 表紙の下に続く「中面」として落ち着いたトーンで置く。
// 世界観は第4弾プロフィール（夕焼けの丘）と揃えるが、シーンはこの
// ページ用に独自に組む（コンポーネント共有はしない）。
// 文言はアプリの実ルールに即したものだけを使う（紹介制／メッセージは
// 24時間で消える／繋がりは期限つきで、続けないと消える／検索なし）。
import Link from "next/link";
import { signInWithGoogle } from "./auth-client";

/** ランディング用の丘シルエット（2層）。表紙ビジュアル内と頁最下部で使う */
function LandingHills({
  back,
  front,
  className,
}: {
  back: string;
  front: string;
  className: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 140"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0,80 C55,52 125,70 185,58 C245,46 330,64 400,48 L400,140 L0,140 Z"
        fill={back}
      />
      <path
        d="M0,106 C65,82 145,96 215,86 C275,78 340,90 400,82 L400,140 L0,140 Z"
        fill={front}
      />
    </svg>
  );
}

const FEATURES: {
  title: string;
  body: string;
  icon: React.ReactNode;
}[] = [
  {
    title: "紹介制",
    body: "入口は、知り合いからの紹介だけ。検索はありません。",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 14a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 5.43" />
        <path d="M14 10a5 5 0 0 0-7.07 0L4.1 12.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
      </svg>
    ),
  },
  {
    title: "24時間で消える",
    body: "メッセージは1日で消えます。残らないから、気軽に本音で話せます。",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    title: "期限つきの繋がり",
    body: "続くかどうかは、お互いのやりとり次第。続けないと、繋がりは消えてしまいます。",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3h12" />
        <path d="M6 21h12" />
        <path d="M7 3c0 5 10 5 10 9S7 16 7 21" />
        <path d="M17 3c0 5-10 5-10 9s10 4 10 9" />
      </svg>
    ),
  },
];

const STEPS = [
  "紹介リンクを開く",
  "名前を入れて参加",
  "その日からおしゃべり開始",
] as const;

export default function LandingScreen() {
  return (
    <main
      className="relative min-h-dvh overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, #f7c98b 0%, #f2a56b 26%, #dd7f63 48%, #8a6a72 74%, #3f4a4a 100%)",
        color: "#fff8ec",
      }}
    >
      {/* 陽のグローと頁最下部の丘（シーン全体の装飾） */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 300px 190px at 50% 120px, rgba(255, 240, 200, 0.8), rgba(255, 240, 200, 0) 70%)",
        }}
        aria-hidden="true"
      />
      <LandingHills
        back="rgba(46, 64, 52, 0.45)"
        front="rgba(28, 40, 33, 0.7)"
        className="absolute inset-x-0 bottom-0 h-[150px] w-full"
      />

      <div className="relative mx-auto w-full max-w-md px-5 pb-12 pt-6">
        {/* ===== 表紙 ===== */}
        <div className="flex items-center justify-between text-[11px] font-bold tracking-[0.28em] opacity-90">
          <span>紹介制</span>
          <span>検索なし</span>
        </div>

        {/* マストヘッド（誌名） */}
        <div className="mt-5 text-center">
          <h1
            className="text-[64px] font-black leading-none tracking-[0.1em]"
            style={{ textShadow: "0 4px 22px rgba(96, 42, 8, 0.45)" }}
          >
            マァスゥ
          </h1>
          <div className="mt-3 flex items-center justify-center gap-3 opacity-90">
            <span className="h-px w-10 bg-current" aria-hidden="true" />
            <span className="text-[11px] font-bold tracking-[0.5em]">MAASUU</span>
            <span className="h-px w-10 bg-current" aria-hidden="true" />
          </div>
        </div>

        {/* メインビジュアル（表紙写真） */}
        <div
          className="relative mt-7 overflow-hidden rounded-[28px] border shadow-2xl"
          style={{
            borderColor: "rgba(255, 248, 236, 0.35)",
            background:
              "linear-gradient(165deg, #ffdca3 0%, #f5a468 38%, #dd7a5f 68%, #77586a 100%)",
            boxShadow: "0 24px 48px rgba(64, 30, 6, 0.35)",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 240px 150px at 50% 64px, rgba(255, 246, 214, 0.9), rgba(255, 246, 214, 0) 70%)",
            }}
            aria-hidden="true"
          />
          <LandingHills
            back="rgba(64, 74, 58, 0.5)"
            front="rgba(36, 48, 38, 0.8)"
            className="absolute inset-x-0 bottom-0 h-[104px] w-full"
          />
          <p
            className="absolute left-5 top-5 text-[22px] font-black leading-snug tracking-wide"
            style={{ textShadow: "0 2px 12px rgba(96, 42, 8, 0.5)" }}
          >
            紹介制の、
            <br />
            小さなSNS。
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/stamps/stamp-07.png"
            alt="まぁ＆すぅ"
            className="relative mx-auto mt-16 w-44"
            style={{ filter: "drop-shadow(0 10px 18px rgba(80, 38, 4, 0.35))" }}
          />
          <p className="relative pb-5 pt-1 text-center text-[11px] font-bold tracking-[0.3em] opacity-95">
            まぁ＆すぅ の いる場所
          </p>
        </div>

        {/* カバーライン */}
        <div className="mt-7 space-y-3">
          <p className="flex items-center gap-3 text-lg font-black tracking-wide">
            <span
              className="h-6 w-1.5 rounded-full"
              style={{ background: "#ffd98a" }}
              aria-hidden="true"
            />
            メッセージは、24時間で消える
          </p>
          <p className="text-right text-[15px] font-bold leading-relaxed">
            繋がりは期限つき。
            <br />
            だから本音で話せる
          </p>
          <p className="text-center text-xs font-bold tracking-[0.2em] opacity-90">
            検索はありません。入口は紹介だけ
          </p>
        </div>

        {/* ===== 中面 ===== */}
        <div
          className="mt-10 border-t pt-8"
          style={{ borderColor: "rgba(255, 248, 236, 0.35)" }}
        >
          <h2 className="text-center text-xs font-bold tracking-[0.4em] opacity-90">
            マァスゥのこと
          </h2>
          <div className="mt-5 space-y-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex gap-4 rounded-3xl p-5"
                style={{
                  background: "rgba(255, 251, 243, 0.94)",
                  color: "#43302a",
                  boxShadow: "0 10px 24px rgba(64, 30, 6, 0.18)",
                }}
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "#fbe3cf", color: "#b95c33" }}
                >
                  {f.icon}
                </span>
                <span>
                  <span className="block text-[15px] font-bold">{f.title}</span>
                  <span
                    className="mt-1 block text-[13px] leading-relaxed"
                    style={{ color: "#7a5f52" }}
                  >
                    {f.body}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {/* 始め方 */}
          <div
            className="mt-6 rounded-3xl border p-5"
            style={{
              borderColor: "rgba(255, 248, 236, 0.3)",
              background: "rgba(48, 40, 44, 0.28)",
            }}
          >
            <h3 className="text-xs font-bold tracking-[0.35em] opacity-90">
              始め方
            </h3>
            <ol className="mt-4 space-y-3">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-sm font-bold">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black"
                    style={{ background: "#ffd98a", color: "#5a3a1e" }}
                  >
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* ===== CTA ===== */}
        <button
          type="button"
          onClick={signInWithGoogle}
          className="mt-9 w-full rounded-full py-4 text-base font-black tracking-wide shadow-xl"
          style={{
            background: "#fffbf3",
            color: "#43302a",
            boxShadow: "0 16px 32px rgba(64, 30, 6, 0.3)",
          }}
        >
          Googleでログイン
        </button>
        <p className="mt-3 text-center text-xs leading-relaxed opacity-90">
          参加には紹介リンクが必要です。
          <br />
          リンクをお持ちの方は、そのリンクからお入りください。
        </p>

        <footer className="mt-10 text-center text-xs opacity-90">
          <Link href="/legal/terms" className="underline underline-offset-2">
            利用規約
          </Link>
          <span className="mx-2">・</span>
          <Link href="/legal/privacy" className="underline underline-offset-2">
            プライバシーポリシー
          </Link>
        </footer>
      </div>
    </main>
  );
}
