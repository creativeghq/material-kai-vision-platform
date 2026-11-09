export const CABINET_HARDWARE = [
  'gola',
  'push_to_open',
  'edge_pull',
  'bar_handles',
  'knobs',
  'cup_pulls',
] as const;
export type CabinetHardware = (typeof CABINET_HARDWARE)[number];

export const CABINET_HARDWARE_OPTIONS: Record<CabinetHardware, { label: string; render: string }> = {
  gola: {
    label: 'Gola Handleless Channel',
    render: 'handleless Gola system — a continuous recessed aluminium channel profile, in the cabinet colour, runs horizontally along the top of every base-unit front and between stacked drawer fronts, so fronts are opened by gripping the channel; no handles, knobs or pulls anywhere',
  },
  push_to_open: {
    label: 'Push-to-Open',
    render: 'handleless push-to-open fronts — completely flat, flush fronts with even narrow gaps and no channel, handle, knob or pull anywhere',
  },
  edge_pull: {
    label: 'Integrated Edge Pull',
    render: 'integrated edge pulls — a thin profile pull fixed along the top edge of every door and drawer front, the same length and position on each',
  },
  bar_handles: {
    label: 'Bar Handles',
    render: 'slim brushed stainless steel bar handles, the same length on every front, mounted horizontally at the top of doors and centred on drawers',
  },
  knobs: {
    label: 'Knobs',
    render: 'small round brushed stainless steel knobs, one per door at the upper corner on the opening side and one centred on each drawer',
  },
  cup_pulls: {
    label: 'Cup Pulls',
    render: 'brushed metal cup pulls, centred on every drawer and placed at the same height on every door',
  },
};
