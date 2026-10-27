"use client";

// バンされたユーザー向けの停止画面（profiles.banned = true のとき全画面で表示）
import { signOut } from "./auth-client";

export default function BannedScreen() {
  const onLogout = async () => {
    await signOut();
    window.location.replace("/");
  };
  return (
    <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
      <h1 className="text-lg font-bold">アカウントが停止されています</h1>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        規約にもとづき、このアカウントではマァスゥを利用できません。
      </p>
      <button
        type="button"
        onClick={onLogout}
        className="mt-6 text-sm underline underline-offset-2"
        style={{ color: "var(--muted)" }}
      >
        ログアウト
      </button>
    </main>
  );
}
