"use client";

// 初回プロフィール作成フォーム（性別はルール分岐の土台なので必須・自己申告）
import { useState } from "react";
import { getSession } from "./auth-client";
import { generatePromoCode } from "../lib/engine";
import { insertRow } from "../lib/supabase";
import type { Gender, Profile } from "../lib/types";

export default function ProfileCreateForm({
  userId,
  onCreated,
}: {
  userId: string;
  onCreated: (p: Profile) => void;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [statusLine, setStatusLine] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    if (!gender) {
      setError("性別を選んでください");
      return;
    }
    setBusy(true);
    try {
      // 匿名サインイン（ログインなし窓口）から来た場合はゲストとして記録する
      const s = await getSession();
      const profile = await insertRow<Profile>("profiles", {
        id: userId,
        display_name: name.trim(),
        gender,
        status_line: statusLine.trim(),
        icon_url: iconUrl.trim() || null,
        promo_code: generatePromoCode(),
        is_guest: Boolean(s?.isGuest),
      });
      onCreated(profile);
    } catch (e) {
      setError("作成できませんでした。時間をおいてもう一度お試しください。");
      console.error(e);
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2";
  const inputStyle = { borderColor: "var(--line)", background: "var(--surface)" } as const;

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <h2 className="text-base font-bold">プロフィールを作る</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        マァスゥは紹介制のSNSです。性別は、繋がりのルール（同性同士はゆるく、異性間は少し厳しく）を
        決めるための自己申告です。なりすましは通報の対象になります。
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-bold">名前（必須）</label>
          <input
            className={inputCls}
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="表示名"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">性別（必須・自己申告）</label>
          <div className="flex gap-2">
            {(
              [
                ["female", "女性"],
                ["male", "男性"],
                ["other", "その他"],
              ] as [Gender, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setGender(v)}
                className="flex-1 rounded-xl border px-3 py-2 text-sm"
                style={
                  gender === v
                    ? {
                        borderColor: "var(--accent)",
                        background: "var(--accent-soft)",
                        color: "var(--accent-strong)",
                        fontWeight: 700,
                      }
                    : { borderColor: "var(--line)", background: "var(--surface)" }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">ステータス（一行・任意）</label>
          <input
            className={inputCls}
            style={inputStyle}
            value={statusLine}
            onChange={(e) => setStatusLine(e.target.value)}
            maxLength={60}
            placeholder="いまの気分や状態を一行で"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">アイコン画像URL（任意）</label>
          <input
            className={inputCls}
            style={inputStyle}
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        {error && (
          <p className="text-xs" style={{ color: "var(--accent-strong)" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="w-full rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "作成しています…" : "はじめる"}
        </button>
      </div>
    </div>
  );
}
