import { useMemo } from 'react';

interface SunPosition {
  x: number;
  y: number;
  z: number;
  intensity: number;
  colorTemp: number;
}

/**
 * Calculates a simplified sun position based on time of day and room orientation.
 *
 * @param hour - Hour of day (6-21, representing 6am to 9pm)
 * @param orientationDeg - Room orientation in degrees (0=North, 90=East, 180=South, 270=West)
 * @returns Sun position (x, y, z), intensity, and color temperature in Kelvin
 */
export function useSunPosition(
  hour: number,
  orientationDeg: number,
): SunPosition {
  return useMemo(() => {
    const clampedHour = Math.max(6, Math.min(21, hour));

    // Altitude: sin curve peaking at solar noon (~12:30), max 70 degrees
    const altitudeDeg = Math.sin(((clampedHour - 6) / 15) * Math.PI) * 70;
    const altitudeRad = (altitudeDeg * Math.PI) / 180;

    // Azimuth: linear interpolation from 90 (east) at 6am to 270 (west) at 9pm
    const azimuthDeg = 90 + ((clampedHour - 6) / 15) * 180;
    // Adjust for room orientation: subtract orientation so 0 faces the window direction
    const adjustedAzimuthDeg = azimuthDeg - orientationDeg;
    const azimuthRad = (adjustedAzimuthDeg * Math.PI) / 180;

    // Convert spherical to cartesian at radius 10
    const radius = 10;
    const y = Math.sin(altitudeRad) * radius;
    const horizontalDist = Math.cos(altitudeRad) * radius;
    const x = Math.sin(azimuthRad) * horizontalDist;
    const z = Math.cos(azimuthRad) * horizontalDist;

    // Intensity: based on sun altitude (higher = brighter), clamped to 0
    const intensity = Math.max(0, Math.sin(altitudeRad)) * 2;

    // Color temperature: 2500K at sunrise/sunset, 5500K at noon
    // Use sin curve matching altitude for smooth interpolation
    const tempFactor = Math.max(0, Math.sin(altitudeRad));
    const colorTemp = 2500 + tempFactor * 3000;

    return { x, y, z, intensity, colorTemp };
  }, [hour, orientationDeg]);
}

/**
 * Converts a color temperature in Kelvin to an approximate hex color.
 * Uses a simplified version of Tanner Helland's algorithm.
 */
export function colorTempToHex(kelvin: number): string {
  const temp = kelvin / 100;
  let r: number, g: number, b: number;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b =
      temp <= 19
        ? 0
        : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }

  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
