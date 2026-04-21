/**
 * jsdom の `MediaStream` スタブ (tests/setup.ts) に対し、テストから
 * `track` を追加するためのヘルパ。DOM の `MediaStream.addTrack` は
 * 完全な `MediaStreamTrack` を要求するため、最小 `{ stop }` を持つ
 * fake track をスタブの内部配列へ挿入する。
 *
 * `as` 禁止の制約下で成立させるため、`unknown` 型ガードで narrow する。
 */

export type FakeMediaStreamTrack = Readonly<{ stop: () => void }>;

const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value);

export const addFakeTrack = (stream: MediaStream, track: FakeMediaStreamTrack): void => {
  const tracks: unknown = Reflect.get(stream, 'tracks');
  if (!isUnknownArray(tracks)) {
    throw new Error(
      'MediaStream stub tracks array not found. Ensure tests/setup.ts is loaded before calling addFakeTrack.',
    );
  }
  tracks.push(track);
};
