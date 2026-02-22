/**
 * Tool definitions for agentic chat (Function Calling).
 * Defined in OpenAI-compatible format but used via prompt-based approach
 * to avoid modifying all 4 LLM providers.
 */

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameterProperty>;
      required: string[];
    };
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_logcat',
      description:
        'Search logcat entries by keyword, tag, log level, or time range. Returns matching log lines with timestamps, PIDs, and messages.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Search keyword to match in message or tag (case-insensitive)',
          },
          tag: {
            type: 'string',
            description: 'Filter by exact logcat tag name (e.g., "ActivityManager", "WindowManager")',
          },
          level: {
            type: 'string',
            description: 'Minimum log level to include',
            enum: ['V', 'D', 'I', 'W', 'E', 'F'],
          },
          pid: {
            type: 'number',
            description: 'Filter by process ID',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default 20, max 50)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_thread_info',
      description:
        'Get detailed thread information from ANR traces, including stack trace, thread state, lock info, and blocking chain. Useful for investigating ANR root causes.',
      parameters: {
        type: 'object',
        properties: {
          process_name: {
            type: 'string',
            description: 'Process name to search in ANR traces (e.g., "system_server", "com.example.app")',
          },
          thread_name: {
            type: 'string',
            description: 'Thread name to look up (e.g., "main", "Binder:1234_5", "android.fg")',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_kernel_events',
      description:
        'Get kernel events filtered by type. Returns kernel log events such as OOM kills, thermal throttling, driver errors, SELinux denials, and more.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Event type to filter by',
            enum: [
              'kernel_panic',
              'oom_kill',
              'lowmemory_killer',
              'kswapd_active',
              'driver_error',
              'gpu_error',
              'thermal_shutdown',
              'thermal_throttling',
              'watchdog_reset',
              'storage_io_error',
              'suspend_resume_error',
              'selinux_denial',
            ],
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default 20, max 50)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_insight_detail',
      description:
        'Get the full details of a specific insight by its ID, including severity, description, stack traces, log snippets, and deep analysis results if available.',
      parameters: {
        type: 'object',
        properties: {
          insight_id: {
            type: 'string',
            description: 'The insight ID (e.g., "insight-1", "insight-2")',
          },
        },
        required: ['insight_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_section',
      description:
        'Search raw bugreport sections by name or content keyword. Useful for finding dumpsys output, system properties, device info, or other diagnostic data not covered by other tools.',
      parameters: {
        type: 'object',
        properties: {
          section_name: {
            type: 'string',
            description: 'Section name to search for (partial match, case-insensitive). E.g., "SYSTEM PROPERTIES", "DUMPSYS", "KERNEL"',
          },
          keyword: {
            type: 'string',
            description: 'Keyword to search within section content (case-insensitive)',
          },
          limit: {
            type: 'number',
            description: 'Maximum content length to return per section in characters (default 2000, max 5000)',
          },
        },
        required: [],
      },
    },
  },
];

/**
 * Build tool description text for inclusion in the LLM system prompt.
 * Uses a structured format that most LLMs can parse reliably.
 */
export function buildToolSystemPrompt(): string {
  const toolDescriptions = TOOL_DEFINITIONS.map((t) => {
    const f = t.function;
    const params = Object.entries(f.parameters.properties)
      .map(([key, prop]) => {
        const required = f.parameters.required.includes(key) ? ' (required)' : '';
        const enumValues = prop.enum ? ` [options: ${prop.enum.join(', ')}]` : '';
        return `    - ${key} (${prop.type}${required}): ${prop.description}${enumValues}`;
      })
      .join('\n');
    return `  - **${f.name}**: ${f.description}\n    Parameters:\n${params}`;
  }).join('\n\n');

  return `## Available Investigation Tools

You can investigate the bugreport data further by calling tools. To call a tool, respond with ONLY a tool call block in this exact format:

\`\`\`tool_call
{"name": "tool_name", "arguments": {"param1": "value1"}}
\`\`\`

Available tools:
${toolDescriptions}

IMPORTANT RULES:
- If you need more data to answer the question, use a tool call.
- If you already have enough information from the context above, respond directly WITHOUT using a tool.
- When using a tool, your ENTIRE response must be ONLY the tool_call code block. Do not add any other text.
- After receiving tool results, you may call another tool or provide your final answer.
- You can make up to 5 tool calls per conversation turn.`;
}
