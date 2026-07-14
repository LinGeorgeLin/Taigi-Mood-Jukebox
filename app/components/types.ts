// 三個階段元件共用的型別定義，抽出來避免每個檔案各自重複宣告，
// 也方便之後如果型別要改，只需要改這一個地方。

export type IllustrationType = "heart_wave" | "storm_cloud" | "beer_stars";

export interface Mood {
  id: string;
  label: string;
  emoji: string;
  hanji: string;
  tailo: string;
  accent_color: string;
  illustration_type: IllustrationType;
}
