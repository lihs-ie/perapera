export type Props = Readonly<{
  /** 0〜1 の音声レベル (RMS)。範囲外は clamp される */
  rms: number;
  /** アクセシビリティラベル (既定: "音声レベル") */
  ariaLabel?: string;
}>;

/**
 * Issue #110 VuMeter atom。
 *
 * 0〜1 の RMS を横バーで可視化する単純な atom。しきい値で色が切り替わる:
 * - `rms < 0.2`  → green (弱いが正常に流れている)
 * - `rms < 0.5`  → yellow (普通〜大きい)
 * - `rms >= 0.5` → red (過大音量)
 *
 * 実装は container `.meter` + child `.fill` (幅を rms% に) の 2 要素。
 */
export function VuMeter(props: Props) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(props.rms) ? props.rms : 0));
  const percentage = Math.round(clamped * 100);
  const level = clamped >= 0.5 ? 'high' : clamped >= 0.2 ? 'mid' : 'low';
  return (
    <div
      className="meter"
      role="meter"
      aria-label={props.ariaLabel ?? '音声レベル'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      data-level={level}
      data-testid="vu-meter"
    >
      <div className="fill" style={{ width: `${percentage.toString()}%` }} data-level={level} />
    </div>
  );
}
