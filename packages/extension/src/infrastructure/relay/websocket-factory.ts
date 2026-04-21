/**
 * WebSocket 生成を抽象化する factory type と、production 用の実装。
 *
 * **本番実装で mock が利用されない設計**:
 * - `createRelayWebSocketGateway` は `WebSocketFactory` を必須 DI として取り、
 *   default を持たない
 * - production entrypoint (Service Worker / Background) で
 *   `createBrowserWebSocketFactory()` を明示的に呼び、その戻り値を渡す
 * - test では自前の mock factory を渡す
 * - この分離により、呼び出し忘れで mock が production で走る事故を防ぐ
 */

/**
 * 最小 WebSocket contract。ブラウザ native `WebSocket` も test mock も
 * 同じ形で使えるよう、必要メソッドのみを列挙。
 */
export type WebSocketLike = {
  readonly readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
};

export type WebSocketFactory = (url: string) => WebSocketLike;

/**
 * Production の WebSocket factory。呼び出し元 (entrypoint) は本関数で生成した
 * factory を DI として `createRelayWebSocketGateway` に渡す。
 */
export const createBrowserWebSocketFactory = (): WebSocketFactory => {
  return (url) => new WebSocket(url);
};
