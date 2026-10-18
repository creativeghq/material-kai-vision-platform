export const flightDuration = (m: number | null) => (m == null ? '—' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);

export const flightTime = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '—');
