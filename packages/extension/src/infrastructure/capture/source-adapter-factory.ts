import {
  type SourceAdapter,
  type SourceAdapterFactory,
} from '../../application/ports/source-adapter';

/**
 * SourceAdapterFactory の実装。3 種類の `SourceAdapter` (tab / microphone /
 * desktop) を必須 DI で受け取り、`sourceType` に応じたアダプタを返す。
 *
 * **本番実装で mock が利用されない設計**:
 * - 3 adapter は全て必須引数 (default なし)
 * - production entrypoint で `createTabCaptureSourceAdapter` 等を組み立て、
 *   その結果を本 factory に渡す
 */
export type SourceAdapterFactoryDependencies = Readonly<{
  tabCaptureSourceAdapter: SourceAdapter;
  userMediaSourceAdapter: SourceAdapter;
  desktopCaptureSourceAdapter: SourceAdapter;
}>;

export const createSourceAdapterFactory = (
  deps: SourceAdapterFactoryDependencies,
): SourceAdapterFactory => {
  return {
    create: (sourceType) => {
      switch (sourceType) {
        case 'tab':
          return deps.tabCaptureSourceAdapter;
        case 'microphone':
          return deps.userMediaSourceAdapter;
        case 'desktop':
          return deps.desktopCaptureSourceAdapter;
      }
    },
  };
};
