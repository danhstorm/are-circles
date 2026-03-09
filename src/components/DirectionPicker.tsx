'use client';

import { useRef, useCallback } from 'react';

interface Props {
  value: number;
  onChange: (radians: number) => void;
}

export default function DirectionPicker({ value, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePointer = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
      onChange(angle);
    },
    [onChange],
  );

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    handlePointer(e);
  };

  const dx = Math.cos(value) * 20;
  const dy = Math.sin(value) * 20;
  const handleX = 28 + Math.cos(value) * 22;
  const handleY = 28 + Math.sin(value) * 22;

  return (
    <svg
      ref={svgRef}
      width="56"
      height="56"
      viewBox="0 0 56 56"
      onPointerDown={onDown}
      onPointerMove={(e) => {
        if (e.buttons > 0) handlePointer(e);
      }}
      className="cursor-pointer shrink-0"
    >
      <circle cx="28" cy="28" r="24" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <line x1="28" y1="28" x2={28 + dx} y2={28 + dy} stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />
      <circle cx={handleX} cy={handleY} r="5" fill="rgba(255,255,255,0.7)" />
    </svg>
  );
}
