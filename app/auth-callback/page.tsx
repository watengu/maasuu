"use client";

// 認証コールバック（/auth-callback）
// Google → Supabase から #フラグメント付きで戻ってくる。トークンを localStorage に保存し、
// ログイン前に保持していた遷移先（招待ページなど）があればそこへ、なければホームへ。
import { useEffect, useState } from "react";
import Link from "next/link";
import { saveSessionFromHash, takePendingPath } from "../auth-client";

export default function AuthCallback() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    saveSessionFromHash()
      .then((ok) => {
        if (ok) {
          const dest = takePendingPath() ?? "/";
          window.location.replace(dest);
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
      {failed ? (
        <>
          <p className="text-sm">ログインできませんでした。</p>
          <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
            <Link href="/" className="underline">
              ホームへ戻る
            </Link>
          </p>
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          ログインしています…
        </p>
      )}
    </main>
  );
}
