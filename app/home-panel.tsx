"use client";

// ホームパネル（スライドシェルの右パネル）: 自分のページ。
// 公開ページ（/p/[code]）と同じ見た目（ProfilePageView）で、自分のアイコン・名前・
// 一言・カードを表示する。promo_on の有無にかかわらず本人には常に見える
// （promo_on は「他人から /p で見えるか」だけを決める）。
// 第4弾（2026-10-29）で全面背景に合わせ、パネル全体にページを広げ、
// 公開ページへのリンクや設定導線は背景エリア内の最下部（footer）に置く。
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
  const footer = (
    <div className="text-center text-xs leading-relaxed">
      {cards.length === 0 && (
        <p className="opacity-85">
          リンクや短い文を並べて、あなたのページと公開ページに出すものです。
          <Link href="/me" className="underline underline-offset-2">
            設定
          </Link>
          から追加できます。
        </p>
      )}
      {!me.is_guest &&
        (me.promo_on && me.promo_code ? (
          <p className={cards.length === 0 ? "mt-3" : undefined}>
            <Link href={`/p/${me.promo_code}`} className="underline underline-offset-2">
              公開ページを見る
            </Link>
          </p>
        ) : (
          <p className={cards.length === 0 ? "mt-3" : undefined}>
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
  );

  return (
    <div className="flex h-full flex-col">
      <ProfilePageView profile={me} cards={cards} footer={footer} className="min-h-0 flex-1" />
    </div>
  );
}
