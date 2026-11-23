export const ROLES = {
  agent: { title: "Agent", icon: "User", art: null },
  overseer: { title: "Overseer", icon: "Crown", art: null },
  nexus: { title: "Nexus", icon: "Headphones", art: null },
  meow: { title: "Meow", icon: "Cat", art: null },
  planner: { title: "Planner", icon: "NotebookPen", art: ["oooo", "owwo", "owoo", "oooo"] },
  developer: { title: "Developer", icon: "Laptop", art: ["oooo", "oeeo", ".oo.", "oooo"] },
  reviewer: { title: "Reviewer", icon: "Search", art: [".oo.", "owwo", ".oo.", "..oo"] },
  security: { title: "Security", icon: "Shield", art: ["oooo", "oaao", ".aa.", ".oo."] },
  tester: { title: "Tester", icon: "ListChecks", art: [".oo.", "owwo", "oeoo", "oooo"] },
  researcher: { title: "Researcher", icon: "BookOpen", art: ["o.oo", "ocwo", "owco", "oooo"] },
} as const;

export type LobbyRole = keyof typeof ROLES;

export function normalizeRole(value: string | null | undefined): LobbyRole {
  const role = value?.trim().toLowerCase().replace(/[-_ ]+/g, " ");
  if (role === "dev") return "developer";
  if (role === "qa") return "tester";
  if (role === "security reviewer") return "security";
  return role && Object.hasOwn(ROLES, role) ? role as LobbyRole : "agent";
}
