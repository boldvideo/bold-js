import type { BoldPlayerBranding, BoldPlayerSettings } from "./types";

/** Bold's accent colour. */
export const BOLD_ACCENT = "#41c6a6";

/** The accent colour for the player: the caller's, else Bold's when branded as Bold, else the account's. */
export function resolveAccent(
  accentColor: string | undefined,
  settings: BoldPlayerSettings | undefined,
  branding: BoldPlayerBranding
): string | undefined {
  if (accentColor) return accentColor;
  if (branding === "bold") return BOLD_ACCENT;
  // The player's controls sit on dark video, so the dark theme's accent fits best.
  return settings?.themeConfig?.dark?.accent || settings?.themeConfig?.light?.accent || undefined;
}

/** Bold's wordmark. */
function BoldWordmark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2446 670" fill="currentColor" role="img" aria-label="Bold">
      <path d="M1852.5076,670 L1852.5076,669.887695 C1852.5076,527.853176 1852.5076,314.801396 1852.5076,30.7323566 C1852.5076,30.7323566 1977.5565,14.8363101 2114.2625,14.8363101 C2390.85371,14.8363101 2445.96,207.708341 2445.96,379.385643 C2445.96,483.357525 2414.91214,594.306455 2343.80949,670 L1852.5076,670 Z" />
      <path d="M1811.81187,670 L1308.38511,670 C1278.09393,628.203566 1262.20497,569.947745 1262.20497,490.657969 L1262.20497,21.1947287 L1680.80086,21.1947287 L1680.80086,464.164558 L1806.90949,456.746403 L1811.81187,670 Z" />
      <path d="M1139.30733,670 L679.041861,670 C614.793443,602.542428 577.585794,499.840245 577.585794,366.668806 C577.585794,143.064418 719.590476,0 911.40277,0 C1106.39427,0 1240.9808,143.064418 1240.9808,366.668806 C1240.9808,499.840245 1203.1872,602.542428 1139.30733,670 Z" />
      <path d="M0,670 L0,21.1947287 L326.398821,21.1947287 C467.343767,21.1947287 527.748744,95.376279 527.748744,185.453876 C527.748744,256.456217 505.494279,310.502775 458.865876,345.474077 C537.286372,366.668806 575.436883,440.850356 575.436883,527.748744 C575.436883,578.439587 564.798901,630.120011 529.896194,670 L0,670 Z" />
    </svg>
  );
}

/**
 * The logo in the player's corner. An account without a logo shows none,
 * never Bold's.
 */
export function BrandMark({
  branding,
  settings,
}: {
  branding: BoldPlayerBranding;
  settings?: BoldPlayerSettings;
}) {
  if (branding === "none") return null;
  if (branding === "bold") {
    return (
      <div className="bold-player-brand">
        <BoldWordmark />
      </div>
    );
  }
  const logo = settings?.logoDarkUrl || settings?.logoUrl;
  if (!logo) return null;
  return (
    <div className="bold-player-brand">
      <img src={logo} alt={settings?.account?.name ?? ""} />
    </div>
  );
}
