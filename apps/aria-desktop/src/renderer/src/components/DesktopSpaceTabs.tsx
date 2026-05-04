import { Tabs, TabsList, TabsTrigger } from "./ui/tabs.js";

export type DesktopSpace = "aria" | "projects";

type DesktopSpaceTabsProps = {
  activeSpace: DesktopSpace;
  onSelectSpace: (space: DesktopSpace) => void;
};

const SPACES: ReadonlyArray<{ id: DesktopSpace; label: string }> = [
  { id: "aria", label: "Chat" },
  { id: "projects", label: "Projects" },
];

function isDesktopSpace(value: unknown): value is DesktopSpace {
  return value === "aria" || value === "projects";
}

export function DesktopSpaceTabs({ activeSpace, onSelectSpace }: DesktopSpaceTabsProps) {
  return (
    <Tabs
      className="desktop-space-tabs-root"
      value={activeSpace}
      onValueChange={(value) => {
        if (isDesktopSpace(value)) {
          onSelectSpace(value);
        }
      }}
    >
      <TabsList className="desktop-space-tabs" aria-label="Workspace space">
        {SPACES.map((space) => (
          <TabsTrigger
            key={space.id}
            className={(state) => `desktop-space-tab${state.active ? " is-active" : ""}`}
            value={space.id}
          >
            {space.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
