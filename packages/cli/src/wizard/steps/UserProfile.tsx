import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface UserProfileData {
  userName: string;
  timezone: string;
  communicationStyle: string;
  aboutMe: string;
}

interface UserProfileProps {
  onNext: (data: UserProfileData) => void;
  onBack: () => void;
  currentValues?: UserProfileData;
}

const STYLE_OPTIONS = ["", "concise", "detailed", "casual"];
const STYLE_LABELS = ["skip", "concise", "detailed", "casual"];

type Field = "userName" | "timezone" | "communicationStyle" | "aboutMe";
const FIELD_ORDER: Field[] = ["userName", "timezone", "communicationStyle", "aboutMe"];

export function UserProfile({ onNext, onBack, currentValues }: UserProfileProps) {
  const [phase, setPhase] = useState<"keep-or-change" | "edit">(
    currentValues ? "keep-or-change" : "edit",
  );
  const [field, setField] = useState<Field>("userName");
  const [userName, setUserName] = useState(currentValues?.userName ?? "");
  const [timezone, setTimezone] = useState(currentValues?.timezone ?? "");
  const [styleIndex, setStyleIndex] = useState(() => {
    if (!currentValues?.communicationStyle) return 0;
    const idx = STYLE_OPTIONS.indexOf(currentValues.communicationStyle);
    return idx >= 0 ? idx : 0;
  });
  const [aboutMe, setAboutMe] = useState(currentValues?.aboutMe ?? "");
  const [showNameError, setShowNameError] = useState(false);

  useInput((input, key) => {
    if (phase === "keep-or-change") {
      if (key.escape) {
        onBack();
        return;
      }
      if (input?.toLowerCase() === "k" && currentValues) {
        onNext(currentValues);
        return;
      }
      if (input?.toLowerCase() === "c") {
        setPhase("edit");
        return;
      }
      return;
    }

    if (key.escape) {
      if (currentValues) {
        setPhase("keep-or-change");
        return;
      }
      onBack();
      return;
    }

    if (key.return) {
      const idx = FIELD_ORDER.indexOf(field);

      // Validate userName
      if (field === "userName" && !userName.trim()) {
        setShowNameError(true);
        return;
      }

      if (idx < FIELD_ORDER.length - 1) {
        setField(FIELD_ORDER[idx + 1]);
      } else {
        onNext({
          userName: userName.trim(),
          timezone: timezone.trim(),
          communicationStyle: STYLE_OPTIONS[styleIndex],
          aboutMe: aboutMe.trim(),
        });
      }
      return;
    }

    // Communication style: cycle with left/right arrows or tab
    if (field === "communicationStyle") {
      if (key.tab || key.rightArrow) {
        setStyleIndex((i) => (i + 1) % STYLE_OPTIONS.length);
        return;
      }
      if (key.leftArrow) {
        setStyleIndex((i) => (i - 1 + STYLE_OPTIONS.length) % STYLE_OPTIONS.length);
        return;
      }
      // Enter handled above; ignore other keys for this field
      return;
    }

    if (key.backspace || key.delete) {
      if (field === "userName") {
        setUserName((v) => v.slice(0, -1));
        setShowNameError(false);
      } else if (field === "timezone") {
        setTimezone((v) => v.slice(0, -1));
      } else if (field === "aboutMe") {
        setAboutMe((v) => v.slice(0, -1));
      }
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      if (field === "userName") {
        setUserName((v) => v + input);
        setShowNameError(false);
      } else if (field === "timezone") {
        setTimezone((v) => v + input);
      } else if (field === "aboutMe") {
        setAboutMe((v) => v + input);
      }
    }
  });

  if (phase === "keep-or-change" && currentValues) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Your Profile
        </Text>
        <Text />
        <Text>Current configuration:</Text>
        <Text> Name: {currentValues.userName}</Text>
        <Text> Timezone: {currentValues.timezone || "(not set)"}</Text>
        <Text> Style: {currentValues.communicationStyle || "(not set)"}</Text>
        {currentValues.aboutMe && <Text> About: {currentValues.aboutMe}</Text>}
        <Text />
        <Text>
          <Text color="yellow" bold>
            [K]
          </Text>{" "}
          Keep current{"  "}
          <Text color="yellow" bold>
            [C]
          </Text>{" "}
          Change{"    "}
          <Text dimColor>Esc to go back</Text>
        </Text>
      </Box>
    );
  }

  const isActive = (f: Field) => field === f;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Your Profile
      </Text>
      <Text dimColor>Tell the agent a bit about yourself. Only name is required.</Text>
      <Text />
      <Box>
        <Text color={isActive("userName") ? "blue" : "white"} bold={isActive("userName")}>
          Name:{" "}
        </Text>
        <Text>{userName}</Text>
        {isActive("userName") && <Text color="blue">{"▊"}</Text>}
      </Box>
      {showNameError && <Text color="red"> Name is required</Text>}
      <Box>
        <Text color={isActive("timezone") ? "blue" : "white"} bold={isActive("timezone")}>
          Timezone:{" "}
        </Text>
        <Text>{timezone || (isActive("timezone") ? "" : "")}</Text>
        {isActive("timezone") && <Text color="blue">{"▊"}</Text>}
        {isActive("timezone") && !timezone && <Text dimColor> e.g. America/New_York</Text>}
      </Box>
      <Box>
        <Text
          color={isActive("communicationStyle") ? "blue" : "white"}
          bold={isActive("communicationStyle")}
        >
          Style:{" "}
        </Text>
        {STYLE_LABELS.map((label, i) => (
          <Text key={label}>
            {i > 0 && " / "}
            <Text
              bold={i === styleIndex}
              color={i === styleIndex ? "green" : undefined}
              underline={i === styleIndex}
            >
              {label}
            </Text>
          </Text>
        ))}
        {isActive("communicationStyle") && <Text dimColor> ←/→ to pick, Enter to confirm</Text>}
      </Box>
      <Box>
        <Text color={isActive("aboutMe") ? "blue" : "white"} bold={isActive("aboutMe")}>
          About me:{" "}
        </Text>
        <Text>{aboutMe}</Text>
        {isActive("aboutMe") && <Text color="blue">{"▊"}</Text>}
        {isActive("aboutMe") && !aboutMe && (
          <Text dimColor> optional — anything else the agent should know</Text>
        )}
      </Box>
      <Text />
      <Text dimColor>Enter to proceed | Esc to go back</Text>
    </Box>
  );
}
