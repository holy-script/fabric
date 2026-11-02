export type MasterPillar =
  | "Capital & Wealth"
  | "Vitality & Biological Architecture"
  | "Craft & Intellectual Depth"
  | "Creative Forge & Expressionism"
  | "Nervous System & Ambient I/O"
  | string; // Flexible custom pillar

export interface DomainDefinition {
  id: string;
  name: string;
  pillar: MasterPillar;
  status: "active" | "bench";
  icon: string;
  description: string;
  tags: string[];
  suggestedCommands?: string[];
  isCustom?: boolean;
  createdAt?: string;
}

export interface UserDomainState {
  activeDomainIds: string[];
  customDomains: DomainDefinition[];
  maxActiveSlots: number; // Defaults to 7
  lastSwappedAt?: string;
}
