"use client";

// ホームパネル（スライドシェルの右パネル）: 自分のページ。
// 公開ページ（/p/[code]）と同じ見た目（ProfilePageView）で、自分のアイコン・名前・
// 一言・カードを表示する。promo_on の有無にかかわらず本人には常に見える
// （promo_on は「他人から /p で見えるか」だけを決める）。
// 公開URLのコピー／共有などの操作は設定（/me）に置き、ここはページらしく保つ。
import Link from "next/link";
import ProfilePageView from "./profile-page-view";
import type { Profile, ProfileCard } from "../lib/types";

export default function HomePanel({
  me,
  cards,
}: {
  me: Profile;
  cards: ProfileCard[];
}) {
  return (
    <div className="px-4 py-6">
      <ProfilePageView profile={me} cards={cards} />
      {cards.length === 0 && (
        <p className="mt-2 text-center text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          リンクや短い文を並べて、あなたのページと公開ページに出すものです。
          <Link href="/me" className="underline underline-offset-2">
            設定
          </Link>
          から追加できます。
        </p>
      )}
      <div className="mt-10 text-center text-xs" style={{ color: "var(--muted)" }}>
        {!me.is_guest &&
          (me.promo_on && me.promo_code ? (
            <p>
              <Link href={`/p/${me.promo_code}`} className="underline underline-offset-2">
                公開ページを見る
              </Link>
            </p>
          ) : (
            <p>
              公開ページはOFFです。
              <Link href="/me" className="underline underline-offset-2">
                設定
              </Link>
              でONにできます。
            </p>
          ))}
        <p className="mt-3">
          <Link href="/me" className="underline underline-offset-2">
            設定を開く
          </Link>
        </p>
      </div>
    </div>
  );
}
