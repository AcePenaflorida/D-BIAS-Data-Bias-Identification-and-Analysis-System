import React, { useEffect, useState } from 'react';

interface FairnessDonutProps {
  score: number; // 0 - 100
  size?: number;
  strokeWidth?: number;
  showCenterText?: boolean;
}

function getColorForScore(score: number) {
  if (score >= 90) return '#16a34a'; // green
  if (score >= 75) return '#a3e635'; // lime
  if (score >= 50) return '#f59e0b'; // amber
  return '#ef4444'; // red
}

export default function FairnessDonut({ score, size = 88, strokeWidth = 10, showCenterText = true }: FairnessDonutProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const offset = circumference * (1 - pct / 100);
  const color = getColorForScore(pct);
  const trackColor = '#e6e6e9';
  const [animatedOffset, setAnimatedOffset] = useState(circumference);

  useEffect(() => {
    // animate from full-empty to the target offset
    // start from circumference (empty) then transition to offset
    // small delay so browser picks up initial state
    setAnimatedOffset(circumference);
    const t = setTimeout(() => setAnimatedOffset(offset), 30);
    return () => clearTimeout(t);
  }, [offset, circumference]);

  return (
    <div className="flex items-center justify-center" role="img" aria-label={`Fairness score ${pct} percent`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          <circle
            r={radius}
            cx={0}
            cy={0}
            fill="transparent"
            stroke={trackColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <circle
            r={radius}
            cx={0}
            cy={0}
            fill="transparent"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={animatedOffset}
            strokeLinecap="round"
            transform="rotate(-90)"
            style={{ transition: 'stroke-dashoffset 800ms ease' }}
          />
          {showCenterText && (
            <text x={0} y={4} textAnchor="middle" fontSize={size * 0.22} fill="#0f172a" className="font-medium">
              {pct}
              <tspan fontSize={size * 0.12} fill="#475569">%</tspan>
            </text>
          )}
        </g>
      </svg>
    </div>
  );
}
