export type PluginCategory =
  | "focus_strategy"
  | "learning"
  | "vitality"
  | "creative"
  | "mindset";

export interface PluginDefinition {
  id: string;
  name: string;
  category: PluginCategory;
  description: string;
  expectedTrade: string;
  promptGuidance: string;
  defaultConfig?: Record<string, unknown>;
}

export const BUILTIN_PLUGINS: Record<string, PluginDefinition> = {
  "monotropic-flow": {
    id: "monotropic-flow",
    name: "Monotropic Deep Flow",
    category: "focus_strategy",
    description:
      "Protects single-task hyperfocus. Eliminates arbitrary 25-min stops. Matches work to biological energy reserves rather than clock time.",
    expectedTrade: "Focus + Facts -> High-leverage Funds. Energy +2 to +4.",
    promptGuidance:
      "The user is operating under Monotropic Flow. Never interrupt when in flow. Emphasize depth over task-switching. Keep checklists minimal.",
  },
  "strict-pomodoro": {
    id: "strict-pomodoro",
    name: "Strict Pomodoro 25/5",
    category: "focus_strategy",
    description:
      "Classic timeboxed execution. 25 minutes uninterrupted sprint, 5 minutes mandatory rest. Good for grinding through resistance.",
    expectedTrade: "Focus -> Incremental Facts. Prevents mental fatigue on tedious tasks.",
    promptGuidance:
      "Enforce 25-minute sprints. Prioritize rapid closure of sub-tasks. Remind the user to take a 5-minute physical break after every block.",
  },
  "plyo-vitality": {
    id: "plyo-vitality",
    name: "Plyometrics & CNS Reset",
    category: "vitality",
    description:
      "Explosive 15-minute bodyweight jump training (jump squats, skater hops, bounds). Reboots the nervous system and triggers BDNF.",
    expectedTrade: "Funds (Health) -> Focus. Recharges physical vitality and mental clarity.",
    promptGuidance:
      "Encourage 15-minute high-intensity plyometric micro-doses 2-3x per week. Track energy rebound post-workout.",
  },
  "dancercise-groove": {
    id: "dancercise-groove",
    name: "Dancercise & Fluid Intellect",
    category: "vitality",
    description:
      "Freestyle musical movement combining cardio, sensorimotor coordination, and musical reward. Builds neuroplasticity in the hippocampus.",
    expectedTrade: "Vitality + Creativity -> Cognitive Flexibility.",
    promptGuidance:
      "Promote 10-15 minute freestyle dance breaks between cognitive sprints to engage the default mode network and loosen mental blocks.",
  },
  "feynman-learner": {
    id: "feynman-learner",
    name: "Feynman Meta-Learner",
    category: "learning",
    description:
      "Explain complex technical concepts in plain, kindergarten English. Uncovers illusions of competence and builds durable mental models.",
    expectedTrade: "Funds (Compute/Books) + Focus -> Permanent Facts.",
    promptGuidance:
      "When the user logs knowledge, prompt them to explain the mechanism simply. Identify any buzzwords hiding shallow understanding.",
  },
  "hopecore-maker": {
    id: "hopecore-maker",
    name: "Hopecore & Radical Sincerity",
    category: "mindset",
    description:
      "Rejects cynicism and doomscrolling. Celebrates the indomitable human spirit, banks micro-wins, and builds with genuine passion.",
    expectedTrade: "Feedback -> Psychological Resilience.",
    promptGuidance:
      "Reinforce positive momentum. Celebrate small wins. Keep tone earnest, grounded, and anti-cynical.",
  },
  "dopamine-sabbath": {
    id: "dopamine-sabbath",
    name: "Dopamine Sabbath (Stimulus Control)",
    category: "mindset",
    description:
      "Behavioral stimulus control. Cuts out variable-reward infinite scroll, noisy feeds, and hyper-stimulation to re-sensitize attention.",
    expectedTrade: "Temporary Friction -> Restored Attention Span.",
    promptGuidance:
      "Support quiet, low-stimulation periods. Encourage reading physical books, walking without headphones, and analog journaling.",
  },
  "weird-sandbox": {
    id: "weird-sandbox",
    name: "The Weird Sandbox (Pure Art)",
    category: "creative",
    description:
      "A protected play zone for music synthesis, film editing, quirky instruments, and unmonetized artistic expression.",
    expectedTrade: "Focus -> Aesthetic Expression & Soul Recovery.",
    promptGuidance:
      "Encourage zero-commercialization artistic play. Value quirkiness, non-linear thinking, and aesthetic experimentation.",
  },
};
