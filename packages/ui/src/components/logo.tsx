import { useId } from "react";
import { cn } from "../cn";

/**
 * Logo Jarvis Ops — turunan identitas Jarvis: siluet belah ketupat dari dua chevron merah
 * bersudut tajam, dengan garis denyut (monitoring) di tengah.
 */
export function LogoMark({ className, pulseClassName }: { className?: string; pulseClassName?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 48 48" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f43f3f" />
          <stop offset="1" stopColor="#b91c1c" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ef4444" />
          <stop offset="1" stopColor="#991b1b" />
        </linearGradient>
      </defs>
      <path d="M21 3 L3 24 L21 45 L21 36.5 L10.5 24 L21 11.5 Z" fill={`url(#${id}-a)`} />
      <path d="M27 3 L45 24 L27 45 L27 36.5 L37.5 24 L27 11.5 Z" fill={`url(#${id}-b)`} />
      <path
        d="M12.5 24 H18 L21 18.5 L25.5 30 L28.8 24 H35.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("text-slate-900", pulseClassName)}
      />
    </svg>
  );
}

export function Logo({
  className,
  tone = "light",
  subtitle = true,
}: {
  className?: string;
  /** light = di atas latar terang, dark = di atas latar gelap */
  tone?: "light" | "dark";
  subtitle?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-9 shrink-0" pulseClassName={tone === "dark" ? "text-white" : "text-slate-900"} />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-extrabold tracking-[0.06em]">
          <span className={tone === "dark" ? "text-white" : "text-slate-900"}>JARVIS</span>
          <span className="ml-1.5 text-brand-600">OPS</span>
        </span>
        {subtitle && (
          <span className={cn("mt-1 text-[10px] font-medium uppercase tracking-[0.22em]", tone === "dark" ? "text-slate-400" : "text-slate-500")}>
            Network & Security Operations
          </span>
        )}
      </span>
    </span>
  );
}
