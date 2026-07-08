// Tools formatter
// Pure function: ToolDefinition[] → prompt section string
// DSPy-ready: could become an optimizable module

import type { ToolDefinition } from '../types';

/**
 * Formats tool definitions into a prompt section.
 *
 * Design principles:
 * - Capability-focused: What it does, not how
 * - Usage-guided: When to use, when NOT to use
 * - Side-effect-aware: Clear about state changes
 */
export const formatTools = (tools: ToolDefinition[]): string => {
  if (tools.length === 0) {
    return '';
  }

  const sections: string[] = ['# Available Tools'];

  tools.forEach((tool) => {
    sections.push(formatTool(tool));
  });

  return sections.join('\n');
};

const formatTool = (tool: ToolDefinition): string => {
  const lines: string[] = [];

  // Tool header
  lines.push(`\n## ${tool.name}`);
  lines.push(tool.description);

  // Usage guidance
  lines.push(`\n**When to use:** ${tool.usage.when}`);
  if (tool.usage.notWhen) {
    lines.push(`**Do not use when:** ${tool.usage.notWhen}`);
  }

  // Parameters (if any)
  if (tool.parameters.length > 0) {
    lines.push('\n**Parameters:**');
    tool.parameters.forEach((param) => {
      const required = param.required ? '(required)' : '(optional)';
      lines.push(`- \`${param.name}\` ${required}: ${param.description}`);
      if (param.example) {
        lines.push(`  Example: \`${param.example}\``);
      }
    });
  }

  // Side effects warning
  if (tool.sideEffects !== 'none') {
    const sideEffectDescriptions: Record<string, string> = {
      read: 'This tool reads data but does not modify anything.',
      write: 'This tool modifies data.',
      destructive: 'This tool can permanently delete or modify data.',
    };
    lines.push(`\n**Note:** ${sideEffectDescriptions[tool.sideEffects]}`);
  }

  // Approval requirement
  if (tool.requiresApproval) {
    lines.push('**Requires explicit user approval before execution.**');
  }

  // Example usage
  if (tool.usage.example) {
    lines.push(`\n**Example:** ${tool.usage.example}`);
  }

  return lines.join('\n');
};

/**
 * Formats a minimal tool summary for token-constrained contexts.
 */
export const formatToolsSummary = (tools: ToolDefinition[]): string => {
  if (tools.length === 0) {
    return '';
  }

  const lines: string[] = ['# Available Tools'];

  tools.forEach((tool) => {
    const approval = tool.requiresApproval ? ' [requires approval]' : '';
    lines.push(`- **${tool.name}**: ${tool.description}${approval}`);
  });

  return lines.join('\n');
};

/**
 * Estimates token count for the formatted tools.
 */
export const estimateToolsTokens = (tools: ToolDefinition[]): number => {
  const formatted = formatTools(tools);
  const words = formatted.split(/\s+/).length;
  return Math.ceil(words * 0.75);
};

// ============================================================================
// COMMON TOOL DEFINITIONS
// ============================================================================

;
