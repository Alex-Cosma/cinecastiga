/**
 * A session's device in words, from its user agent: "Chrome pe macOS", "Safari pe iPhone". Only the browser family and
 * the system are named; versions and the raw string are left out. Unknown parts are said plainly.
 */
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\b(OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bYaBrowser\//, "Yandex"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(HeadlessChrome|Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

const first = (ua: string, table: [RegExp, string][]) => table.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent?.trim() ?? "";
  if (!ua) return "Dispozitiv necunoscut";
  const browser = first(ua, BROWSERS), system = first(ua, SYSTEMS);
  if (browser && system) return `${browser} pe ${system}`;
  if (browser) return browser;
  if (system) return `Browser pe ${system}`;
  return "Dispozitiv necunoscut";
}
