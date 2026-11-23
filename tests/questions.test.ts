import { describe, expect, it } from "vitest";
import type { PaseoRequest } from "../client/paseo-types";
import { isQuestion, questionResponse, questionsOf } from "../client/questions";

const request: PaseoRequest = {
  id: "q1", provider: "codex", name: "request_user_input_async", kind: "question",
  input: {
    questions: [
      { header: "Palette", question: "Which palette?", options: [{ label: "Forest" }, { label: "Dusk" }] },
      { header: "Details", question: "Which details?", options: [{ label: "Lamp" }, { label: "Plant" }], multiSelect: true, isOther: true },
      { header: "Name", question: "Give it a name", options: [] },
    ],
    context: "studio",
  },
};

describe("Paseo question responses", () => {
  it("sends original options, custom text and the provider input under the SDK answer keys", () => {
    const questions = questionsOf(request)!;
    expect(questionResponse(request, questions, [
      { choices: [1], text: "" },
      { choices: [0, 1], text: "  Shelf  " },
      { choices: [], text: "June" },
    ])).toEqual({
      behavior: "allow",
      updatedInput: { ...request.input, answers: { Palette: "Dusk", Details: "Lamp, Plant, Shelf", Name: "June" } },
    });
  });

  it("holds the submit action until every required prompt has a response", () => {
    expect(questionResponse(request, questionsOf(request)!, [{ choices: [0], text: "" }])).toBeNull();
  });

  it("classifies an unrecognized question shape as a question without building an approval", () => {
    const unsupported = { ...request, input: { questions: [{ options: ["A", "B"] }] } };
    expect(isQuestion(unsupported)).toBe(true);
    expect(questionsOf(unsupported)).toBeNull();
    expect(isQuestion({ ...request, name: "Bash", kind: "tool" })).toBe(false);
  });
});
