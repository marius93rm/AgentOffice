import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PaseoRequest, PaseoResponse } from "./paseo-types";
import { questionResponse, type AnswerDraft, type Question } from "./questions";
import { Button, Muted, pressStyle, radius, space } from "./ui";

const emptyAnswer: AnswerDraft = { choices: [], text: "" };

export function QuestionForm({
  theme, request, questions, busy, onSubmit,
}: {
  theme: PluginTheme;
  request: PaseoRequest;
  questions: readonly Question[];
  busy: boolean;
  onSubmit: (response: PaseoResponse) => void;
}) {
  const [draft, setDraft] = useState<AnswerDraft[]>([]);
  const { colors } = theme;
  const update = (index: number, change: (answer: AnswerDraft) => AnswerDraft) =>
    setDraft((previous) => {
      const next = [...previous];
      next[index] = change(previous[index] ?? emptyAnswer);
      return next;
    });
  const response = questionResponse(request, questions, draft);
  return (
    <View style={{ gap: space.lg }}>
      {questions.map((question, index) => {
        const answer = draft[index] ?? emptyAnswer;
        return (
          <View key={question.header} style={{ gap: space.sm }}>
            <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 16, lineHeight: 23, fontWeight: "600" }}>
              {question.text}
            </Text>
            {question.multiple ? <Muted theme={theme}>Choose any that apply</Muted> : null}
            {question.options.map((option, choice) => {
              const checked = answer.choices.includes(choice);
              return (
                <Pressable
                  key={choice}
                  accessibilityRole={question.multiple ? "checkbox" : "radio"}
                  accessibilityLabel={[option.label, option.description].filter(Boolean).join(". ")}
                  accessibilityState={{ checked, disabled: busy }}
                  disabled={busy}
                  onPress={() => update(index, (previous) => ({
                    choices: question.multiple
                      ? previous.choices.includes(choice) ? previous.choices.filter((value) => value !== choice) : [...previous.choices, choice]
                      : [choice],
                    text: question.multiple ? previous.text : "",
                  }))}
                  style={pressStyle(({ pressed }) => ({
                    flexDirection: "row", alignItems: "flex-start", gap: space.md,
                    minHeight: 48, padding: space.md, borderWidth: 1, borderRadius: radius.md,
                    borderColor: checked ? colors.accent : colors.border,
                    backgroundColor: pressed || checked ? colors.surface2 : colors.surface1,
                  }))}
                >
                  <Icon name={checked ? "CircleCheck" : "Circle"} size={20} color={checked ? colors.accent : colors.foregroundMuted} />
                  <View style={{ flex: 1, gap: space.xs }}>
                    <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 21, fontWeight: "500" }}>{option.label}</Text>
                    {option.description ? <Muted theme={theme} size={13}>{option.description}</Muted> : null}
                    {option.preview && checked ? <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>{option.preview}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
            {question.freeText ? (
              <TextInput
                accessibilityLabel={question.options.length ? `Other answer for ${question.text}` : question.text}
                editable={!busy}
                value={answer.text}
                onChangeText={(text) => update(index, (previous) => ({
                  text, choices: !question.multiple && text.trim() ? [] : previous.choices,
                }))}
                placeholder={question.placeholder ?? (question.options.length ? "Other answer" : "Type your answer")}
                placeholderTextColor={colors.foregroundMuted}
                multiline
                style={{
                  minHeight: 54, color: colors.foreground, backgroundColor: colors.surface0,
                  borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
                  padding: space.md, fontSize: 16, lineHeight: 22, textAlignVertical: "top",
                }}
              />
            ) : null}
          </View>
        );
      })}
      <Button theme={theme} size="touch" variant="default" label={busy ? "Sending…" : "Send answer"}
        disabled={busy || !response} onPress={() => response && onSubmit(response)} />
    </View>
  );
}
