import type { SettingsResponse, TerminalCompletionNotificationSettings } from "@/lib/types";

export function terminalCompletionNotificationSettings(settings?: SettingsResponse["notifications"] | null): Required<TerminalCompletionNotificationSettings> {
  const terminalCompletion = settings?.terminalCompletion || {};
  return {
    enabled: terminalCompletion.enabled !== false,
    onlyWhenUnfocused: terminalCompletion.onlyWhenUnfocused !== false,
    sound: terminalCompletion.sound !== false,
  };
}
