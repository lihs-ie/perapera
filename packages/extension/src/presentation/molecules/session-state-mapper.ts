import type { StatusPillState } from '../atoms/status-pill';
import type { WaveformMode } from '../atoms/waveform-mode';

/**
 * Session state を Waveform mode に変換する純粋関数。
 *
 * 引数型は SessionState ではなく `string` で受ける。OverlayLine 等のメッセージ
 * 経由で flow してくる値はランタイムでは string で扱われるため、type assertion
 * を介さずに narrowing する。
 *
 * - capturing/transcribing/translating + audioSilent=true  → 'silent'
 * - capturing/transcribing/translating + audioSilent=false → 'live'
 * - degraded → 'degraded'
 * - connecting/reconnecting/requesting_permission → 'reconnecting'
 * - paused → 'paused'
 * - idle/stopped/error → 'idle'
 */
export function mapSessionStateToWaveformMode(state: string, audioSilent: boolean): WaveformMode {
  if (state === 'capturing' || state === 'transcribing' || state === 'translating') {
    return audioSilent ? 'silent' : 'live';
  }
  if (state === 'degraded') return 'degraded';
  if (state === 'connecting' || state === 'reconnecting' || state === 'requesting_permission') {
    return 'reconnecting';
  }
  if (state === 'paused') return 'paused';
  return 'idle';
}

/**
 * Session state を StatusPill state に正規化する純粋関数。
 *
 * mock の STATUS_MAP は 10 状態 (requesting_permission を含まない)。
 * 拡張側の SessionState には requesting_permission が存在するため、
 * `connecting` に丸めて mock 互換を保つ。未知の値は 'idle' に落とす。
 *
 * switch case で literal narrowing を行い、type assertion を避ける。
 */
export function mapSessionStateToStatusPill(state: string): StatusPillState {
  switch (state) {
    case 'capturing':
    case 'transcribing':
    case 'translating':
    case 'connecting':
    case 'reconnecting':
    case 'degraded':
    case 'error':
    case 'paused':
    case 'idle':
    case 'stopped':
      return state;
    case 'requesting_permission':
      return 'connecting';
    default:
      return 'idle';
  }
}
