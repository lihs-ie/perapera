/**
 * 用語集取得出力 DTO (DTO-O-305, DD-238)。
 *
 * Query は入力を取らない (常に "default" glossary を返す)。
 * 値は branded `Glossary` ではなく primitive (UI 層が直接扱えるよう dehydrate 済)。
 */
export type GetGlossaryOutput = Readonly<{
  entries: readonly {
    source: string;
    target: string;
    caseSensitive: boolean;
  }[];
}>;
