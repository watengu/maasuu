// アプリバッジ（Badging API）: ホーム画面のアイコンに「対応が要る繋がりの数」を出す。
// ホーム画面に追加された状態（standalone）で主に効く、インストールの実利の1つ。
// 未対応の環境（通常のブラウザタブ等）では何もしない。補助機能なので失敗は握りつぶす。

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** count > 0 で数字バッジを出し、0 で消す。未対応環境では no-op。 */
export function updateAppBadge(count: number): void {
  try {
    if (typeof navigator === "undefined") return;
    const nav = navigator as BadgeNavigator;
    if (count > 0) {
      if (typeof nav.setAppBadge === "function") {
        void nav.setAppBadge(count).catch(() => undefined);
      }
      return;
    }
    if (typeof nav.clearAppBadge === "function") {
      void nav.clearAppBadge().catch(() => undefined);
    } else if (typeof nav.setAppBadge === "function") {
      // clearAppBadge が無い環境では 0 をセットして消す
      void nav.setAppBadge(0).catch(() => undefined);
    }
  } catch {
    // バッジの失敗で本体の表示は止めない
  }
}
