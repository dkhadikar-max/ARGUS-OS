"use client";

export function Logo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer eye - the Panoptes */}
      <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" />
      {/* Inner iris */}
      <circle cx="14" cy="14" r="8" stroke="currentColor" strokeWidth="1" />
      {/* Pupil - the decision point */}
      <circle cx="14" cy="14" r="4" fill="currentColor" opacity="0.8" />
      {/* The 8 rays - Argus's 100 eyes, abstracted */}
      <path
        d="M14 2 L14 6 M14 22 L14 26 M2 14 L6 14 M22 14 L26 14"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M6.5 6.5 L9 9 M19 19 L21.5 21.5 M21.5 6.5 L19 9 M9 19 L6.5 21.5"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}
