/**
 * Text in the hole of a donut. recharts clones the element it is given as a
 * `<Label content>` and supplies `viewBox`; only a polar one has a centre.
 */
export function DonutCenterLabel({
  viewBox,
  primary,
  secondary,
  primaryClassName,
  primaryOffset = 0,
  secondaryOffset = 20,
}: Readonly<{
  viewBox?: { cx?: number; cy?: number } | Record<string, unknown>;
  primary: string;
  secondary: string;
  primaryClassName: string;
  primaryOffset?: number;
  secondaryOffset?: number;
}>) {
  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
  const cx = viewBox.cx as number | undefined;
  const cy = viewBox.cy as number | undefined;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan x={cx} y={(cy ?? 0) + primaryOffset} className={primaryClassName}>
        {primary}
      </tspan>
      <tspan
        x={cx}
        y={(cy ?? 0) + secondaryOffset}
        className="fill-muted-foreground text-xs"
      >
        {secondary}
      </tspan>
    </text>
  );
}
