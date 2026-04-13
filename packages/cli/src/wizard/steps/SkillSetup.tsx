import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { existsSync } from "node:fs";
import { BUNDLED_SKILLS_DIR, EMBEDDED_SKILLS } from "@aria/memory/skills/assets";
import { parseEmbeddedSkills, scanSkillDirectory } from "@aria/memory/skills/loader";
import type { SkillMetadata } from "@aria/memory/skills/types";

export interface SkillSetupData {
  selectedSkills: string[];
}

interface SkillSetupProps {
  currentValues?: { selectedSkills: string[] };
  onNext: (data: SkillSetupData) => void;
  onBack: () => void;
}

export function SkillSetup({ currentValues, onNext, onBack }: SkillSetupProps) {
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const discover = existsSync(BUNDLED_SKILLS_DIR)
      ? scanSkillDirectory(BUNDLED_SKILLS_DIR)
      : Promise.resolve(parseEmbeddedSkills(EMBEDDED_SKILLS));

    discover.then((found) => {
      setSkills(found);
      if (currentValues) {
        setChecked(new Set(currentValues.selectedSkills));
      } else {
        // Default: all selected (opt-out model)
        setChecked(new Set(found.map((s) => s.name)));
      }
      setLoading(false);
    });
  }, []);

  useInput((input, key) => {
    if (loading) return;

    if (key.escape) {
      onBack();
      return;
    }

    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(skills.length - 1, c + 1));
      return;
    }

    // Space toggles the current item
    if (input === " ") {
      const name = skills[cursor]?.name;
      if (!name) return;
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
      return;
    }

    // 'a' toggles all
    if (input === "a") {
      setChecked((prev) => {
        if (prev.size === skills.length) return new Set();
        return new Set(skills.map((s) => s.name));
      });
      return;
    }

    if (key.return) {
      onNext({
        selectedSkills: skills.filter((s) => checked.has(s.name)).map((s) => s.name),
      });
    }
  });

  if (loading) {
    return (
      <Box padding={1}>
        <Text>Discovering bundled skills...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Bundled Skills
      </Text>
      <Text />
      <Text>Choose which skills to activate. You can change this later.</Text>
      <Text />
      {skills.map((skill, i) => {
        const isChecked = checked.has(skill.name);
        const isCursor = i === cursor;
        return (
          <Text key={skill.name}>
            {isCursor ? (
              <Text color="green">{isChecked ? "[x] " : "[ ] "}</Text>
            ) : (
              <Text dimColor={!isChecked}>{isChecked ? "[x] " : "[ ] "}</Text>
            )}
            <Text bold={isCursor}>{skill.name}</Text>
            <Text dimColor> — {skill.description}</Text>
          </Text>
        );
      })}
      <Text />
      <Text dimColor>↑↓ navigate | Space toggle | a toggle all | Enter confirm | Esc back</Text>
    </Box>
  );
}
