import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import { knowledgeCollection, graphsCollection } from "../db/firestore.js";
import type {
  GraphNode,
  GraphEdge,
  GraphCluster,
  KnowledgeGraph,
  KnowledgeGraphMetadata,
  GraphRelationType,
} from "./types.js";

const LOCAL_GRAPH_CACHE = path.resolve(process.cwd(), "data/knowledge_graph.json");
const CHECKPOINT_FILE = path.resolve(process.cwd(), ".reels_import_checkpoint.json");
const TELEGRAM_TRACKER_FILE = path.resolve(process.cwd(), ".telegram_vault_tracker.json");
const SAVED_POSTS_FILE = path.resolve(process.cwd(), "saved_posts.json");

// Core 4F Framework Dimensions
export const CORE_DIMENSIONS: GraphNode[] = [
  {
    id: "dim_focus",
    type: "dimension",
    label: "Focus (Time & Attention)",
    description: "Deliberate attention, flow states, distraction reduction, and cognitive depth.",
    weight: 100,
    properties: { quadrant: "Focus", tags: ["focus", "time", "flow", "attention"] },
  },
  {
    id: "dim_facts",
    type: "dimension",
    label: "Facts (Systems & Tools)",
    description: "Concrete knowledge, programming patterns, AI architectures, hardware, and creative craft.",
    weight: 100,
    properties: { quadrant: "Facts", tags: ["facts", "tools", "systems", "code", "design"] },
  },
  {
    id: "dim_funds",
    type: "dimension",
    label: "Funds (Vitality & Capital)",
    description: "Physical vitality, biomechanics, cellular energy, capital allocation, and financial sovereignty.",
    weight: 100,
    properties: { quadrant: "Funds", tags: ["funds", "vitality", "biomechanics", "wealth", "energy"] },
  },
  {
    id: "dim_feedback",
    type: "dimension",
    label: "Feedback (Psychology & Balance)",
    description: "Interpersonal mirrors, psychological integration, boundary enforcement, and Aristotelian mean.",
    weight: 100,
    properties: { quadrant: "Feedback", tags: ["feedback", "psychology", "relationships", "balance"] },
  },
];

export interface ConceptDefinition {
  id: string;
  label: string;
  description: string;
  quadrant: "Focus" | "Facts" | "Funds" | "Feedback";
  tags: string[];
  keywords: string[];
  weight?: number;
}

// Extracted Domain Concepts
export const CORE_CONCEPTS: ConceptDefinition[] = [
  {
    id: "concept_dopamine_optimization",
    label: "Dopamine Optimization",
    description: "Strategic regulation of baseline dopamine and reward prediction errors to sustain deliberate drive and mitigate refractory troughs.",
    quadrant: "Focus",
    tags: ["dopamine", "focus", "attention", "habits", "discipline"],
    keywords: ["dopamine", "reward", "detox", "addiction", "stimulat", "neurochemical", "baseline", "craving"],
    weight: 50,
  },
  {
    id: "concept_plyometric_tendon_elasticity",
    label: "Plyometric Tendon Elasticity",
    description: "Conditioning the kinetic chain and fascial stiffness to store and release elastic energy with maximal rate of force development.",
    quadrant: "Funds",
    tags: ["plyometrics", "tendon", "biomechanics", "mobility", "athletics"],
    keywords: ["plyometric", "tendon", "elastic", "recoil", "fascia", "jump", "sprint", "achilles", "stiffness", "explosive"],
    weight: 50,
  },
  {
    id: "concept_cinematic_color_grading",
    label: "Cinematic Color Grading",
    description: "Color science, gamut management, custom LUT engineering, and contrast curves to evoke psychological mood and visual depth.",
    quadrant: "Facts",
    tags: ["color-grading", "cinematography", "design", "art", "media"],
    keywords: ["color grading", "lut", "davinci", "gamut", "contrast", "colorist", "cinemat", "cinematic", "lighting", "palette"],
    weight: 50,
  },
  {
    id: "concept_neurodivergent_hyperfocus",
    label: "Neurodivergent Hyperfocus",
    description: "Harnessing intense attentional channeling and managing sensory input modulation in atypical neurobiology.",
    quadrant: "Focus",
    tags: ["hyperfocus", "adhd", "focus", "psychology", "mindset"],
    keywords: ["hyperfocus", "adhd", "neurodiverg", "attentional", "stimulation", "sensory", "distraction", "flow state"],
    weight: 50,
  },
  {
    id: "concept_game_feel_mechanics",
    label: "Game Feel Mechanics",
    description: "Designing tactile micro-feedback loops, parry frames, screen shake, hitstop, and responsive input feel.",
    quadrant: "Facts",
    tags: ["game-design", "game-feel", "animation", "engineering", "design"],
    keywords: ["game feel", "parry", "hitstop", "screen shake", "mechanic", "game design", "combat", "responsiv", "animation curve"],
    weight: 50,
  },
  {
    id: "concept_biomechanical_joint_alignment",
    label: "Biomechanical Joint Alignment",
    description: "Optimizing anatomical leverage, knee-over-toe loading, spinal mechanics, and mobility under load.",
    quadrant: "Funds",
    tags: ["biomechanics", "mobility", "fitness", "vitality", "health"],
    keywords: ["biomechanic", "joint", "alignment", "squat", "posture", "mobility", "patella", "cartilage", "spine", "tibia"],
    weight: 50,
  },
  {
    id: "concept_relational_psychological_mirrors",
    label: "Relational Psychological Mirrors",
    description: "Treating interpersonal friction and emotional triggers as reflective diagnostics of unintegrated internal shadow.",
    quadrant: "Feedback",
    tags: ["relationships", "psychology", "feedback", "reflection", "mindset"],
    keywords: ["mirror", "relational", "projection", "interpersonal", "relationship", "trigger", "shadow", "attachment"],
    weight: 50,
  },
  {
    id: "concept_emotional_exhaustion_departure",
    label: "Emotional Exhaustion & Departure",
    description: "Decoupling from energy-depleting dynamics through decisive emotional boundaries and non-reactive detachment.",
    quadrant: "Feedback",
    tags: ["boundaries", "psychology", "communication", "resilience"],
    keywords: ["exhaustion", "departure", "boundary", "detachment", "burnout", "letting go", "draining", "toxic"],
    weight: 50,
  },
  {
    id: "concept_autonomous_ai_agents",
    label: "Autonomous AI Agents",
    description: "Multi-agent cognitive meshes, tool-use execution loops, prompt protocols, and recursive self-refinement.",
    quadrant: "Facts",
    tags: ["ai", "automation", "engineering", "software", "workflow"],
    keywords: ["agent", "ai", "llm", "prompt", "autonomous", "tool use", "mesh", "model", "neural", "copilot"],
    weight: 50,
  },
  {
    id: "concept_deep_work_flow_state",
    label: "Deep Work & Flow State Induction",
    description: "Creating structured uninterrupted blocks where cognitive processing speed and pattern recognition peak.",
    quadrant: "Focus",
    tags: ["focus", "productivity", "workflow", "discipline", "execution"],
    keywords: ["deep work", "flow state", "distraction", "uninterrupted", "focus block", "pomodoro", "immersion"],
    weight: 50,
  },
  {
    id: "concept_cellular_vitality_circadian",
    label: "Cellular Vitality & Circadian Biology",
    description: "Aligning suprachiasmatic circadian rhythm, light exposure, sleep architecture, and metabolic recovery cycles.",
    quadrant: "Funds",
    tags: ["vitality", "nutrition", "health", "longevity", "recovery"],
    keywords: ["circadian", "sleep", "vitality", "mitochondria", "recovery", "light", "melatonin", "metabolism", "fasting"],
    weight: 50,
  },
  {
    id: "concept_asymmetric_capital_allocation",
    label: "Asymmetric Capital & Financial Leverage",
    description: "Deploying resources into high-convexity opportunities where downside is strictly bounded and upside is uncapped.",
    quadrant: "Funds",
    tags: ["funds", "wealth", "finance", "strategy", "execution"],
    keywords: ["capital", "asymmetric", "leverage", "wealth", "invest", "equity", "cashflow", "finance", "portfolio"],
    weight: 50,
  },
  {
    id: "concept_stoic_mean_equanimity",
    label: "Aristotelian Mean & Stoic Equanimity",
    description: "Calibrating emotional responses to the golden mean between deficiency and excess, maintaining unflinching interior calm.",
    quadrant: "Feedback",
    tags: ["feedback", "philosophy", "reflection", "resilience", "mindset"],
    keywords: ["stoic", "equanimity", "mean", "golden mean", "aristotle", "temperance", "calm", "non-attachment"],
    weight: 50,
  },
  {
    id: "concept_3d_procedural_motion",
    label: "3D Procedural Motion & Animation",
    description: "Procedural geometry generation, node-based shaders, physical simulation, and spatial keyframe curves.",
    quadrant: "Facts",
    tags: ["animation", "design", "art", "media", "craft"],
    keywords: ["blender", "3d", "motion", "animation", "geometry", "render", "shader", "vfx", "cgi"],
    weight: 50,
  },
  {
    id: "concept_ergonomic_hardware_edc",
    label: "Ergonomic Hardware & Minimalist EDC",
    description: "Selecting friction-free physical gear, tactile input devices, and biomechanically supportive workspace setups.",
    quadrant: "Facts",
    tags: ["hardware", "engineering", "everyday-carry", "design", "tools"],
    keywords: ["hardware", "ergonomic", "edc", "keyboard", "desk", "peripheral", "gadget", "gear", "carry"],
    weight: 50,
  },
  {
    id: "concept_audio_sound_engineering",
    label: "Sound Design & Audio Engineering",
    description: "Sculpting frequencies, psychoacoustic spatial placement, harmonic distortion, and dynamic compression.",
    quadrant: "Facts",
    tags: ["sound-design", "music", "audio", "art", "media"],
    keywords: ["audio", "sound", "foley", "music", "frequency", "acoustic", "mix", "master", "synthesizer"],
    weight: 50,
  },
  {
    id: "concept_frictionless_execution_habits",
    label: "Frictionless Execution & Habit Scaffolding",
    description: "Lowering physical activation energy for high-leverage habits while erecting insurmountable friction around vices.",
    quadrant: "Focus",
    tags: ["habits", "productivity", "execution", "discipline", "workflow"],
    keywords: ["habit", "execution", "friction", "activation energy", "routine", "discipline", "consistency", "scaffold"],
    weight: 50,
  },
  {
    id: "concept_high_agency_communication",
    label: "High-Agency Communication & Boundaries",
    description: "Direct, radical clarity in interpersonal exchange without defensive posturing, maintaining sovereign boundaries.",
    quadrant: "Feedback",
    tags: ["communication", "relationships", "feedback", "growth"],
    keywords: ["communication", "boundary", "assertive", "clarity", "negotiat", "candor", "sovereignty", "conflict"],
    weight: 50,
  },
  {
    id: "concept_narrative_rhetoric_storytelling",
    label: "Narrative Architecture & Persuasive Storytelling",
    description: "Structuring visceral storytelling arcs, thematic tension, and framing to capture human attention and instill belief.",
    quadrant: "Facts",
    tags: ["storytelling", "media", "culture", "writing", "communication"],
    keywords: ["story", "narrative", "rhetoric", "persuasion", "arc", "script", "hook", "storytelling", "framing"],
    weight: 50,
  },
  {
    id: "concept_hypertrophy_kinetic_chain",
    label: "Hypertrophy Mechanics & Strength Loading",
    description: "Progressive mechanical tension, lengthened partial repetitions, and systemic fatigue management for muscle architecture.",
    quadrant: "Funds",
    tags: ["fitness", "biomechanics", "vitality", "strength"],
    keywords: ["hypertrophy", "muscle", "strength", "overload", "rep", "partial", "lengthened", "lifting", "weight"],
    weight: 50,
  },
];

// Core Heuristic Nodes
export const CORE_HEURISTICS: GraphNode[] = [
  {
    id: "heuristic_dopamine_trough",
    type: "heuristic",
    label: "Dopamine Baseline Conservation",
    description: "Dopamine peaks induce proportional neurochemical troughs; protect baseline over chasing artificial peaks.",
    weight: 30,
    properties: {
      conceptId: "concept_dopamine_optimization",
      quadrant: "Focus",
      tags: ["dopamine", "habits", "focus"],
    },
  },
  {
    id: "heuristic_tendon_elasticity",
    type: "heuristic",
    label: "Rate of Force Development Primacy",
    description: "Tendon elasticity requires high rate of force development under minimal metabolic fatigue.",
    weight: 30,
    properties: {
      conceptId: "concept_plyometric_tendon_elasticity",
      quadrant: "Funds",
      tags: ["plyometrics", "biomechanics", "athletics"],
    },
  },
  {
    id: "heuristic_game_feel_juice",
    type: "heuristic",
    label: "Tactile Hitstop Feedback Ratio",
    description: "Game feel is 80% audio-visual freeze and punch, and 20% raw hit collision logic.",
    weight: 30,
    properties: {
      conceptId: "concept_game_feel_mechanics",
      quadrant: "Facts",
      tags: ["game-feel", "design", "animation"],
    },
  },
  {
    id: "heuristic_relational_mirror",
    type: "heuristic",
    label: "Interpersonal Shadow Reflection",
    description: "Every persistent relational friction point is an unintegrated mirror of disowned personal shadow.",
    weight: 30,
    properties: {
      conceptId: "concept_relational_psychological_mirrors",
      quadrant: "Feedback",
      tags: ["relationships", "psychology", "reflection"],
    },
  },
  {
    id: "heuristic_activation_energy",
    type: "heuristic",
    label: "Activation Energy Scaffolding",
    description: "Lowering activation energy by 10% increases habit execution probability by 100%.",
    weight: 30,
    properties: {
      conceptId: "concept_frictionless_execution_habits",
      quadrant: "Focus",
      tags: ["habits", "execution", "productivity"],
    },
  },
  {
    id: "heuristic_color_restraint",
    type: "heuristic",
    label: "Color Gamut Subtraction",
    description: "Cinematic color grading achieves dramatic impact through gamut restraint and tonal contrast, not saturation.",
    weight: 30,
    properties: {
      conceptId: "concept_cinematic_color_grading",
      quadrant: "Facts",
      tags: ["color-grading", "cinematography", "art"],
    },
  },
  {
    id: "heuristic_agentic_boundaries",
    type: "heuristic",
    label: "Deterministic Schema Boundaries for Agents",
    description: "Autonomous AI agents perform best when constrained by strictly typed state schemas and deterministic guardrails.",
    weight: 30,
    properties: {
      conceptId: "concept_autonomous_ai_agents",
      quadrant: "Facts",
      tags: ["ai", "engineering", "automation"],
    },
  },
  {
    id: "heuristic_circadian_anchor",
    type: "heuristic",
    label: "Circadian Lux Photon Anchoring",
    description: "Morning lux photons into the retina anchor the suprachiasmatic nucleus for daytime alertness and nocturnal melatonin.",
    weight: 30,
    properties: {
      conceptId: "concept_cellular_vitality_circadian",
      quadrant: "Funds",
      tags: ["vitality", "sleep", "circadian"],
    },
  },
  {
    id: "heuristic_golden_mean",
    type: "heuristic",
    label: "Equilibrium Between Extremes",
    description: "Virtue and peak performance reside at the harmonic mean between the deficiency and excess of emotional reaction.",
    weight: 30,
    properties: {
      conceptId: "concept_stoic_mean_equanimity",
      quadrant: "Feedback",
      tags: ["stoicism", "balance", "philosophy"],
    },
  },
  {
    id: "heuristic_asymmetric_convexity",
    type: "heuristic",
    label: "Convexity and Bounded Downside",
    description: "Never allocate focus to games where downside is catastrophic or upside is strictly capped.",
    weight: 30,
    properties: {
      conceptId: "concept_asymmetric_capital_allocation",
      quadrant: "Funds",
      tags: ["funds", "wealth", "strategy"],
    },
  },
  {
    id: "heuristic_ergonomic_friction",
    type: "heuristic",
    label: "Physical Micro-Friction Compound Effect",
    description: "Any micro-friction in hardware or desk posture compounds into severe cognitive fatigue over an 8-hour sprint.",
    weight: 30,
    properties: {
      conceptId: "concept_ergonomic_hardware_edc",
      quadrant: "Facts",
      tags: ["hardware", "ergonomics", "edc"],
    },
  },
  {
    id: "heuristic_boundary_departure",
    type: "heuristic",
    label: "Decisive Departure Over Chronic Repair",
    description: "When communication fails to resolve chronic energy drain, silent structural departure is required.",
    weight: 30,
    properties: {
      conceptId: "concept_emotional_exhaustion_departure",
      quadrant: "Feedback",
      tags: ["boundaries", "relationships", "resilience"],
    },
  },
];

export interface ClusterTemplate {
  id: string;
  label: string;
  coreTheme: string;
  quadrant: "Focus" | "Facts" | "Funds" | "Feedback";
  topTags: string[];
  masterSynthesis: string;
  conceptIds: string[];
}

// 20 Cohesive Semantic Clusters
export const CLUSTER_TEMPLATES: ClusterTemplate[] = [
  {
    id: "cluster_dopamine_cognitive_flow",
    label: "Dopamine Optimization & Deep Cognitive Flow",
    coreTheme: "Neurochemical regulation of attention, mitigation of digital overstimulation, and sustained states of deep work.",
    quadrant: "Focus",
    topTags: ["dopamine", "focus", "attention", "habits", "flow"],
    masterSynthesis: "Attention is a fragile neurochemical resource governed by baseline dopamine. Sustained flow requires radical friction against impulse consumption and ruthless protection of cognitive entry conditions.",
    conceptIds: ["concept_dopamine_optimization", "concept_deep_work_flow_state"],
  },
  {
    id: "cluster_execution_velocity_habits",
    label: "Execution Velocity & Atomic Habits",
    coreTheme: "Scaffolding zero-friction routines, accelerating feedback loops, and cultivating relentless daily momentum.",
    quadrant: "Focus",
    topTags: ["habits", "productivity", "execution", "discipline", "workflow"],
    masterSynthesis: "Execution velocity outpaces raw planning. By lowering activation energy to near-zero and treating consistency as the only non-negotiable metric, output compounds exponentially.",
    conceptIds: ["concept_frictionless_execution_habits"],
  },
  {
    id: "cluster_neurodivergent_creative_focus",
    label: "Neurodivergent Attentional Dynamics & Hyperfocus",
    coreTheme: "Leveraging non-linear cognitive processing, ADHD hyperfocus, and sensory environment optimization.",
    quadrant: "Focus",
    topTags: ["hyperfocus", "adhd", "creativity", "mindset", "focus"],
    masterSynthesis: "Divergent attention is not a defect but an asynchronous cognitive specialization. When channelled into self-selected obsessive domains with optimal sensory stimulation, output reaches transcendent levels.",
    conceptIds: ["concept_neurodivergent_hyperfocus"],
  },
  {
    id: "cluster_ai_autonomous_systems",
    label: "Autonomous AI Agents & Intelligent Mesh",
    coreTheme: "Engineering recursive LLM agents, memory graphs, automated pipelines, and human-agent co-piloting.",
    quadrant: "Facts",
    topTags: ["ai", "automation", "engineering", "software", "agents"],
    masterSynthesis: "The cognitive leverage of the individual is magnified thousandfold by autonomous agent meshes. Software is shifting from deterministic code to resilient goal-directed dynamic networks.",
    conceptIds: ["concept_autonomous_ai_agents"],
  },
  {
    id: "cluster_software_developer_ergonomics",
    label: "Software Systems & Developer Ergonomics",
    coreTheme: "Robust software architecture, reactive UI patterns, type systems, and frictionless local developer loops.",
    quadrant: "Facts",
    topTags: ["software", "engineering", "typescript", "architecture", "code"],
    masterSynthesis: "Superior software emerges from developer environments that minimize cognitive friction. Strict typing, deterministic builds, and modular domain modeling eliminate entire categories of systemic failure.",
    conceptIds: ["concept_autonomous_ai_agents"],
  },
  {
    id: "cluster_game_feel_mechanics",
    label: "Game Feel, Combat Systems & Tactile Mechanics",
    coreTheme: "Designing visceral micro-feedback, parry timings, kinetic reactions, and frame-accurate player interaction.",
    quadrant: "Facts",
    topTags: ["game-feel", "game-design", "animation", "mechanics", "tactile"],
    masterSynthesis: "Game feel is tactile psychology encoded into state changes. Instant visual freeze-frames, frame-perfect auditory impact, and elastic recovery transform sterile inputs into intoxicating physical reality.",
    conceptIds: ["concept_game_feel_mechanics"],
  },
  {
    id: "cluster_cinematography_visual_craft",
    label: "Cinematography, Color Science & Visual Direction",
    coreTheme: "Curating optical depth, filmic color grading, lighting dynamics, and atmospheric visual composition.",
    quadrant: "Facts",
    topTags: ["cinematography", "color-grading", "lighting", "visual", "art"],
    masterSynthesis: "Cinematic impact is fundamentally about tonal contrast and deliberate restraint in color palettes. Every visual frame must direct the viewer's subconscious emotional baseline.",
    conceptIds: ["concept_cinematic_color_grading"],
  },
  {
    id: "cluster_3d_animation_vfx",
    label: "3D Animation, Procedural Simulation & Motion",
    coreTheme: "Spatial graphics pipelines, Blender geometry nodes, physics simulations, and organic character animation.",
    quadrant: "Facts",
    topTags: ["animation", "3d", "motion", "blender", "design"],
    masterSynthesis: "Compelling motion derives from biological weight, anticipatory squash-and-stretch, and smooth easing transitions. Procedural pipelines multiply artistic range without sacrificing tactile believability.",
    conceptIds: ["concept_3d_procedural_motion"],
  },
  {
    id: "cluster_hardware_ergonomics_edc",
    label: "Minimalist Hardware & Tactical Workspace Ergonomics",
    coreTheme: "Engineering the physical operating environment, ergonomic mechanical tools, and frictionless everyday-carry gear.",
    quadrant: "Facts",
    topTags: ["hardware", "ergonomics", "everyday-carry", "desk", "engineering"],
    masterSynthesis: "Physical ergonomics dictates intellectual stamina. Eliminating micro-strains from repetitive physical interactions preserves vital cognitive bandwidth for creative synthesis.",
    conceptIds: ["concept_ergonomic_hardware_edc"],
  },
  {
    id: "cluster_audio_sound_engineering",
    label: "Psychoacoustics, Sound Design & Audio Production",
    coreTheme: "Sculpting immersive audio frequencies, spatial positioning, foley impact, and musical resonance.",
    quadrant: "Facts",
    topTags: ["sound-design", "music", "audio", "foley", "media"],
    masterSynthesis: "Sound bypasses conscious cognition to trigger immediate visceral emotion. Precise sonic transients and low-end frequency management anchor perceptual realism.",
    conceptIds: ["concept_audio_sound_engineering"],
  },
  {
    id: "cluster_narrative_storytelling_framing",
    label: "Narrative Architecture & Persuasive Framing",
    coreTheme: "Constructing gripping storytelling hooks, philosophical allegories, and persuasive message distribution.",
    quadrant: "Facts",
    topTags: ["storytelling", "writing", "media", "persuasion", "culture"],
    masterSynthesis: "Facts inform, but visceral narrative transforms identity. The narrative arc that articulates unexpressed human struggles commands supreme authority.",
    conceptIds: ["concept_narrative_rhetoric_storytelling"],
  },
  {
    id: "cluster_biomechanics_tendon_elasticity",
    label: "Plyometric Tendon Elasticity & Kinetic Mechanics",
    coreTheme: "Loading fascial springs, knee-over-toe conditioning, tendon stiffness, and reactive kinetic power.",
    quadrant: "Funds",
    topTags: ["plyometrics", "tendon", "biomechanics", "fascia", "mobility"],
    masterSynthesis: "Human athleticism is driven by fascial elastic recoil rather than pure muscular contraction. High-velocity tendon loading creates unbreakable joint resilience and superhuman explosiveness.",
    conceptIds: ["concept_plyometric_tendon_elasticity", "concept_biomechanical_joint_alignment"],
  },
  {
    id: "cluster_strength_hypertrophy_longevity",
    label: "Progressive Hypertrophy & Joint Longevity",
    coreTheme: "Full-range mechanical tension, posterior chain integration, spine stabilization, and orthopedic health.",
    quadrant: "Funds",
    topTags: ["fitness", "strength", "hypertrophy", "posture", "vitality"],
    masterSynthesis: "True strength is loaded joint mobility across complete physiological ranges. Cultivating structural symmetry protects against degenerative aging while optimizing anabolic signaling.",
    conceptIds: ["concept_hypertrophy_kinetic_chain", "concept_biomechanical_joint_alignment"],
  },
  {
    id: "cluster_cellular_vitality_circadian",
    label: "Circadian Architecture, Sleep & Cellular Vitality",
    coreTheme: "Syncing circadian biology, morning photons, sleep architecture, metabolic resilience, and deep mitochondrial recovery.",
    quadrant: "Funds",
    topTags: ["vitality", "sleep", "nutrition", "health", "longevity"],
    masterSynthesis: "Physical vitality is the foundational fuel of all intellectual creation. Sleep architecture and circadian light exposure are non-negotiable levers governing baseline mitochondrial output.",
    conceptIds: ["concept_cellular_vitality_circadian"],
  },
  {
    id: "cluster_capital_asymmetric_wealth",
    label: "Asymmetric Wealth & Financial Leverage",
    coreTheme: "Constructing asymmetric cash-flow systems, acquiring equity, and insulating personal sovereignty through capital allocation.",
    quadrant: "Funds",
    topTags: ["funds", "wealth", "finance", "strategy", "capital"],
    masterSynthesis: "Capital is distilled agency. True financial power is achieved not by linear hourly labor, but by owning scalable digital assets and positioning for high-convexity opportunities.",
    conceptIds: ["concept_asymmetric_capital_allocation"],
  },
  {
    id: "cluster_relational_psychology_mirrors",
    label: "Relational Psychology & The Mirror Principle",
    coreTheme: "Understanding interpersonal projection, emotional attachment styles, and treating relational conflict as self-reflection.",
    quadrant: "Feedback",
    topTags: ["relationships", "psychology", "reflection", "feedback", "mindset"],
    masterSynthesis: "Other people do not provoke emotional reactions in us; they reveal unprocessed wounds already present. Every interpersonal friction point is an unblemished mirror of the self.",
    conceptIds: ["concept_relational_psychological_mirrors"],
  },
  {
    id: "cluster_emotional_exhaustion_boundaries",
    label: "Emotional Sovereign Boundaries & Detachment",
    coreTheme: "Recognizing subtle emotional drain, practicing radical detachment from non-reciprocal dynamics, and maintaining energetic sovereignty.",
    quadrant: "Feedback",
    topTags: ["boundaries", "communication", "psychology", "detachment", "resilience"],
    masterSynthesis: "Boundaries are not barriers erected to punish others; they are structural enclosures that preserve personal integrity. Walking away from depleting dynamics is the ultimate act of self-honor.",
    conceptIds: ["concept_emotional_exhaustion_departure"],
  },
  {
    id: "cluster_stoic_equanimity_mean",
    label: "Stoic Equanimity & The Doctrine of the Mean",
    coreTheme: "Navigating life between deficiency and excess, cultivating unwavering inner calm, and mastering Aristotle's Golden Mean.",
    quadrant: "Feedback",
    topTags: ["stoicism", "mindset", "resilience", "philosophy", "balance"],
    masterSynthesis: "Excellence lies at the golden harmonic center between reactive extremes. By disidentifying from transient emotional storms, one cultivates invincible tranquil agency.",
    conceptIds: ["concept_stoic_mean_equanimity"],
  },
  {
    id: "cluster_social_dynamics_leadership",
    label: "High-Agency Social Dynamics & Leadership",
    coreTheme: "Charismatic clarity, assertive communication, high-trust team leadership, and empathetic influence.",
    quadrant: "Feedback",
    topTags: ["communication", "leadership", "social", "influence", "growth"],
    masterSynthesis: "Leadership is the quiet transmission of certainty in an ambiguous world. Communicating with unfiltered clarity and genuine empathy commands natural loyalty and collaborative momentum.",
    conceptIds: ["concept_high_agency_communication"],
  },
  {
    id: "cluster_existential_taste_curation",
    label: "Aesthetic Discernment, Taste & Personal Philosophy",
    coreTheme: "Developing sharp aesthetic curation, elevating cultural appreciation, and refining a distinct personal worldview.",
    quadrant: "Feedback",
    topTags: ["culture", "art", "taste", "philosophy", "curation"],
    masterSynthesis: "Taste is the ultimate competitive moat in an age of automated abundance. Curating high-signal inputs and defining a transcendent aesthetic identity makes work inimitable.",
    conceptIds: ["concept_narrative_rhetoric_storytelling"],
  },
];

interface RawItem {
  id?: string;
  firestoreId?: string;
  title: string;
  category?: string;
  quadrant?: string;
  author?: string;
  tags?: string[];
  content?: string;
  summary?: string;
  actionableTakeaway?: string;
  sourceUrl?: string;
  streamUrl?: string;
  telegramStreamUrl?: string;
  notionUrl?: string;
  r2Key?: string;
  mediaType?: string;
  timestamp?: any;
}

/**
 * Loads ingested items from Firestore knowledgeCollection, falling back to local files if unavailable.
 */
export async function loadRawIngestedItems(): Promise<RawItem[]> {
  const telegramMap = new Map<string, string>();
  if (fs.existsSync(TELEGRAM_TRACKER_FILE)) {
    try {
      const tracker = JSON.parse(fs.readFileSync(TELEGRAM_TRACKER_FILE, "utf-8"));
      if (tracker.archivedUrls) {
        for (const [url, data] of Object.entries<any>(tracker.archivedUrls)) {
          if (data.telegramUrl) {
            telegramMap.set(url, data.telegramUrl);
            if (data.reelId) telegramMap.set(data.reelId, data.telegramUrl);
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ Failed reading telegram tracker:", err);
    }
  }

  const checkpointMap = new Map<string, any>();
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
      if (cp.processedUrls) {
        for (const [url, item] of Object.entries<any>(cp.processedUrls)) {
          checkpointMap.set(url, item);
          if (item.firestoreId) checkpointMap.set(item.firestoreId, item);
        }
      }
    } catch (err) {
      console.warn("⚠️ Failed reading checkpoint file:", err);
    }
  }

  // 1. Try Firestore first
  try {
    const snap = await knowledgeCollection.get();
    if (!snap.empty) {
      console.log(`📥 Loaded ${snap.size} items directly from Firestore knowledgeCollection`);
      const items: RawItem[] = [];
      for (const doc of snap.docs) {
        const d = doc.data();
        const url = d.sourceUrl || "";
        const cp = checkpointMap.get(url) || checkpointMap.get(doc.id) || {};
        const telegramUrl = telegramMap.get(url) || d.telegramStreamUrl || cp.telegramUrl || undefined;

        items.push({
          id: doc.id,
          firestoreId: doc.id,
          title: d.title || cp.title || "Untitled Reel",
          category: d.category || cp.category || "insight",
          quadrant: d.quadrant || cp.quadrant || "Facts",
          author: d.author || cp.author || "Unknown",
          tags: Array.isArray(d.tags) && d.tags.length > 0 ? d.tags : cp.tags || [],
          content: d.content || d.summary || "",
          summary: d.summary || d.content || "",
          actionableTakeaway: d.actionableTakeaway || cp.takeaway || "",
          sourceUrl: url,
          streamUrl: d.streamUrl || cp.streamUrl || undefined,
          telegramStreamUrl: telegramUrl,
          notionUrl: d.notionUrl || cp.notionUrl || undefined,
          r2Key: d.r2Key || cp.r2Key || undefined,
          mediaType: d.mediaType || cp.mediaType || undefined,
          timestamp: d.timestamp,
        });
      }
      return items;
    }
  } catch (err) {
    console.warn("⚠️ Could not load from Firestore, falling back to local files:", err);
  }

  // 2. Fallback to Checkpoint file
  if (fs.existsSync(CHECKPOINT_FILE)) {
    console.log("📂 Loading ingested items from local .reels_import_checkpoint.json");
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
      const items: RawItem[] = [];
      for (const [url, entry] of Object.entries<any>(cp.processedUrls || {})) {
        const telegramUrl = telegramMap.get(url) || undefined;
        items.push({
          id: entry.firestoreId || Buffer.from(url).toString("base64url").slice(0, 20),
          firestoreId: entry.firestoreId,
          title: entry.title || "Untitled Reel",
          category: entry.category || "insight",
          quadrant: entry.quadrant || "Facts",
          author: entry.author || "Unknown",
          tags: entry.tags || [],
          content: entry.summary || entry.takeaway || "",
          summary: entry.summary || "",
          actionableTakeaway: entry.takeaway || "",
          sourceUrl: url,
          streamUrl: entry.streamUrl,
          telegramStreamUrl: telegramUrl,
          notionUrl: entry.notionUrl,
          r2Key: entry.r2Key,
          mediaType: entry.mediaType,
        });
      }
      if (items.length > 0) return items;
    } catch (e) {
      console.warn("⚠️ Error parsing checkpoint:", e);
    }
  }

  // 3. Fallback to saved_posts.json
  if (fs.existsSync(SAVED_POSTS_FILE)) {
    console.log("📂 Parsing fallback items from saved_posts.json");
    try {
      const posts = JSON.parse(fs.readFileSync(SAVED_POSTS_FILE, "utf-8"));
      const arr = Array.isArray(posts) ? posts : posts.saved_saved_media || [];
      return arr.map((p: any, idx: number) => {
        const sm = p.string_map_data || {};
        const url = sm.URL?.value || sm.URL?.href || p.href || `post_${idx}`;
        const title = p.title || sm["Account name"]?.value || `Saved Post ${idx + 1}`;
        return {
          id: `post_${idx}`,
          title,
          category: "insight",
          quadrant: "Facts",
          author: sm["Account name"]?.value || "Unknown",
          tags: ["facts"],
          sourceUrl: url,
          telegramStreamUrl: telegramMap.get(url),
        };
      });
    } catch (e) {
      console.warn("⚠️ Error parsing saved_posts.json:", e);
    }
  }

  return [];
}

/**
 * Builds the KnowledgeGraph data structure from raw items.
 */
export function constructKnowledgeGraph(rawItems: RawItem[]): KnowledgeGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();

  function addEdge(
    source: string,
    target: string,
    relation: GraphRelationType,
    weight: number,
    properties?: Record<string, unknown>
  ) {
    if (!source || !target || source === target) return;
    const key = `${source}->${target}:${relation}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({
      source,
      target,
      relation,
      weight,
      properties,
    });
  }

  function addBidirectionalEdge(
    a: string,
    b: string,
    relation: GraphRelationType,
    weight: number,
    properties?: Record<string, unknown>
  ) {
    addEdge(a, b, relation, weight, { ...properties, direction: "bidirectional" });
    addEdge(b, a, relation, weight, { ...properties, direction: "bidirectional" });
  }

  // 1. Add Dimension nodes
  for (const dim of CORE_DIMENSIONS) {
    nodes.push(dim);
  }

  // 2. Add Concept nodes
  const conceptMap = new Map<string, GraphNode>();
  for (const c of CORE_CONCEPTS) {
    const conceptNode: GraphNode = {
      id: c.id,
      type: "concept",
      label: c.label,
      description: c.description,
      weight: c.weight || 50,
      properties: {
        quadrant: c.quadrant,
        tags: c.tags,
        matchKeywords: c.keywords,
      },
    };
    nodes.push(conceptNode);
    conceptMap.set(c.id, conceptNode);

    // Concept connects to its quadrant dimension
    const dimId = `dim_${c.quadrant.toLowerCase()}`;
    addEdge(c.id, dimId, "applies_to", 2.0);
  }

  // 3. Add Heuristic nodes
  for (const h of CORE_HEURISTICS) {
    nodes.push(h);
    const conceptId = h.properties.conceptId as string;
    if (conceptId) {
      addEdge(h.id, conceptId, "synthesizes", 2.5);
    }
    const quad = h.properties.quadrant as string;
    if (quad) {
      addEdge(h.id, `dim_${quad.toLowerCase()}`, "applies_to", 1.5);
    }
  }

  // 4. Add Reel nodes
  const tagIndex = new Map<string, string[]>();
  const genericTags = new Set(["focus", "facts", "funds", "feedback", "mindset", "culture", "noise", "strategy"]);
  const conceptReelMap = new Map<string, string[]>();

  for (const item of rawItems) {
    const reelId = item.id ? (item.id.startsWith("reel_") ? item.id : `reel_${item.id}`) : `reel_${Math.random().toString(36).slice(2, 10)}`;
    const tags = Array.isArray(item.tags)
      ? item.tags.map((t) => t.toLowerCase().trim()).filter(Boolean)
      : [];
    const quad = item.quadrant || "Facts";

    const reelNode: GraphNode = {
      id: reelId,
      type: "reel",
      label: item.title,
      description: item.summary || item.content || item.actionableTakeaway || item.title,
      weight: 1.0 + (item.telegramStreamUrl || item.streamUrl ? 0.8 : 0) + tags.length * 0.1,
      properties: {
        firestoreId: item.firestoreId || item.id,
        category: item.category || "insight",
        quadrant: quad,
        author: item.author,
        tags,
        sourceUrl: item.sourceUrl,
        streamUrl: item.streamUrl,
        telegramStreamUrl: item.telegramStreamUrl,
        actionableTakeaway: item.actionableTakeaway,
        notionUrl: item.notionUrl,
        mediaType: item.mediaType,
      },
    };
    nodes.push(reelNode);

    // Reel connects to Dimension
    const dimId = `dim_${quad.toLowerCase()}`;
    addEdge(reelId, dimId, "applies_to", 1.0);

    // Match Reel to Concepts via keywords & tags
    const contentText = `${item.title} ${item.content || ""} ${item.summary || ""} ${item.actionableTakeaway || ""} ${tags.join(" ")}`.toLowerCase();

    for (const c of CORE_CONCEPTS) {
      let matchScore = 0;
      for (const kw of c.keywords) {
        if (contentText.includes(kw)) {
          matchScore += 1;
        }
      }
      for (const t of tags) {
        if (c.tags.includes(t)) {
          matchScore += 1.5;
        }
      }

      if (matchScore >= 1.5) {
        // Create bidirectional relationship
        addEdge(reelId, c.id, "explains", matchScore);
        addEdge(c.id, reelId, "reinforces", matchScore);

        if (!conceptReelMap.has(c.id)) conceptReelMap.set(c.id, []);
        conceptReelMap.get(c.id)!.push(reelId);
      }
    }

    // Index non-generic tags for reel-to-reel connections
    for (const t of tags) {
      if (!genericTags.has(t)) {
        if (!tagIndex.has(t)) tagIndex.set(t, []);
        tagIndex.get(t)!.push(reelId);
      }
    }
  }

  // 5. Connect peer reels sharing specific tags (capped to top 3-4 peers to keep graph clean and high-signal)
  const peerEdgeCount = new Map<string, number>();

  for (const [tag, reelIds] of tagIndex.entries()) {
    if (reelIds.length < 2 || reelIds.length > 300) continue; // Skip singletons or overly broad tags
    const step = Math.max(1, Math.floor(reelIds.length / 10)); // Sample if dense
    for (let i = 0; i < reelIds.length; i += step) {
      for (let j = i + 1; j < Math.min(reelIds.length, i + 6); j++) {
        const r1 = reelIds[i];
        const r2 = reelIds[j];
        const count1 = peerEdgeCount.get(r1) || 0;
        const count2 = peerEdgeCount.get(r2) || 0;
        if (count1 < 5 && count2 < 5) {
          addBidirectionalEdge(r1, r2, "shares_tag", 1.2, { commonTags: [tag] });
          peerEdgeCount.set(r1, count1 + 1);
          peerEdgeCount.set(r2, count2 + 1);
        }
      }
    }
  }

  // 6. Aggregate into 20 cohesive semantic clusters
  const clusters: GraphCluster[] = [];
  const assignedReels = new Set<string>();

  for (const template of CLUSTER_TEMPLATES) {
    const clusterNodeIds = new Set<string>();

    // Add associated concepts
    for (const cid of template.conceptIds) {
      clusterNodeIds.add(cid);
      // Add heuristics associated with concepts
      for (const h of CORE_HEURISTICS) {
        if (h.properties.conceptId === cid) {
          clusterNodeIds.add(h.id);
        }
      }
      // Add matched reels
      const matched = conceptReelMap.get(cid) || [];
      for (const rid of matched) {
        clusterNodeIds.add(rid);
        assignedReels.add(rid);
      }
    }

    // Add reels matching cluster topTags & quadrant
    for (const n of nodes) {
      if (n.type === "reel") {
        const reelQuad = n.properties.quadrant as string;
        const reelTags = (n.properties.tags as string[]) || [];
        if (reelQuad === template.quadrant) {
          const sharesTag = template.topTags.some((tt) => reelTags.includes(tt));
          if (sharesTag) {
            clusterNodeIds.add(n.id);
            assignedReels.add(n.id);
          }
        }
      }
    }

    clusters.push({
      id: template.id,
      label: template.label,
      coreTheme: template.coreTheme,
      nodeIds: Array.from(clusterNodeIds),
      topTags: template.topTags,
      masterSynthesis: template.masterSynthesis,
    });
  }

  // Assign any remaining unassigned reels to their best quadrant cluster
  const quadrantClusters: Record<string, string> = {
    Focus: "cluster_execution_velocity_habits",
    Facts: "cluster_software_developer_ergonomics",
    Funds: "cluster_strength_hypertrophy_longevity",
    Feedback: "cluster_relational_psychology_mirrors",
  };

  for (const n of nodes) {
    if (n.type === "reel" && !assignedReels.has(n.id)) {
      const q = (n.properties.quadrant as string) || "Facts";
      const targetClusterId = quadrantClusters[q] || "cluster_software_developer_ergonomics";
      const targetCluster = clusters.find((c) => c.id === targetClusterId);
      if (targetCluster) {
        targetCluster.nodeIds.push(n.id);
      }
    }
  }

  const metadata: KnowledgeGraphMetadata = {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    builtAt: new Date().toISOString(),
    clusterCount: clusters.length,
    reelsCount: nodes.filter((n) => n.type === "reel").length,
    conceptsCount: nodes.filter((n) => n.type === "concept").length,
    heuristicsCount: nodes.filter((n) => n.type === "heuristic").length,
    dimensionsCount: nodes.filter((n) => n.type === "dimension").length,
    verdictsCount: nodes.filter((n) => n.type === "verdict").length,
  };

  return {
    nodes,
    edges,
    clusters,
    metadata,
  };
}

/**
 * Persists the KnowledgeGraph to Firestore and local disk cache.
 */
export async function persistKnowledgeGraph(graph: KnowledgeGraph): Promise<void> {
  // 1. Ensure local directory exists & write local cache
  const dataDir = path.dirname(LOCAL_GRAPH_CACHE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(LOCAL_GRAPH_CACHE, JSON.stringify(graph, null, 2), "utf-8");
  console.log(`💾 Saved Knowledge Graph to local cache: ${LOCAL_GRAPH_CACHE} (${(fs.statSync(LOCAL_GRAPH_CACHE).size / (1024 * 1024)).toFixed(2)} MB)`);

  // 2. Persist to Firestore: graphsCollection.doc("knowledge_graph")
  try {
    // Firestore single doc limit is 1 MiB.
    // We store the master structure (clusters, dimensions, concepts, heuristics, metadata)
    // and key summaries in `knowledge_graph`.
    const coreNodes = graph.nodes.filter((n) => n.type !== "reel");
    const sampleReels = graph.nodes.filter((n) => n.type === "reel").slice(0, 50);

    const rawPayload = {
      metadata: graph.metadata,
      clusters: graph.clusters.map((c) => ({
        id: c.id,
        label: c.label,
        coreTheme: c.coreTheme,
        topTags: c.topTags,
        masterSynthesis: c.masterSynthesis,
        nodeCount: c.nodeIds.length,
        sampleNodeIds: c.nodeIds.slice(0, 30),
      })),
      dimensions: graph.nodes.filter((n) => n.type === "dimension"),
      concepts: graph.nodes.filter((n) => n.type === "concept"),
      heuristics: graph.nodes.filter((n) => n.type === "heuristic"),
      verdicts: graph.nodes.filter((n) => n.type === "verdict"),
      sampleReels,
    };

    // Sanitize any undefined values for Firestore compatibility
    const cleanPayload = JSON.parse(JSON.stringify(rawPayload));
    cleanPayload.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await graphsCollection.doc("knowledge_graph").set(cleanPayload);
    console.log(`🔥 Persisted Master Knowledge Graph document to Firestore (graphs/knowledge_graph)`);
  } catch (err) {
    console.warn("⚠️ Failed to persist graph to Firestore:", err);
  }
}

/**
 * High-level build function: loads ingested items, constructs the knowledge graph, and persists it.
 */
export async function buildKnowledgeGraph(): Promise<KnowledgeGraph> {
  console.log("⚡ Starting Knowledge Graph build pipeline...");
  const rawItems = await loadRawIngestedItems();
  console.log(`📊 Processing ${rawItems.length} ingested items into knowledge graph...`);

  const graph = constructKnowledgeGraph(rawItems);
  console.log(`✨ Graph constructed: ${graph.nodes.length} nodes, ${graph.edges.length} edges across ${graph.clusters.length} semantic clusters.`);

  await persistKnowledgeGraph(graph);
  return graph;
}
