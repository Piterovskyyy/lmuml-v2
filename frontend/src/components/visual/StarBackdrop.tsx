import { useEffect, useId, useState, type CSSProperties } from "react";
import { footballPanelPattern } from "./football-panels";
import "./star-backdrop.css";

export function StarBackdrop({ reduceMotion }: { reduceMotion: boolean }) {
  const id = useId();
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const seams = `#${id}-seams`;
  const spectrum = `url(#${id}-spectrum)`;

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    updateVisibility();
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  return (
    <div
      className="star-backdrop"
      data-reduced-motion={reduceMotion}
      data-paused={reduceMotion || !pageVisible}
      aria-hidden="true"
    >
      <div className="star-backdrop__aura" />
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        focusable="false"
      >
        <defs>
          <g id={`${id}-seams`}>
            {footballPanelPattern.seams.map(({ id, d }) => (
              <path key={id} d={d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <radialGradient id={`${id}-shade`} cx="38%" cy="32%" r="76%">
            <stop stopColor="var(--background)" stopOpacity="0" />
            <stop offset="0.52" stopColor="var(--background)" stopOpacity="0.06" />
            <stop offset="0.82" stopColor="var(--background)" stopOpacity="0.53" />
            <stop offset="1" stopColor="var(--background)" stopOpacity="0.59" />
          </radialGradient>
          <linearGradient id={`${id}-sheen`} x1="0%" y1="10%" x2="90%" y2="90%">
            <stop stopColor="var(--effect-start)" stopOpacity="0.22" />
            <stop offset="0.45" stopColor="var(--effect-middle)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--effect-end)" stopOpacity="0.34" />
          </linearGradient>
          <linearGradient
            id={`${id}-spectrum`}
            gradientUnits="userSpaceOnUse"
            x1="40"
            y1="320"
            x2="890"
            y2="910"
          >
            <stop stopColor="var(--effect-start)" />
            <stop offset="0.26" stopColor="var(--effect-middle)" />
            <stop offset="0.72" stopColor="var(--effect-end)" />
            <stop offset="1" stopColor="var(--effect-end)" />
          </linearGradient>
          <radialGradient id={`${id}-floor-blue`}>
            <stop stopColor="var(--effect-middle)" stopOpacity="0.51" />
            <stop offset="0.48" stopColor="var(--effect-middle)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--effect-middle)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-floor-violet`}>
            <stop stopColor="var(--effect-end)" stopOpacity="0.86" />
            <stop offset="0.43" stopColor="var(--effect-end)" stopOpacity="0.38" />
            <stop offset="1" stopColor="var(--effect-end)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="740" cy="747" rx="705" ry="129" fill={`url(#${id}-floor-blue)`} />
        <g transform="translate(410 -465) scale(1.22)">
          <circle cx="500" cy="500" r="500" fill="var(--background)" />
          <g className="star-backdrop__stars">
            {footballPanelPattern.stars.map(({ id, d }) => (
              <path key={id} d={d} />
            ))}
          </g>
          <g className="star-backdrop__hexagons">
            {footballPanelPattern.hexagons.map(({ id, d }) => (
              <path key={id} d={d} />
            ))}
          </g>
          <circle cx="500" cy="500" r="500" fill={`url(#${id}-sheen)`} />
          <circle cx="500" cy="500" r="500" fill={`url(#${id}-shade)`} />
          <use href={seams} stroke={spectrum} strokeWidth="9" opacity="0.14" />
          <use href={seams} stroke={spectrum} strokeWidth="1.35" opacity="0.61" />
          <circle
            className="star-backdrop__rim"
            cx="500"
            cy="500"
            r="499"
            stroke={spectrum}
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
          <path
            className="star-backdrop__rim-highlight"
            d="M24.47 345.49A500 500 0 0 0 146.45 853.55"
            stroke="var(--effect-start)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <g className="star-backdrop__trails" stroke={spectrum} strokeWidth="2.4">
            {footballPanelPattern.seams.map(({ id, d }, index) => (
              <path
                key={id}
                d={d}
                pathLength="1"
                vectorEffect="non-scaling-stroke"
                style={
                  {
                    "--trail-duration": `${11 + (index % 4) * 1.6}s`,
                    "--trail-delay": `${-index * 2.1}s`,
                  } as CSSProperties
                }
              />
            ))}
          </g>
        </g>
        <g className="star-backdrop__floor">
          <ellipse cx="1192" cy="761" rx="555" ry="116" fill={`url(#${id}-floor-violet)`} />
          <ellipse cx="1075" cy="752" rx="480" ry="16" fill={`url(#${id}-floor-blue)`} />
          <ellipse cx="1275" cy="757" rx="435" ry="12" fill={`url(#${id}-floor-violet)`} />
        </g>
      </svg>
    </div>
  );
}
