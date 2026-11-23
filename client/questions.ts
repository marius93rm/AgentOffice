import type { PaseoRequest, PaseoResponse } from "./paseo-types";

type Option = { label: string; description?: string; preview?: string };
export interface Question {
  header: string;
  text: string;
  options: readonly Option[];
  multiple: boolean;
  freeText: boolean;
  optional: boolean;
  placeholder?: string;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;

/** Older providers can identify these calls by name instead of the request kind. */
export function isQuestion(request: PaseoRequest): boolean {
  return request.kind === "question" || /^(AskUserQuestion|request_user_input(?:_async)?)$/i.test(request.name);
}

/** Paseo keys the answers by header and expects the provider's original input alongside them. */
export function questionsOf(request: PaseoRequest): Question[] | null {
  const entries = request.input?.questions;
  if (!isQuestion(request) || !Array.isArray(entries) || entries.length === 0) return null;
  const questions: Question[] = [];
  const headers = new Set<string>();
  for (const entry of entries) {
    const question = record(entry);
    if (!question) return null;
    const { header, question: prompt, options } = question;
    if (typeof header !== "string" || typeof prompt !== "string" || !Array.isArray(options) || headers.has(header)) return null;
    const choices: Option[] = [];
    for (const entry of options) {
      const option = record(entry);
      if (!option || typeof option.label !== "string" || !option.label.trim()) return null;
      choices.push({ label: option.label, description: text(option.description), preview: text(option.preview) });
    }
    headers.add(header);
    questions.push({
      header, text: prompt, options: choices,
      multiple: question.multiSelect === true || question.isMultiSelect === true,
      freeText: choices.length === 0 || question.allowOther === true || question.isOther === true,
      optional: question.allowEmpty === true,
      placeholder: text(question.placeholder),
    });
  }
  return questions;
}

export function requestTitle(request: PaseoRequest): string {
  return questionsOf(request)?.[0]?.text || request.title || request.name;
}

/** Use provider fields directly when describing an authorization. */
export function permissionFacts(request: PaseoRequest): Array<{ label: string; value: string }> {
  const detail = request.detail;
  const input = request.input;
  const command = detail?.type === "shell" ? detail.command : text(input?.command) ?? text(input?.cmd);
  const directory = detail?.type === "shell" ? detail.cwd ?? text(input?.cwd)
    : text(input?.cwd) ?? text(input?.workdir) ?? text(input?.workingDirectory);
  const path = detail?.type === "read" || detail?.type === "edit" || detail?.type === "write" ? detail.filePath
    : detail?.type === "worktree_setup" ? detail.worktreePath
    : text(input?.filePath) ?? text(input?.file_path) ?? text(input?.path);
  const files = detail?.type === "search" ? detail.filePaths : input?.paths;
  const paths = Array.isArray(files) ? files.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : [];
  const url = detail?.type === "fetch" ? detail.url : text(input?.url);
  const query = detail?.type === "search" ? detail.query : text(input?.query);
  const plan = detail?.type === "plan" ? detail.text : request.kind === "plan" ? text(input?.plan) : undefined;
  const fields: Array<[string, string | undefined]> = [
    ["Command", command], ["Working directory", directory], ["File or path", path], ["Files", paths.join("\n")],
    ["URL", url], ["Search query", query], ["Plan", plan],
  ];
  return fields.flatMap(([label, value]) => value?.trim() ? [{ label, value }] : []);
}

export interface AnswerDraft {
  choices: readonly number[];
  text: string;
}

export function questionResponse(
  request: PaseoRequest, questions: readonly Question[], draft: readonly AnswerDraft[],
): PaseoResponse | null {
  const pairs: Array<[string, string]> = [];
  for (const [index, question] of questions.entries()) {
    const answer = draft[index];
    const labels = (answer?.choices ?? []).map((choice) => question.options[choice]?.label).filter(Boolean);
    const custom = question.freeText ? answer?.text.trim() : "";
    const value = custom && !question.multiple ? custom : [...labels, ...(custom ? [custom] : [])].join(", ");
    if (!value && !(question.optional && question.freeText)) return null;
    pairs.push([question.header, value]);
  }
  return { behavior: "allow", updatedInput: { ...request.input, answers: Object.fromEntries(pairs) } };
}
