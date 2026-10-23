export interface Settings {
  mass: number;
  inclination: number;
  azimuth: number;
  distance: number;
  accretion: number;
  speed: number;
  lightDelay: boolean;
  palette: number;
}

export interface Clock {
  realSeconds: number;
  physicalSeconds: number;
  /** Coordinate time in Schwarzschild light-crossing units. */
  phase: number;
}

export interface Observation {
  id: string;
  settings: Settings;
  phase: number;
  capturedAt: number;
  image: string;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  mass: 4.3, inclination: 72, azimuth: 0.32, distance: 30,
  accretion: 1.05, speed: 120, lightDelay: true, palette: 0,
});

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const PARAMETER_RANGES={mass:[2,8.6],inclination:[2,178],azimuth:[-1000,1000],distance:[22,48],accretion:[0.35,2],speed:[30,480]} as const;

export function gravitationalScale(millionSolarMasses: number) {
  return { radiusKm: 2_953_287 * millionSolarMasses, crossingSeconds: 9.8509819 * millionSolarMasses };
}

export function orbitalPeriod(radiusInRs: number, mass: number): number {
  return 2 * Math.PI * Math.sqrt(2 * radiusInRs ** 3) * gravitationalScale(mass).crossingSeconds;
}

export function advanceClock(clock: Clock, seconds: number, speed: number, mass: number, paused: boolean): Clock {
  const interval = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const elapsed = paused ? 0 : interval * speed;
  return {
    realSeconds: clock.realSeconds + interval,
    physicalSeconds: clock.physicalSeconds + elapsed,
    phase: clock.phase + elapsed / gravitationalScale(mass).crossingSeconds,
  };
}

export function normalizeSettings(value: Partial<Settings>): Settings {
  const finite = (key: keyof Settings, min: number, max: number): number => {
    const item = value[key];
    return typeof item === 'number' && Number.isFinite(item)
      ? clamp(item, min, max) : DEFAULT_SETTINGS[key] as number;
  };
  return {
    mass: finite('mass', ...PARAMETER_RANGES.mass), inclination: finite('inclination', ...PARAMETER_RANGES.inclination),
    azimuth: finite('azimuth', ...PARAMETER_RANGES.azimuth), distance: finite('distance', ...PARAMETER_RANGES.distance),
    accretion: finite('accretion', ...PARAMETER_RANGES.accretion), speed: finite('speed', ...PARAMETER_RANGES.speed),
    lightDelay: typeof value.lightDelay === 'boolean' ? value.lightDelay : DEFAULT_SETTINGS.lightDelay,
    palette: Math.round(finite('palette', 0, 2)),
  };
}

export function createObservation(id: string, settings: Settings, phase: number, capturedAt: number, image: string): Observation {
  return { id, settings: { ...settings }, phase, capturedAt, image };
}

export function appendObservation(observations: Observation[], observation: Observation): Observation[] {
  return [observation, ...observations].slice(0, 3);
}

export function readObservations(value: unknown): Observation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Observation =>
    item !== null && typeof item === 'object'
    && typeof item.id === 'string' && typeof item.image === 'string'
    && item.image.startsWith('data:image/png;base64,')
    && typeof item.phase === 'number' && Number.isFinite(item.phase)
    && typeof item.capturedAt === 'number' && Number.isFinite(item.capturedAt)
    && item.settings !== null && typeof item.settings === 'object'
  ).slice(0, 3).map(item => ({ ...item, settings: normalizeSettings(item.settings) }));
}
