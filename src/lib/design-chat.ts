import type { UnitDesignAttachmentKind, UnitDesignChatIntent } from "@/lib/types";

const designGenerationPattern = /\b(mockups?|versions?|variants?|alternatives?|options?|candidates?|explorations?)\b|\bmore modern design\b|\bnew design\b|\bmore designs?\b|\bgenerate\b/i;
const implementPhrasePattern = /\b(exactly match|look exactly like|make .*look .*like|update .*ui|change .*ui|implement|apply .*design|make .*current ui|current ui .*match|code changes?)\b/i;
const implementSurfacePattern = /\b(update|change|make|revise|redesign|implement|apply|build)\b[\s\S]{0,80}\b(ui|screen|dashboard|page|app|interface)\b/i;

export function detectUnitDesignChatIntent(
  message: string,
  attachmentKinds: UnitDesignAttachmentKind[] = [],
): UnitDesignChatIntent {
  const text = message.trim();
  if (!text) return "generate-designs";
  if (designGenerationPattern.test(text) && !implementPhrasePattern.test(text)) {
    return "generate-designs";
  }
  if (implementPhrasePattern.test(text) || implementSurfacePattern.test(text)) {
    return "implement-ui";
  }
  if (attachmentKinds.includes("screenshot") && attachmentKinds.some((kind) => kind === "design" || kind === "upload") && /\b(match|like this|look like|copy|exactly)\b/i.test(text)) {
    return "implement-ui";
  }
  return "generate-designs";
}

export function parseDesignVariantCount(message: string, fallback = 3) {
  const match = message.match(/\b([1-4])\s+(?:more\s+)?(?:designs?|versions?|variants?|options?|candidates?)\b/i);
  if (!match) return fallback;
  return Math.min(Math.max(Number.parseInt(match[1], 10) || fallback, 1), 4);
}

export function unitDesignIntentLabel(intent: UnitDesignChatIntent) {
  return intent === "implement-ui" ? "Implement UI" : "Generate designs";
}
