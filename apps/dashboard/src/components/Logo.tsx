// ARGUS OS Brand Guidelines v1.0 §1 "The Mark" -- the Argus V, a convergent
// mark: two arms meet at a single point, the verdict. Left arm (teal) =
// raw data/evidence streaming in; right arm (white/navy here, since this
// renders on the dashboard's light background) = clarity/judgment; core
// convergence = the verdict itself. Same geometry as apps/website's
// Logo.tsx (duplicated, not shared -- no shared UI package exists between
// the two apps), but the "white" arm is swapped for Navy so it's visible
// on a light background instead of the marketing site's dark one.
export function Logo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 500 500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="argusVTealDash" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00F5E8" />
          <stop offset="50%" stopColor="#00D1C8" />
          <stop offset="100%" stopColor="#00A896" />
        </linearGradient>
      </defs>
      {/* Left arm: teal, evidence */}
      <polygon points="250,400 130,120 170,120 250,340" fill="url(#argusVTealDash)" />
      {/* Right arm: navy, judgment (white on the marketing site's dark bg; navy here for contrast on light) */}
      <polygon points="250,400 330,120 370,120 250,340" fill="#0A1628" />
      {/* Core convergence: the verdict */}
      <circle cx="250" cy="400" r="8" fill="#00D1C8" />
    </svg>
  );
}
