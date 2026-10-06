export const LIGHT_YEAR = 9.4607e15;
export const AU = 1.495978707e11;

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export function superscript(n: number): string {
  const digits = String(Math.abs(Math.trunc(n)))
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)])
    .join('');
  return (n < 0 ? '⁻' : '') + digits;
}

/** "8.8 × 10²⁶ m" */
export function scientific(meters: number, digits = 1): string {
  if (meters === 0) return '0 m';
  let exp = Math.floor(Math.log10(Math.abs(meters)));
  let mantissa = meters / 10 ** exp;
  if (Number(mantissa.toFixed(digits)) >= 10) {
    mantissa /= 10;
    exp += 1;
  }
  return `${mantissa.toFixed(digits)} × 10${superscript(exp)} m`;
}

interface Unit {
  /** Smallest length (m) this unit is used for. */
  from: number;
  meters: number;
  name: string;
}

// Ordered from largest to smallest; the first unit whose `from` fits is used.
const UNITS: Unit[] = [
  { from: 1e9 * LIGHT_YEAR, meters: 1e9 * LIGHT_YEAR, name: 'billion light-years' },
  { from: 1e6 * LIGHT_YEAR, meters: 1e6 * LIGHT_YEAR, name: 'million light-years' },
  { from: 0.5 * LIGHT_YEAR, meters: LIGHT_YEAR, name: 'light-years' },
  { from: 0.5 * AU, meters: AU, name: 'AU' },
  { from: 1e9, meters: 1e9, name: 'million km' },
  { from: 1e3, meters: 1e3, name: 'km' },
  { from: 1, meters: 1, name: 'm' },
  { from: 1e-2, meters: 1e-2, name: 'cm' },
  { from: 1e-3, meters: 1e-3, name: 'mm' },
  { from: 1e-6, meters: 1e-6, name: 'µm' },
  { from: 1e-9, meters: 1e-9, name: 'nm' },
  { from: 1e-12, meters: 1e-12, name: 'pm' },
  { from: 0, meters: 1e-15, name: 'fm' },
];

function unitFor(meters: number): Unit {
  return UNITS.find((u) => meters >= u.from) ?? UNITS[UNITS.length - 1];
}

/** Two significant digits, with thousands separators for big values. */
function compact(value: number): string {
  if (value >= 100) {
    const mag = 10 ** (Math.floor(Math.log10(value)) - 1);
    return (Math.round(value / mag) * mag).toLocaleString('en-US');
  }
  if (value >= 10) return String(Math.round(value));
  return String(Number(value.toFixed(1)));
}

/** "93 billion light-years", "12,000 km", "2 nm", "5 fm" */
export function friendly(meters: number): string {
  const unit = unitFor(meters);
  return `${compact(meters / unit.meters)} ${unit.name}`;
}

export interface ScaleBar {
  meters: number;
  label: string;
}

/** Largest "round" length (1, 2 or 5 × 10ⁿ of a readable unit) not exceeding `maxMeters`. */
export function scaleBar(maxMeters: number): ScaleBar {
  const unit = unitFor(maxMeters);
  const value = maxMeters / unit.meters;
  const mag = 10 ** Math.floor(Math.log10(value));
  const lead = value / mag;
  const nice = (lead >= 5 ? 5 : lead >= 2 ? 2 : 1) * mag;
  const meters = nice * unit.meters;
  return { meters, label: `${compact(nice)} ${unit.name}` };
}
