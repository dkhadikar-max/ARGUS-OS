import type { ComponentPropsWithoutRef } from "react";

// Design System Pass (2026-08-01) -- the literal string
// "rounded-lg border border-gray-200 bg-white ..." (or a dashed/error
// sibling) was hand-typed independently 35+/9+ times across this app,
// with zero semantic disagreement between the copies. This is the shared
// primitive; padding and shadow are deliberately left out of the variant
// classes and supplied by each call site's own className, since the
// original instances varied (p-4/p-6/p-8/p-10, some with shadow-sm, some
// without) -- collapsing border/bg/rounding here without forcing spacing
// changes keeps every migrated call site visually identical to before.
// The "error" variant is the one deliberate exception: it moves off
// default Tailwind red onto the brand's `alert` token as part of this
// same pass, not preserved as-is.
export type CardVariant = "default" | "dashed" | "error";

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: "rounded-lg border border-gray-200 bg-white",
  dashed: "rounded-lg border border-dashed border-gray-300 bg-white text-center",
  error: "rounded-lg border border-alert/30 bg-alert/5 text-center",
};

export function Card({
  variant = "default",
  className,
  ...rest
}: { variant?: CardVariant } & ComponentPropsWithoutRef<"div">) {
  return <div className={`${VARIANT_CLASSES[variant]}${className ? ` ${className}` : ""}`} {...rest} />;
}
