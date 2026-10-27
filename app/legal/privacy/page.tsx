import Link from "next/link";

// プライバシーポリシー（草案: 正式公開前に運営者が最終確認する）
export const metadata = { title: "プライバシーポリシー | マァスゥ" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-lg font-bold">プライバシーポリシー</h1>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        マァスゥにおける情報の取り扱いを説明する草案です。正式公開時に確定版へ差し替えます。
      </p>
      <div className="mt-6 space-y-5 text-sm leading-relaxed">
        <section>
          <h2 className="font-bold">1. 取得する情報</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Googleログインに伴うメールアドレスとアカウント識別子</li>
            <li>プロフィール情報（名前、アイコン画像URL、ステータス、性別＝自己申告、カードの内容）</li>
            <li>やりとりの記録（スタンプの種類、メッセージ本文、送信日時）</li>
            <li>通報の記録</li>
          </ul>
        </section>
        <section>
          <h2 className="font-bold">2. 利用目的</h2>
          <p className="mt-1">
            取得した情報は、本サービスの提供と運営（ログイン、繋がりと期限の管理、ルール判定、
            不正利用への対応）のためだけに使います。広告目的で第三者へ販売することはありません。
          </p>
        </section>
        <section>
          <h2 className="font-bold">3. 「24時間で消える」について</h2>
          <p className="mt-1">
            メッセージは送信から24時間を過ぎると画面に表示されなくなります。ただし、繋がりの
            期限判定やターン数の計算、不正利用への対応のために、記録自体はサーバー上に一定期間
            保持されます。表示されなくなることと、記録が即時に削除されることは同じではありません。
          </p>
        </section>
        <section>
          <h2 className="font-bold">4. 外部のサービス</h2>
          <p className="mt-1">
            ログインにはGoogleの認証を、データの保存にはSupabaseの基盤を利用しています。
            これらの事業者には、それぞれのサービス提供に必要な範囲で情報が処理されます。
          </p>
        </section>
        <section>
          <h2 className="font-bold">5. 宣伝ページ</h2>
          <p className="mt-1">
            宣伝ページをONにした場合、そのプロフィールとカードは、ログインしていない人を含む
            誰からでも閲覧できる状態になります。OFFにすれば公開は止まります。
          </p>
        </section>
        <section>
          <h2 className="font-bold">6. 削除の希望</h2>
          <p className="mt-1">
            アカウントや情報の削除を希望する場合は、運営までお問い合わせください。
            本サービス内での自動削除機能は、現在準備中です。
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
