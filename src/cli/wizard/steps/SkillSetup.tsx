import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface SkillSetupData {
  installSkills: boolean;
}

interface SkillSetupProps {
  onNext: (data: SkillSetupData) => void;
  onBack: () => void;
}

export function SkillSetup({ onNext, onBack }: SkillSetupProps) {
  const [selected, setSelected] = useState(0);

  useInput((_input, key) => {
    if (key.escape) { onBack(); return; }

    if (key.upArrow) {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((s) => Math.min(1, s + 1));
      return;
    }

    if (key.return) {
      onNext({ installSkills: selected === 0 });
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Agent Skills
      </Text>
      <Text />
      <Text>
        SA uses agent skills — prompt-level instructions that teach the AI how
        to perform specific tasks using existing tools.
      </Text>
      <Text />
      <Text>
        SA comes with bundled skills (like skill-creator and clawhub).
        You can also install more skills later.
      </Text>
      <Text />
      <Text>Enable bundled skills?</Text>
      <Text />
      <Box flexDirection="column">
        <Text>
          {selected === 0 ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
          Yes, enable all bundled skills
        </Text>
        <Text>
          {selected === 1 ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
          Skip for now (you can enable skills later)
        </Text>
      </Box>
      <Text />
      <Text dimColor>↑↓ to select | Enter to proceed | Esc to go back</Text>
    </Box>
  );
}
