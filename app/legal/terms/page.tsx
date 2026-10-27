import Link from "next/link";

// 利用規約（草案: 正式公開前に運営者が最終確認する）
export const metadata = { title: "利用規約 | マァスゥ" };

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-lg font-bold">利用規約</h1>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        マァスゥ（以下「本サービス」）の利用条件を定める草案です。正式公開時に確定版へ差し替えます。
      </p>
      <div className="mt-6 space-y-5 text-sm leading-relaxed">
        <section>
          <h2 className="font-bold">1. 本サービスについて</h2>
          <p className="mt-1">
            本サービスは紹介制のSNSです。検索機能はなく、繋がりは紹介からのみ生まれます。
            紹介は「リンク2本で1セット」の形で行われ、紹介した人は繋がりの当事者にはなりません。
            両方のリンクが開かれた時点で、2人の繋がりが同時に始まります。
            誰の紹介で繋がったかは記録されます。
            繋がりには期限があり、期限までに所定の往復のやりとりがない場合、その繋がりは自動的に終了します。
            メッセージは送信から24時間を過ぎると表示されなくなります。これらは本サービスの仕様であり、
            不具合ではありません。
          </p>
        </section>
        <section>
          <h2 className="font-bold">2. アカウント</h2>
          <p className="mt-1">
            利用にはGoogleアカウントによるログインが必要です。プロフィールの性別は自己申告であり、
            繋がりのルール判定に使われます。申告内容は正確に入力してください。
          </p>
        </section>
        <section>
          <h2 className="font-bold">3. 禁止事項</h2>
          <p className="mt-1">次の行為を禁止します。</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>性別を含むプロフィールのなりすまし、他人へのなりすまし</li>
            <li>嫌がらせ、脅迫、差別的な言動</li>
            <li>営業・勧誘・スパム目的での利用</li>
            <li>法令または公序良俗に反する行為</li>
            <li>本サービスの運営を妨げる行為</li>
          </ul>
        </section>
        <section>
          <h2 className="font-bold">4. 通報とアカウント停止</h2>
          <p className="mt-1">
            利用者は他の利用者を通報できます。性別なりすましについては、別々の3人の利用者から
            通報が集まった時点で、対象アカウントを自動的に停止します。その他の違反についても、
            運営の判断で予告なくアカウントを停止することがあります。
          </p>
        </section>
        <section>
          <h2 className="font-bold">5. 免責</h2>
          <p className="mt-1">
            運営は、本サービスの内容の変更・中断・終了を予告なく行うことがあります。
            繋がりやメッセージが仕様により消えることについて、運営は責任を負いません。
            利用者同士のトラブルは当事者間で解決するものとします。
          </p>
        </section>
        <section>
          <h2 className="font-bold">6. 規約の変更</h2>
          <p className="mt-1">
            本規約は必要に応じて変更されます。変更後に本サービスを利用した場合、変更に同意したものとみなします。
          </p>
        </section>
      </div>
      <p className="mt-10 text-center text-xs">
        <Link href="/" className="underline underline-offset-2">
          ホームへ戻る
        </Link>
      </p>
    </main>
  );
}
