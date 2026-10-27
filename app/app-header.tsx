"use client";

// 共通ヘッダー（ログイン中のみ各画面で表示する）
import Link from "next/link";
import { signOut } from "./auth-client";

export default function AppHeader() {
  const onLogout = async () => {
    await signOut();
    window.location.replace("/");
  };
  return (
    <header
      className="sticky top-0 z-10 border-b"
      style={{ background: "var(--bg)", borderColor: "var(--line)" }}
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-wide" style={{ color: "var(--accent-strong)" }}>
          マァスゥ
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="underline-offset-2 hover:underline">
            つながり
          </Link>
          <Link href="/me" className="underline-offset-2 hover:underline">
            プロフィール
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="underline-offset-2 hover:underline"
            style={{ color: "var(--muted)" }}
          >
            ログアウト
          </button>
        </nav>
      </div>
    </header>
  );
}
