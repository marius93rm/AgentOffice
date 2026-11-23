const SUMMARY_MAX = 120;
const str = (value: unknown): string | null => typeof value === "string" ? value : null;

/** The first line with something on it, whitespace collapsed, cut to `max`. */
export function oneLine(value: unknown, max = SUMMARY_MAX): string {
  const raw = str(value);
  if (!raw) return "";
  // Bound the work before splitting: a command can be megabytes long.
  const head = raw.slice(0, max * 4);
  const line = head.split(/\r?\n/).find((candidate) => candidate.trim()) ?? "";
  const flat = line.replace(/\s+/g, " ").trim();
  const points = Array.from(flat);
  return points.length > max ? `${points.slice(0, max - 1).join("")}…` : flat;
}

/** `/a/b/c/file.ts` reads as `c/file.ts`. */
function shortPath(value: unknown): string {
  const path = str(value);
  if (!path) return "";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return oneLine(parts.slice(-2).join("/"));
}

/** What a tool call was about, in one line: the command, the file, the query. */
export function toolSummary(detail: unknown): string {
  if (!detail || typeof detail !== "object") return "";
  const d = detail as Record<string, unknown>;
  switch (d.type) {
    case "shell":
      return oneLine(d.command);
    case "read":
    case "edit":
    case "write":
      return shortPath(d.filePath);
    case "search":
      return oneLine(d.query);
    case "fetch":
      return oneLine(d.url);
    case "sub_agent":
      return oneLine(d.description) || oneLine(d.subAgentType);
    case "plain_text":
      return oneLine(d.label) || oneLine(d.text);
    case "worktree_setup":
      return oneLine(d.branchName);
    default:
      return "";
  }
}

/** Descriptions use only the tool's structured arguments and outcome. */
export function describeTool(detail: unknown, fallback: string, status: string): string {
  if (!detail || typeof detail !== "object") return fallback;
  const data = detail as Record<string, unknown>;
  const summary = toolSummary(detail);
  const failed = status === "failed" || (typeof data.exitCode === "number" && data.exitCode !== 0);
  if (!summary) return failed ? fallback + " failed" : fallback;
  if (status === "canceled") return summary + " · canceled";
  if (data.type === "shell") {
    return failed ? "Command failed · " + summary : summary;
  }
  if (data.type === "read") return (failed ? "Could not read " : status === "running" ? "Reading " : "Read ") + summary;
  if (data.type === "edit" || data.type === "write") return (failed ? "Could not edit " : status === "running" ? "Editing " : "Edited ") + summary;
  if (data.type === "search") return (failed ? "Search failed · " : "Search · ") + summary;
  return failed ? fallback + " failed · " + summary : summary;
}
