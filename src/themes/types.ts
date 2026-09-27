export interface GradientPair { from: string; to: string }

export interface BoardTheme {
  id: string;
  label: string;
  kind: 'preset' | 'lichess';
  light: GradientPair;
  dark: GradientPair;
  /** Extension-relative thumbnail path (lichess-derived boards only). */
  thumb?: string;
  mood?: string;
  /** OKLCH hue for highlights and arrows. Derived from the dark squares when absent. */
  accentHue?: number;
}

export interface PieceSet {
  id: string;
  label: string;
  atlas: { '1': string; '2': string; '4': string };
  preview: string;
}
