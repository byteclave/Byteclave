type BrandMotionMode = "INTRO" | "LOADING" | "INSPECTION" | "TRANSITION" | "MINIMAL";

type BrandMotionProps = {
  mode?: BrandMotionMode;
  label?: string;
  className?: string;
};

const modeClass: Record<BrandMotionMode, string> = {
  INTRO: "intro",
  LOADING: "loading",
  INSPECTION: "inspection",
  TRANSITION: "transition",
  MINIMAL: "minimal",
};

export function BrandMotion({ mode = "MINIMAL", label = "ByteClave mark", className = "" }: BrandMotionProps) {
  return (
    <span className={`brand-motion brand-motion--${modeClass[mode]} ${className}`.trim()} aria-label={label} role="img">
      <img src="/byteclave-logo.svg" alt="" />
    </span>
  );
}
