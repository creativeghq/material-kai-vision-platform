export const FLIGHT_CABINS = ['economy', 'premium_economy', 'business', 'first'] as const;
export type FlightCabin = typeof FLIGHT_CABINS[number];

export const FLIGHT_TRIP_TYPES = ['one_way', 'round_trip'] as const;
export type FlightTripType = typeof FLIGHT_TRIP_TYPES[number];

export const FLIGHT_CABIN_LABELS: Record<FlightCabin, string> = {
  economy: 'Economy',
  premium_economy: 'Premium economy',
  business: 'Business',
  first: 'First',
};

export const FLIGHT_TRIP_TYPE_LABELS: Record<FlightTripType, string> = {
  one_way: 'One way',
  round_trip: 'Return',
};

export const TRIP_LINE_COMMITMENTS = ['planned', 'actual'] as const;
export type TripLineCommitment = typeof TRIP_LINE_COMMITMENTS[number];

export const FLIGHT_SEARCH_MODES = ['root', 'byok', 'free'] as const;
export type FlightSearchMode = typeof FLIGHT_SEARCH_MODES[number];
