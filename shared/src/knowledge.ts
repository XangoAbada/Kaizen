/**
 * The fixed set of knowledge-base sections. Single source of truth for the agent prompts
 * (server) and the Knowledge tab (web), which shows every section from the start — filled
 * ones and not-yet-generated placeholders alike.
 *
 * Rule for every section: FACTS ONLY. No recommendations, ideas or guesses.
 */
export interface KnowledgeSection {
  /** Bare `.md` filename inside the project's knowledge dir. */
  filename: string;
  title: string;
  /** What belongs in this section — used both as the prompt's brief and the UI placeholder subtitle. */
  brief: string;
}

export const KNOWLEDGE_SECTIONS: KnowledgeSection[] = [
  {
    filename: '00-overview.md',
    title: 'Overview',
    brief:
      'What the application is, the problem it solves, who uses it, and what state it is in right now.',
  },
  {
    filename: '10-screens.md',
    title: 'Screens & navigation',
    brief:
      'Every screen/view/page: what is on it, which actions it offers, and how the user moves between screens.',
  },
  {
    filename: '20-features.md',
    title: 'Features & behavior',
    brief:
      'What the user can actually do; step-by-step flows and the rules the code really enforces.',
  },
  {
    filename: '30-data-model.md',
    title: 'Data model',
    brief:
      'Entities, fields, relations and states; database schema, migrations, and where data physically lives.',
  },
  {
    filename: '40-architecture.md',
    title: 'Architecture',
    brief:
      'Modules, layers, data flow, the patterns actually used, and the boundaries between responsibilities.',
  },
  {
    filename: '50-code-map.md',
    title: 'Code map',
    brief: 'Directories and key files — what lives where and what each part is responsible for.',
  },
  {
    filename: '60-api-surface.md',
    title: 'Interfaces',
    brief: 'HTTP endpoints, CLI commands, events and jobs, with their input/output contracts.',
  },
  {
    filename: '70-tech-stack.md',
    title: 'Tech stack',
    brief: 'Languages, frameworks and libraries, and the concrete role each one plays here.',
  },
  {
    filename: '80-integrations.md',
    title: 'External integrations',
    brief: 'Third-party services, protocols, authentication, and the configuration they require.',
  },
  {
    filename: '90-run-and-config.md',
    title: 'Running & configuration',
    brief: 'Entry points, commands, environment variables, build and deployment.',
  },
  {
    filename: '95-testing.md',
    title: 'Testing',
    brief: 'Which tests exist, how to run them, and what they cover.',
  },
];

export const KNOWLEDGE_FILENAMES: string[] = KNOWLEDGE_SECTIONS.map((s) => s.filename);

export function knowledgeSection(filename: string): KnowledgeSection | null {
  return KNOWLEDGE_SECTIONS.find((s) => s.filename === filename) ?? null;
}
