import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GridBeam, type GridBeamColorScheme, type GridBeamPaletteKey } from "@/components/ui/grid-beam";
import { cn } from "@/lib/utils";

export const GridBeamRuntimeContext = createContext<{ prefersReducedMotion: boolean; theme: GridBeamColorScheme }>({
  prefersReducedMotion: false,
  theme: "light",
});


export function BeamSurface({
  active = true,
  borderRadius = 8,
  breathe = true,
  children,
  className,
  colorVariant = "mono",
  cols = 4,
  contentClassName,
  dividerStroke,
  duration = 5,
  rows = 3,
  strength = 0.32,
}: {
  active?: boolean;
  borderRadius?: number;
  breathe?: boolean;
  children: ReactNode;
  className?: string;
  colorVariant?: GridBeamPaletteKey;
  cols?: number;
  contentClassName?: string;
  dividerStroke?: string;
  duration?: number;
  rows?: number;
  strength?: number;
}) {
  const { prefersReducedMotion, theme } = useContext(GridBeamRuntimeContext);
  return (
    <GridBeam
      active={active && !prefersReducedMotion}
      borderRadius={borderRadius}
      breathe={breathe}
      className={className}
      colorVariant={colorVariant}
      cols={cols}
      contentClassName={contentClassName}
      dividerStroke={dividerStroke}
      duration={duration}
      rows={rows}
      strength={strength}
      theme={theme}
    >
      <div className={cn("relative", contentClassName)}>{children}</div>
    </GridBeam>
  );
}

export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return prefersReducedMotion;
}

export function useDocumentGridBeamTheme(): GridBeamColorScheme {
  const [scheme, setScheme] = useState<GridBeamColorScheme>(() => documentGridBeamTheme());
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setScheme(documentGridBeamTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributeFilter: ["style", "class"], attributes: true });
    return () => observer.disconnect();
  }, []);
  return scheme;
}

export function documentGridBeamTheme(): GridBeamColorScheme {
  const root = document.documentElement;
  return root.classList.contains("dark") || root.style.colorScheme === "dark" ? "dark" : "light";
}
