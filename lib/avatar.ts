// 円形アイコンのサイズ階段（用途別に定数化し、画面ごとのバラつきをなくす）。
// プロフィールページの大きなアイコンはこの階段の対象外（profile-page-view 側で管理）。
export const AVATAR_CLASS = {
  /** 友だち／繋がりリストの行: 44px */
  list: "h-11 w-11",
  /** トーク画面のヘッダー: 36px */
  talkHeader: "h-9 w-9",
  /** トークの吹き出し横（相手）: 28px */
  bubble: "h-7 w-7",
} as const;
