// Modular prompt composition service
// Layered system: Core → Voyage → User → Tools → Context
// DSPy-compatible: pure functions, structured data

export * from "./types";
export { CORE_PROMPT, CORE_PROMPT_TOKENS } from "./core";
export {
  DEFAULT_VOYAGE_CONFIG,
  DEFAULT_USER_PROFILE,
  DEFAULT_COMPOSER_OPTIONS,
  VOYAGE_PRESET_ENGINEERING,
  VOYAGE_PRESET_CREATIVE,
  VOYAGE_PRESET_ENTERPRISE,
  mergeVoyageConfig,
  mergeUserProfile,
} from "./defaults";
export * from "./format";
export { mergeGraphStandingPreferences } from "./graph-standing";
export { composePrompt, type ComposeInput } from "./compose";
export {
  composeSystemPrompt,
  getBasePrompt,
  type AuthState,
  type ChatUserProfile,
} from "./system";
