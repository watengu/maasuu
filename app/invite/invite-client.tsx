"use client";

// 紹介ページ（段階2調整）: 段階2でシェルの専用タブにした紹介を、タブ廃止に
// 合わせて専用ルート /invite に移した画面。セッションとプロフィールの取得、
// 未ログイン・プロフィール未作成・BAN の扱いは設定画面（/me）と同じ作法:
// 未ログインと未作成はトップ（シェル側で振り分け）へ戻し、BAN は専用画面を出す。
// 中身（要約＋詳しく／作る／送る／状態の3段構成）は InviteSection が担う。
// ゲストは招待を作れないため、案内だけを出す（旧タブでの扱いと同じ）。
// ヘッダーは他ページと同じ AppHeader に統一する（操作性修正 2026-11-06）。
// 戻る導線は共通の BackButton（履歴どおり戻る）で、大きめのボタンにする。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSession, type Session } from "../auth-client";
import AppHeader from "../app-header";
import BackButton from "../back-button";
import BannedScreen from "../banned-screen";
import InviteSection from "./invite-section";
import { selectOne } from "../../lib/supabase";
import type { Profile } from "../../lib/types";

export default function InviteClient() {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "banned" | "ready">(
    "loading",
  );

  const load = useCallback(async () => {
    const s = await getSession();
    if (!s) {
      window.location.replace("/");
      return;
    }
    setSession(s);
    const profile = await selectOne<Profile>(
      `profiles?id=eq.${s.userId}&select=*`,
    );
    if (!profile) {
      window.location.replace("/");
      return;
    }
    if (profile.banned) {
      setPhase("banned");
      return;
    }
    setMe(profile);
    setPhase("ready");
  }, []);

  useEffect(() => {
    // セッションは localStorage 保持のため、初回取得は effect から開始する（/me と同じ）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => {
      console.error(e);
      setPhase("error");
    });
  }, [load]);

  if (phase === "loading") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          読み込んでいます…
        </p>
      </main>
    );
  }
  if (phase === "banned") return <BannedScreen />;
  if (phase === "error" || !me || !session) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
        <p className="text-sm">読み込みに失敗しました。</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5">
        <div className="flex items-center gap-3">
          <BackButton
            className="flex min-h-[44px] items-center rounded-full border px-4 text-sm font-bold"
            style={{
              borderColor: "var(--line)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
          >
            ← もどる
          </BackButton>
          <h1 className="text-base font-bold">紹介</h1>
        </div>
        {me.is_guest ? (
          <div className="mt-4">
            <div
              className="rounded-2xl border p-5 text-sm leading-relaxed"
              style={{ borderColor: "var(--line)", background: "var(--surface)" }}
            >
              <p>ゲストで参加中のため、招待は作れません。</p>
              <p className="mt-2">
                あなたとの繋がりは
                <Link href="/" className="underline underline-offset-2">
                  つながり
                </Link>
                で確認できます。
              </p>
            </div>
          </div>
        ) : (
          <InviteSection session={session} me={me} />
        )}
      </main>
    </div>
  );
}
