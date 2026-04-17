import { type ReactElement } from "react";
import { Card, Button } from "@aria/desktop-ui";
import type { AriaChatPendingQuestion } from "@aria/access-client";

export interface QuestionCardProps {
  question: AriaChatPendingQuestion;
  onAnswer: (answer: string) => void;
  className?: string;
}

export function QuestionCard({
  question,
  onAnswer,
  className,
}: QuestionCardProps): ReactElement {
  return (
    <Card variant="soft" className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--aria-text-muted)]">
        Question
      </div>
      <p className="my-1 text-sm font-medium">{question.question}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(question.options ?? []).map((option) => (
          <Button
            key={option}
            variant="secondary"
            size="sm"
            onClick={() => onAnswer(option)}
          >
            {option}
          </Button>
        ))}
      </div>
    </Card>
  );
}
