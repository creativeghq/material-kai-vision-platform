import React from 'react';
import type { SheetType } from '@/services/moodboardSheetsService';

/**
 * SVG illustrations approximating what each sheet type's PDF actually looks like.
 *
 * These are the default visual when no reference image has been uploaded to the
 * `moodboard-sheet-references` bucket. They render in the SheetTypePreviewModal
 * left column and convey the layout shape/intent (where the chips/swatches/
 * symbols/title block sit) without requiring any external assets.
 *
 * Aspect ratio is 4:3 to match the modal's image slot.
 */

interface Props {
  sheetType: SheetType;
  className?: string;
}

export function SheetTypeIllustration({ sheetType, className }: Props) {
  // Shared style tokens. Soft warm palette so the illustrations feel like a
  // designer's deck rather than a wireframe.
  const ink = '#2c2c33';
  const paper = '#fafaf6';
  const muted = '#cfcabf';
  const accent1 = '#c8b39a'; // warm tan
  const accent2 = '#a89884'; // muted brown
  const accent3 = '#dfd5c9'; // light bone
  const accent4 = '#8a7d6e'; // deep mocha
  const red = '#c4413a';

  const svg = (() => {
    switch (sheetType) {
      case 'material_board':
        return (
          <>
            {/* 4×2 chip grid */}
            {Array.from({ length: 8 }).map((_, i) => {
              const col = i % 4;
              const row = Math.floor(i / 4);
              const palette = [accent1, accent2, accent3, accent4, accent2, accent1, accent4, accent3];
              return (
                <g key={i}>
                  <rect
                    x={20 + col * 70} y={20 + row * 90}
                    width={60} height={75}
                    fill={palette[i]} stroke={ink} strokeWidth={0.8}
                  />
                  <rect
                    x={22 + col * 70} y={70 + row * 90}
                    width={50} height={3} fill={ink} opacity={0.7}
                  />
                  <rect
                    x={22 + col * 70} y={77 + row * 90}
                    width={36} height={2} fill={ink} opacity={0.4}
                  />
                  <rect
                    x={22 + col * 70} y={82 + row * 90}
                    width={42} height={1.5} fill={ink} opacity={0.3}
                  />
                </g>
              );
            })}
          </>
        );

      case 'color_palette':
        return (
          <>
            {/* 4 large color swatches in a row */}
            {[accent1, accent4, accent2, accent3].map((c, i) => (
              <g key={i}>
                <rect x={20 + i * 70} y={20} width={60} height={130} fill={c} />
                <rect x={20 + i * 70} y={155} width={50} height={3} fill={ink} />
                <rect x={20 + i * 70} y={163} width={40} height={2} fill={ink} opacity={0.5} />
              </g>
            ))}
          </>
        );

      case 'concept_board':
        return (
          <>
            {/* 3×2 image collage */}
            {Array.from({ length: 6 }).map((_, i) => {
              const col = i % 3;
              const row = Math.floor(i / 3);
              return (
                <g key={i}>
                  <rect
                    x={20 + col * 95} y={20 + row * 80}
                    width={85} height={70}
                    fill={[accent3, accent2, accent1, accent4, accent2, accent3][i]}
                    stroke={ink} strokeWidth={0.5}
                  />
                  {/* Mountains/horizon lines */}
                  <path
                    d={`M${20 + col * 95},${65 + row * 80} L${50 + col * 95},${50 + row * 80} L${75 + col * 95},${60 + row * 80} L${105 + col * 95},${55 + row * 80} L${105 + col * 95},${90 + row * 80} L${20 + col * 95},${90 + row * 80} Z`}
                    fill={ink} opacity={0.15}
                  />
                  <circle cx={50 + col * 95} cy={35 + row * 80} r={4} fill={ink} opacity={0.2} />
                </g>
              );
            })}
          </>
        );

      case 'lighting_plan':
        return (
          <>
            {/* Floor plan rectangle (top-down) */}
            <rect x={20} y={30} width={210} height={130} fill={paper} stroke={ink} strokeWidth={1.5} />
            {/* Interior walls */}
            <line x1={120} y1={30} x2={120} y2={90} stroke={ink} strokeWidth={1} />
            <line x1={20} y1={90} x2={120} y2={90} stroke={ink} strokeWidth={1} />
            {/* Door swings */}
            <path d={`M105,90 A15,15 0 0 1 120,75`} fill="none" stroke={ink} strokeWidth={0.5} strokeDasharray="2,2" />
            {/* Fixtures: ⊕ recessed, ● pendant, ◐ wall, etc. */}
            <g>
              {/* Recessed downlights */}
              {[[60, 55], [90, 55], [60, 130], [90, 130], [180, 60], [200, 100]].map(([x, y], i) => (
                <g key={'r' + i}>
                  <circle cx={x} cy={y} r={5} fill={paper} stroke={ink} strokeWidth={0.8} />
                  <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={ink} strokeWidth={0.6} />
                  <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke={ink} strokeWidth={0.6} />
                </g>
              ))}
              {/* Pendant ● */}
              <circle cx={70} cy={90} r={6} fill={ink} />
              {/* Wall sconce ◐ */}
              <g transform="translate(20,140)">
                <circle r={5} fill={paper} stroke={ink} strokeWidth={0.8} />
                <rect x={-5} y={-5} width={5} height={10} fill={ink} />
              </g>
            </g>
            {/* Legend on the right */}
            <line x1={235} y1={30} x2={235} y2={170} stroke={muted} strokeWidth={0.5} />
            <text x={245} y={45} fontSize={6} fill={ink} fontWeight="bold">LEGEND</text>
            {[
              ['⊕', 'Recessed'],
              ['●', 'Pendant'],
              ['◐', 'Wall'],
              ['◇', 'Spot'],
            ].map(([sym, label], i) => (
              <text key={i} x={245} y={60 + i * 12} fontSize={5} fill={ink}>
                {sym}  {label}
              </text>
            ))}
          </>
        );

      case 'annotated_render':
        return (
          <>
            {/* Render area on left 65% */}
            <rect x={20} y={20} width={170} height={140} fill={accent3} stroke={ink} strokeWidth={0.5} />
            {/* "Room" — floor + walls + objects */}
            <path d="M20,140 L190,140 L190,110 L20,120 Z" fill={accent2} opacity={0.5} />
            <rect x={50} y={75} width={45} height={45} fill={accent4} opacity={0.7} />
            <circle cx={140} cy={110} r={18} fill={accent1} opacity={0.8} />
            {/* Callout dots + leader lines */}
            {[
              [70, 95, 230, 50],
              [140, 105, 230, 90],
              [120, 130, 230, 130],
            ].map(([ax, ay, lx, ly], i) => (
              <g key={i}>
                <line x1={ax} y1={ay} x2={lx - 28} y2={ly} stroke={ink} strokeWidth={0.6} />
                <circle cx={ax} cy={ay} r={2.5} fill={red} />
                <rect x={lx - 28} y={ly - 5} width={28} height={10} fill={paper} stroke={ink} strokeWidth={0.4} />
                <text x={lx - 26} y={ly + 2} fontSize={4} fill={ink}>Item {i + 1}</text>
              </g>
            ))}
            {/* Right legend with chips */}
            <text x={210} y={28} fontSize={6} fontWeight="bold" fill={ink}>MATERIAL SELECTION</text>
            {[accent1, accent4, accent2].map((c, i) => (
              <g key={i}>
                <rect x={210} y={40 + i * 38} width={20} height={20} fill={c} />
                <rect x={234} y={43 + i * 38} width={28} height={2.5} fill={ink} opacity={0.7} />
                <rect x={234} y={49 + i * 38} width={20} height={1.8} fill={ink} opacity={0.4} />
                <rect x={234} y={53 + i * 38} width={26} height={1.8} fill={ink} opacity={0.4} />
              </g>
            ))}
          </>
        );

      case 'elevation_render_pair':
        return (
          <>
            {/* Top: Elevation */}
            <text x={20} y={18} fontSize={5} fill={ink} fontWeight="bold">ELEVATION</text>
            <rect x={20} y={22} width={210} height={70} fill={paper} stroke={ink} strokeWidth={0.6} />
            {/* Cabinetry-style elevation */}
            <rect x={30} y={30} width={50} height={30} fill={accent3} stroke={ink} strokeWidth={0.4} />
            <rect x={85} y={30} width={50} height={30} fill={accent1} stroke={ink} strokeWidth={0.4} />
            <rect x={140} y={30} width={50} height={30} fill={accent3} stroke={ink} strokeWidth={0.4} />
            <rect x={195} y={30} width={28} height={55} fill={accent4} stroke={ink} strokeWidth={0.4} />
            <rect x={30} y={62} width={160} height={23} fill={accent2} stroke={ink} strokeWidth={0.4} />
            {/* Dimensions */}
            <line x1={30} y1={88} x2={190} y2={88} stroke={red} strokeWidth={0.6} />
            <line x1={30} y1={86} x2={30} y2={90} stroke={red} strokeWidth={0.6} />
            <line x1={190} y1={86} x2={190} y2={90} stroke={red} strokeWidth={0.6} />
            <text x={95} y={87} fontSize={4} fontWeight="bold" fill={ink}>2725 mm</text>
            <line x1={30} y1={30} x2={30} y2={60} stroke={red} strokeWidth={0.5} />
            <text x={20} y={47} fontSize={4} fontWeight="bold" fill={ink}>900</text>
            {/* Bottom: Render */}
            <text x={20} y={108} fontSize={5} fill={ink} fontWeight="bold">RENDER</text>
            <rect x={20} y={112} width={210} height={50} fill={accent3} stroke={ink} strokeWidth={0.6} />
            <path d="M20,162 L230,162 L230,140 L20,148 Z" fill={accent2} opacity={0.5} />
            <rect x={70} y={120} width={70} height={30} fill={accent4} opacity={0.7} />
            <rect x={150} y={120} width={50} height={35} fill={accent1} opacity={0.7} />
          </>
        );

      case 'ffe_schedule':
        return (
          <>
            {/* Table header */}
            <rect x={20} y={25} width={210} height={14} fill={accent3} />
            {['#', 'Room', 'Item', 'Dim.', 'Inst.', 'Del.', 'Qty', 'Price'].map((h, i) => (
              <text key={i} x={24 + i * 27} y={34} fontSize={4} fontWeight="bold" fill={ink}>{h}</text>
            ))}
            {/* Rows */}
            {Array.from({ length: 7 }).map((_, r) => (
              <g key={r}>
                {r % 2 === 0 && (
                  <rect x={20} y={42 + r * 14} width={210} height={14} fill={paper} opacity={0.6} />
                )}
                {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => {
                  const widths = [4, 12, 22, 14, 12, 10, 5, 10];
                  return (
                    <rect
                      key={c}
                      x={24 + c * 27}
                      y={48 + r * 14}
                      width={widths[c]}
                      height={2}
                      fill={ink}
                      opacity={0.45}
                    />
                  );
                })}
              </g>
            ))}
          </>
        );

      case 'full_deck':
        return (
          <>
            {/* Stacked-pages effect */}
            <rect x={36} y={36} width={195} height={130} fill={accent3} stroke={ink} strokeWidth={0.5} opacity={0.6} />
            <rect x={28} y={28} width={195} height={130} fill={accent1} stroke={ink} strokeWidth={0.5} opacity={0.8} />
            <rect x={20} y={20} width={195} height={130} fill={paper} stroke={ink} strokeWidth={1} />
            {/* Cover content */}
            <text x={32} y={70} fontSize={14} fontWeight="bold" fill={ink}>PROJECT</text>
            <text x={32} y={84} fontSize={14} fontWeight="bold" fill={ink}>TITLE</text>
            <line x1={32} y1={92} x2={120} y2={92} stroke={ink} strokeWidth={0.6} />
            <text x={32} y={108} fontSize={5} fill={ink} opacity={0.7}>Client preview deck</text>
            <text x={32} y={116} fontSize={5} fill={ink} opacity={0.7}>and material schedule</text>
            <text x={32} y={140} fontSize={4} fontWeight="bold" fill={ink}>PREPARED FOR</text>
            <text x={32} y={147} fontSize={4} fill={ink}>Client Name</text>
            {/* Page count badge */}
            <text x={195} y={148} fontSize={4} fill={ink} opacity={0.5}>1 / N</text>
          </>
        );

      default:
        return null;
    }
  })();

  return (
    <svg
      viewBox="0 0 250 180"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ background: paper, width: '100%', height: '100%', display: 'block' }}
    >
      {svg}
    </svg>
  );
}
