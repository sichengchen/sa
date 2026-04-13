import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface UserQuestionProps {
  questionId: string;
  question: string;
  options?: string[];
  onAnswer: (questionId: string, answer: string) => void;
}

export function UserQuestion({ questionId, question, options, onAnswer }: UserQuestionProps) {
  const [selected, setSelected] = useState(0);
  const [freeText, setFreeText] = useState("");

  const isMultipleChoice = options && options.length > 0;

  useInput((input, key) => {
    if (isMultipleChoice) {
      // Multiple-choice mode
      if (key.upArrow) {
        setSelected((s) => Math.max(0, s - 1));
      } else if (key.downArrow) {
        setSelected((s) => Math.min(options.length - 1, s + 1));
      } else if (key.return) {
        onAnswer(questionId, options[selected]!);
      } else if (input >= "1" && input <= "9") {
        const idx = parseInt(input) - 1;
        if (idx < options.length) {
          onAnswer(questionId, options[idx]!);
        }
      }
    } else {
      // Free-text mode
      if (key.return) {
        if (freeText.trim()) {
          onAnswer(questionId, freeText.trim());
        }
      } else if (key.backspace || key.delete) {
        setFreeText((v) => v.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setFreeText((v) => v + input);
      }
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        Agent has a question
      </Text>
      <Text>{question}</Text>
      <Text />
      {isMultipleChoice ? (
        <>
          {options.map((opt, i) => (
            <Text key={i}>
              {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
              <Text>
                {i + 1}. {opt}
              </Text>
            </Text>
          ))}
          <Text />
          <Text dimColor>↑↓ navigate | Enter or number to select</Text>
        </>
      ) : (
        <>
          <Box>
            <Text color="blue" bold>
              {"Answer: "}
            </Text>
            <Text>{freeText}</Text>
            <Text color="blue">{"▊"}</Text>
          </Box>
          <Text />
          <Text dimColor>Type your answer, Enter to submit</Text>
        </>
      )}
    </Box>
  );
}
