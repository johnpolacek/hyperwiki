import type { LayoutResponse, ThinkingEffort } from "@/lib/types";

export const defaultThinkingEffort: ThinkingEffort = "low";

export type AgentProviderAvailability = { codexAvailable: boolean; claudeAvailable: boolean };
export type AgentProviderId = "codex" | "claude";

export function defaultAgentCommand(providers?: AgentProviderAvailability) {
  // Detection only changes the default for new/unconfigured panels. Codex stays
  // the default when both CLIs are present (back-compat); fall back to Claude
  // only when it is the sole installed agent.
  if (providers && !providers.codexAvailable && providers.claudeAvailable) {
    return "claude --dangerously-skip-permissions";
  }
  return "codex --yolo";
}

export function agentLaunchCommand(layout: LayoutResponse | null, effort: ThinkingEffort = defaultThinkingEffort, providers?: AgentProviderAvailability) {
  const command = layout?.panels?.find((panel) => panel.role === "agent" || panel.name === "agent")?.command?.trim() || defaultAgentCommand(providers);
  return codexCommandWithThinkingEffort(command, effort);
}

export function importAgentLaunchCommand(layout: LayoutResponse | null) {
  const command = agentLaunchCommand(layout, defaultThinkingEffort);
  if (!/^\s*(?:[\w./-]+\/)?codex(?:\s|$)/.test(command)) return command;
  const withoutExistingModel = command
    .replace(/\s+-m\s+\S+/g, "")
    .replace(/\s+--model\s+\S+/g, "")
    .replace(codexModelReasoningEffortFlagPattern, "")
    .replace(codexPlanModeReasoningEffortFlagPattern, "")
    .trim();
  return `${withoutExistingModel} -m gpt-5.5 -c 'model_reasoning_effort="low"' -c 'plan_mode_reasoning_effort="low"'`;
}

export function codexCommandWithThinkingEffort(command: string, effort: ThinkingEffort) {
  if (!/^\s*(?:[\w./-]+\/)?codex(?:\s|$)/.test(command)) return command;
  const normalized = normalizedThinkingEffort(effort);
  const withoutExistingEffort = command
    .replace(codexModelReasoningEffortFlagPattern, "")
    .replace(codexPlanModeReasoningEffortFlagPattern, "")
    .trim();
  return `${withoutExistingEffort} -c 'model_reasoning_effort="${normalized}"' -c 'plan_mode_reasoning_effort="${normalized}"'`;
}

export const codexModelReasoningEffortFlagPattern = /\s+-c\s+(['"]?)model_reasoning_effort=(?:"[^"]*"|'[^']*'|[^\s'"]+)\1/g;
export const codexPlanModeReasoningEffortFlagPattern = /\s+-c\s+(['"]?)plan_mode_reasoning_effort=(?:"[^"]*"|'[^']*'|[^\s'"]+)\1/g;

// Claude Code has no Codex-style reasoning-effort flags, so its launch command
// passes through unchanged. Kept as a named parallel to the Codex helper.
export function claudeCommandWithThinkingEffort(command: string, _effort: ThinkingEffort) {
  if (!/^\s*(?:[\w./-]+\/)?claude(?:\s|$)/.test(command)) return command;
  return command;
}

export function agentProviderFromCommand(command?: string | null): AgentProviderId {
  const token = (command || "").trim().split(/\s+/)[0] || "";
  const base = token.split(/[\\/]/).pop() || token;
  return base === "claude" ? "claude" : "codex";
}

export function layoutAgentProvider(layout: LayoutResponse | null): AgentProviderId {
  const command = layout?.panels?.find((panel) => panel.role === "agent" || panel.name === "agent")?.command;
  return agentProviderFromCommand(command);
}

export function normalizedThinkingEffort(value: string | null | undefined): ThinkingEffort {
  const normalized = String(value || "low").trim().toLowerCase();
  return ["low", "medium", "high", "xhigh"].includes(normalized) ? normalized as ThinkingEffort : "low";
}
