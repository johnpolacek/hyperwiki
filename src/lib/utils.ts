import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DISABLE_TEXT_CORRECTION_PROPS = {
  autoCapitalize: "off",
  autoCorrect: "off",
  spellCheck: false,
} as const;

export function slugify(value: string) {
  return String(value || "work")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "work";
}

