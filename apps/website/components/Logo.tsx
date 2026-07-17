"use client";

// ARGUS OS Brand Guidelines v1.0 §1 "The Mark" -- the Argus V, a convergent
// mark: two arms meet at a single point, the verdict. Left arm (teal) =
// raw data/evidence streaming in; right arm (white) = clarity/judgment;
// core convergence = the verdict itself. Geometry and gradients copied
// verbatim from the brand package's argus_v_logo_primary.svg (minus its
// own standalone background rect, since this renders inline on whatever
// background it's placed on -- Navigation/Footer usage, not a boxed icon).
export function Logo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 500 500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="argusVTeal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00F5E8" />
          <stop offset="50%" stopColor="#00D1C8" />
          <stop offset="100%" stopColor="#00A896" />
        </linearGradient>
        <linearGradient id="argusVWhite" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#E6EBF1" />
          <stop offset="100%" stopColor="#C8D0D9" />
        </linearGradient>
        <filter id="argusVTealGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="15" result="blur1" />
          <feGaussianBlur stdDeviation="5" result="blur2" />
          <feMerge>
            <feMergeNode in="blur1" />
            <feMergeNode in="blur2" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="argusVWhiteGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Left arm: teal, evidence */}
      <polygon points="250,400 130,120 170,120 250,340" fill="url(#argusVTeal)" filter="url(#argusVTealGlow)" />
      {/* Right arm: white, judgment */}
      <polygon points="250,400 330,120 370,120 250,340" fill="url(#argusVWhite)" filter="url(#argusVWhiteGlow)" />
      {/* Arm shading for depth */}
      <polygon points="250,400 130,120 145,120 250,360" fill="#000000" opacity="0.15" />
      <polygon points="250,400 370,120 355,120 250,360" fill="#000000" opacity="0.15" />
      {/* Core convergence: the verdict */}
      <circle cx="250" cy="400" r="20" fill="#00F5E8" opacity="0.4" filter="url(#argusVTealGlow)" />
      <circle cx="250" cy="400" r="8" fill="#FFFFFF" opacity="0.95" filter="url(#argusVWhiteGlow)" />
    </svg>
  );
}
