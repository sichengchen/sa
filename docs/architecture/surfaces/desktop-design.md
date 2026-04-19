# Desktop Design

This page defines the target interaction and visual design for `Aria Desktop`.

It is not an implementation note. It is the design contract the desktop shell should satisfy before a desktop rewrite is considered shippable.

This page extends [desktop-and-mobile.md](./desktop-and-mobile.md). That page defines the client architecture and ownership model. This page defines the desktop workbench design, interaction model, and acceptance criteria.

## Purpose

`Aria Desktop` is not a landing page, onboarding document, or architecture explainer.

It is a workbench for active operator work.

The desktop shell must optimize for:

- fast context switching between `Aria` and `Projects`
- stable thread identity
- explicit environment switching
- durable visibility into runs, approvals, and review state
- low-friction local project work

The desktop must feel like a coding workbench, not a marketing surface and not a dashboard of descriptive cards.

## Design Stance

The desktop redesign should follow these workbench principles:

- pane-first layout instead of page-like sections
- restrained chrome and thin separators instead of oversized cards
- tabs and pane headers as the main navigation rhythm
- direct manipulation of work objects such as threads, sessions, approvals, and review items
- dense but readable operator UI

These principles still sit under Aria's own architecture:

- `Aria Agent` is server-only
- `Projects` remain unified across local and remote environments
- `Aria` and `Projects` are separate product spaces
- the environment switch belongs in the active thread view, not the sidebar tree

## Product Model

The desktop shell has four persistent regions:

1. top chrome
2. left sidebar
3. center work area
4. right inspector
5. bottom composer

The desktop shell has two top-level spaces:

- `Aria`
- `Projects`

These spaces are not cosmetic. Every screen in the desktop must belong to one of them.

### `Aria` space

The `Aria` space contains server-owned assistant work:

- `Chat`
- `Inbox`
- `Automations`
- `Connectors`

### `Projects` space

The `Projects` space contains unified project work:

- `Thread List`
- `Active Thread`

`Projects` must not split local and remote work into separate top-level trees. A thread stays one thread while its active environment changes.

## Design Principles

### 1. Workbench first

The first screen must already look operational.

The desktop should open into a usable workbench with visible navigation, a current screen, and contextual actions. It must not open into explanatory prose about how the product is organized.

### 2. One action path per control

If a control looks interactive, it must drive a real state transition.

No fake tabs.
No dead space pills.
No static inspector chips pretending to be navigation.

### 3. Thread-first center pane

The center pane is always the primary working surface.

For `Projects`, that means an active thread or thread list.
For `Aria`, that means the selected Aria screen.

### 4. Inspector, not second app

The right rail is contextual support for the active center pane.

It surfaces:

- review state
- changes
- environment data
- job state
- approvals
- artifacts

It must not become a separate page or duplicate the entire center pane.

### 5. Dense, calm visual language

The desktop should use:

- thin borders
- restrained backgrounds
- small tab bars
- compact headers
- small status pills only when they carry real state

The desktop should avoid:

- oversized rounded cards as the default layout unit
- large hero blocks
- explanatory banners
- decorative shadows as structure
- “dashboard card” composition

### 6. Empty and offline states are still navigable

An empty or disconnected desktop is still a functioning shell.

The user must still be able to:

- switch spaces
- switch screens
- inspect panels
- search sessions
- select a server
- choose an environment

The shell should degrade to missing data, not missing navigation.

## Desktop Information Architecture

## Top chrome

The top chrome owns:

- product identity
- active server switcher
- connection status
- active space
- active screen

It should be visually closer to an editor titlebar or workspace chrome than a page hero.

It should not contain:

- marketing copy
- architecture explanation
- duplicated thread metadata that already appears in the center pane

## Left sidebar

The left sidebar has two layers:

1. space and screen navigation
2. project and thread selection where applicable

### `Aria` sidebar behavior

When `Aria` is active, the sidebar should show:

- `Chat`
- `Inbox`
- `Automations`
- `Connectors`

These are first-class screens, not passive labels.

### `Projects` sidebar behavior

When `Projects` is active, the sidebar should show:

- unified project groups
- threads nested by project
- selection state for the active thread

The sidebar should not display environment selection for threads.

### Workspace and environment management

Workspace and environment management must be available from the desktop shell itself.

Rules:

- creating a workspace must not require dropping to the CLI
- creating an environment must not require dropping to the CLI
- workspace management must not replace the unified project-thread tree in the sidebar
- environment switching for a thread still belongs in the active thread view
- the inspector may host workspace and environment inventory plus creation forms

Recommended operator path:

1. create or open a project thread
2. create a workspace from the desktop shell when a new workspace is needed
3. create an environment attached to that workspace, or launch a dedicated create-branch popover from the thread environment switcher
4. switch the active thread onto that environment

The desktop may use desktop-local persistence for workspace and environment drafts,
but server-hosted Aria state remains server-owned.

## Center work area

The center work area changes by active space and screen.

### `Projects > Thread List`

Shows:

- grouped project threads
- enough metadata to scan thread status
- quick selection into `Active Thread`

### `Projects > Active Thread`

Shows:

- thread title
- project label
- thread type and status
- environment switcher
- active agent when known
- live stream of messages and runs

The `Projects > Active Thread` conversation surface reuses the same centered transcript lane and composer treatment as `Aria > Chat`.
Thread-specific project metadata stays in the compact thread header and inspector rather than introducing a second chat layout.
The environment switcher may also open a dedicated create-branch popover and immediately select the resulting local branch when the operator needs a fresh local worktree.

### `Aria > Chat`

Shows:

- Aria session stream
- composer
- session-level interaction state

### `Aria > Inbox`

Shows:

- pending approvals
- pending questions
- action items

### `Aria > Automations`

Shows:

- automation inventory
- automation status
- selected automation detail

### `Aria > Connectors`

Shows:

- connector threads
- selected connector conversation
- connector status

## Right inspector

The inspector always reflects the active center pane.

It has a tab strip for:

- `Review`
- `Changes`
- `Environment`
- `Job State`
- `Approvals`
- `Artifacts`

Only one inspector panel is active at a time.

Each inspector panel must have a defined data contract:

- `Review`
  - review findings
  - PR/review state where applicable
  - pending review actions
- `Changes`
  - changed files
  - branch/worktree metadata
  - diff summary
- `Environment`
  - active environment
  - local or remote target details
  - repo/worktree information
- `Job State`
  - run status
  - streaming state
  - failure state
- `Approvals`
  - pending approval requests
  - pending questions
  - approval actions
- `Artifacts`
  - recent sessions
  - links or handles to outputs

## Bottom composer

The composer is persistent and docked.

Rules:

- its scope must reflect the active thread or active Aria session
- it must stay visible across inspector changes
- it must not become the only visible control in empty states

The composer does not replace the center pane. It is an input surface attached to the current thread.

## State Model

The desktop shell must be driven by explicit state, not implicit DOM conditions.

Minimum shell state:

```ts
type DesktopShellState = {
  activeServerId: string;
  activeSpaceId: "aria" | "projects";
  activeScreenId: string;
  activeContextPanelId: "review" | "changes" | "environment" | "job" | "approvals" | "artifacts";
  activeThreadContext?: {
    threadId: string;
    projectLabel?: string;
    threadTitle?: string;
    environmentId?: string;
    environmentLabel?: string;
    threadTypeLabel?: string;
    statusLabel?: string;
    agentLabel?: string;
  };
  ariaRecentSessions: Array<{
    sessionId: string;
    archived: boolean;
    preview?: string;
    summary?: string;
  }>;
};
```

The desktop must expose pure transition functions for every visible interaction:

- `selectSpace(spaceId)`
- `selectScreen(screenId)`
- `selectContextPanel(panelId)`
- `switchServer(serverId)`
- `selectThread(threadId)`
- `selectEnvironment(environmentId)`
- `openSession(sessionId)`
- `searchSessions(query)`
- `sendMessage(message)`
- `stopSession()`
- `approveToolCall(toolCallId, approved)`
- `acceptToolCallForSession(toolCallId)`
- `answerQuestion(questionId, answer)`
- `createProjectThread(input)`
- `createWorkspace(input)`
- `createEnvironment(input)`

If a control exists in the UI, it must be backed by one of these transitions or an equally explicit replacement.

## Required Interaction Paths

The following paths must work before the desktop shell is considered usable.

### Global

1. switch server
2. switch space
3. switch center screen inside a space
4. switch inspector panel

### `Projects`

1. open `Projects`
2. scan project groups and threads
3. select thread
4. land in `Active Thread`
5. switch environment
6. inspect changes, environment, approvals, and artifacts
7. compose and send a message in the active thread

### `Aria`

1. open `Aria`
2. switch between `Chat`, `Inbox`, `Automations`, and `Connectors`
3. search sessions
4. open a past session
5. stop an active session
6. resolve approvals and questions when present

### Empty and offline

1. no thread selected but space/screen navigation still works
2. no sessions found but search still works
3. disconnected server still leaves navigation and switching intact

## Visual System

The desktop should follow this visual system:

- tabs are the primary rhythm for navigation, not cards
- pane headers define work areas
- chrome stays visually quiet
- information density is high but scan-friendly
- selected state is carried by border, background shift, and text emphasis

The desktop should avoid these failures:

- large informational cards for routine state
- rounded dashboard tiles as the core composition
- multiple unrelated status summaries competing in the first view
- duplicated labels across chrome, content, and inspector

### Visual defaults

- use thin separators between regions
- prefer neutral surfaces with one accent
- keep headings small and functional
- use pills only for meaningful state
- treat the center pane as the visual anchor

## Delivery Constraints

The implementation must respect these architecture constraints:

- `Aria Agent` remains server-only
- `Aria` space screens always represent server-hosted Aria work
- local project work remains separate from Aria-managed memory
- environment switching stays in the active thread view
- project threads remain unified across local and remote targets

## Validation Strategy

The desktop rewrite is not validated by appearance alone.

Validation happens in three layers.

### 1. Model transition tests

Tests must verify:

- space switching
- screen switching
- context panel switching
- server switching
- thread selection
- environment switching
- session loading and searching
- approval and question resolution

### 2. Interaction binding tests

Tests must verify that visible controls are wired:

- server switcher
- sidebar space tabs
- sidebar screen tabs
- thread buttons
- environment switcher
- inspector tabs
- session search
- session open buttons
- approval actions
- composer submit
- stop action

### 3. Path matrix tests

At minimum:

1. `Projects -> Thread List -> Active Thread -> Environment switch -> Compose`
2. `Projects -> Active Thread -> Review / Changes / Environment`
3. `Aria -> Chat -> Search session -> Open session -> Stop`
4. `Aria -> Inbox`
5. `Aria -> Automations`
6. `Aria -> Connectors`
7. disconnected shell remains navigable

## Acceptance Criteria

The desktop shell is acceptable only when all of the following are true:

- every visible navigation control changes real shell state
- `Aria` and `Projects` are both fully navigable spaces
- every space screen can render in empty, ready, and offline conditions
- the inspector switches panels without losing the center work surface
- thread selection and environment switching are real transitions
- no primary workflow depends on explanatory text to understand the layout
- the shell reads as a workbench, not a document or dashboard

## Implementation Guidance

The recommended implementation order is:

1. finish the shell state model
2. implement pure transition helpers
3. wire all navigation controls
4. implement all empty and offline states
5. add interaction tests
6. refine visuals last

The repo should not accept another desktop rewrite that starts from visual polish before the interactive path matrix is complete.
