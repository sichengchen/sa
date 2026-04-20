# DESIGN

This file stores design decisions for Aria Desktop and Aria Mobile.

## Decisions

### 001. No Nested Boxes

Scope: Desktop, Mobile

Nested boxes are forbidden.

### 002. Use Screen Space Efficiently

Scope: Desktop, Mobile

Design should emphasize high-efficiency use of screen space.

### 003. Prefer Clear Icons And Minimal Copy

Scope: Desktop, Mobile

If a semantically clear icon can replace text, use the icon.

If short text can replace explanatory copy, use the short text.

Verbose UI is forbidden. Keep the interface concise, efficient, and intuitive.

### 004. Abstract Reusable UI And Record Fixed Rules

Scope: Desktop, Mobile

Anything that can be abstracted into a reusable component must be abstracted.

Any design rule that can be determined must be determined and recorded in this file.

Examples include typography scale, padding decisions, spacing rules, and similar system constraints.

Design must remain consistent.

### 005. Layout-Level Sidebar Controls Belong In The Top Toolbar

Scope: Desktop, Mobile

Sidebar collapse and expand controls that affect the overall layout belong in the top toolbar.

Do not place layout-level sidebar controls inside sidebars or as floating overlay buttons.

### 006. Desktop Chrome Must Stay Compact And Fixed

Scope: Desktop

Desktop top-level chrome must be compact to preserve screen space.

Fixed metrics:

- top toolbar height: `40px`
- sidebar header height: `36px`
- default panel padding: `12px`
- toolbar gap: `6px`
- toolbar control size: `24px`
- desktop title and pane title size: `12px`

### 007. Clear Layout Controls Use Icon-Only Buttons From A Shared Icon Library

Scope: Desktop, Mobile

When a layout control has a clear semantic icon, use a pure icon button instead of visible text.

Use a shared icon library rather than ad hoc inline glyphs or text arrows.

When an icon does not have state variants, show the active state with the same treatment as hover.

Reusable icon-toggle buttons must be abstracted as shared components.

### 008. Neutral Palette Uses Only Black, White, And Pure Gray

Scope: Desktop, Mobile

The interface palette must use only black, white, and neutral gray values.

Do not use tinted gray, biased gray, or colored accent grays.

Interactive hover and emphasis states must also remain neutral, using grayscale fills or black alpha overlays rather than color accents.

### 009. Desktop Uses A Primary-Left Split Hierarchy

Scope: Desktop

Desktop layout hierarchy is fixed as follows:

1. the page first splits into the left sidebar and the remaining main area
2. the main area then splits vertically into the top toolbar and the lower work area
3. the lower work area then splits horizontally into the center area and the right sidebar

### 010. Left Sidebar Topbar Shares The Main Topbar Pattern

Scope: Desktop

The left sidebar top space and the main top space must use the same topbar layout pattern.

When the left sidebar is expanded, left-sidebar-specific toolbar items stay in the left sidebar topbar.

When the left sidebar is collapsed, those items move into the main topbar's left toolbar.

### 011. Desktop Center Work Area Can Host A Bottom Utility Bar

Scope: Desktop

Inside the main area, the center work region may include a collapsible bottom utility bar.

The bottom utility bar belongs only to the center work region, not under the right sidebar.

Its layout-level toggle belongs in the main topbar's right toolbar.

### 012. All Layout Collapse And Expand Actions Must Animate Smoothly

Scope: Desktop, Mobile

All layout-level collapse and expand actions must use smooth motion.

Resize dragging should remain direct and should not be slowed by transition effects.

### 013. Desktop Pane Boundaries Use Single-Pixel Dividers

Scope: Desktop

Boundaries between desktop panes must read as a single-pixel divider.

Do not use wide gutter bands, transition strips, or oversized separator fills between adjacent panes.

### 014. Desktop Sidebar Uses A Split Navigation Stack

Scope: Desktop

The left sidebar is split into a scrollable primary navigation region and a fixed footer action region.

Persistent shell actions such as settings belong in the fixed footer, not mixed into the project/thread list.

### 015. Settings Occupies The Main Workspace Without Secondary Chrome

Scope: Desktop

When desktop settings is active, it occupies the full main workspace to the right of the left sidebar.

Hide the main topbar, right inspector, and bottom utility bar on settings pages.

### 016. Project Header Rows Own Thread Actions

Scope: Desktop

Each project header row owns thread disclosure and thread creation through icon-only buttons aligned on the right.

Threads render directly beneath their project header and do not duplicate those group-level actions elsewhere.

### 017. Desktop Sidebar Typography Uses A Fixed Navigation Scale

Scope: Desktop

Sidebar typography must use a fixed scale instead of inheriting document text sizes.

Fixed metrics:

- project header label size: `12px`, weight `600`
- sidebar footer action label size: `12px`, weight `600`
- thread row label size: `11px`, weight `500`
- thread row metadata size: `11px`

### 018. Sidebar Tree Disclosure Uses Animated Height Transitions

Scope: Desktop

Project thread groups in the left sidebar must collapse and expand with smooth height and opacity transitions.

Do not mount and unmount the thread list instantly when the operator toggles a project group.

### 019. Icon-Variant Disclosure Controls Do Not Repeat State With Active Fill

Scope: Desktop, Mobile

When a disclosure or toggle control already changes to a distinct semantic icon between states, do not also add an active background or pressed-style fill just to restate that same state.

Keep hover treatment for affordance, but use one state signal, not two.

### 020. Desktop Main Topbar Shows Project Identity On The Left And Thread Identity In The Title

Scope: Desktop

In project-thread views, the main topbar's left context shows the active project identity using the repo or directory name.

The centered main title shows the active thread title.

### 021. Empty Desktop Work Surfaces Must Expose The Primary Recovery Action

Scope: Desktop

When a desktop work surface is empty, it must show the shortest clear action that lets the operator enter a working state.

If that action is already semantically obvious, do not add explanatory title or helper copy around it.

For the `Projects` center pane with no imported project, that action is project import.

### 022. Desktop Space Switching Uses Compact Topbar Tabs

Scope: Desktop

The primary switch between `Projects` and `Aria` belongs in the left sidebar topbar and must render as a compact tab control.

Those tabs must drive a real workspace change rather than acting as decorative labels.

### 023. Desktop Aria Sidebar Mixes Static Tools With Chat Threads

Scope: Desktop

In the `Aria` space, the left sidebar may combine fixed destination buttons and a thread list in one navigation stack.

The order is fixed:

- static tool screens first
- a divider
- the `Chat` thread section
- the footer settings action last

### 024. Desktop Aria Chat Uses A Centered Assistant Lane And Right-Aligned User Bubbles

Scope: Desktop

In desktop `Aria > Chat`, assistant messages render in a wide centered lane without bubbles.

User messages render in compact right-aligned bubbles.

When a selected chat thread has no messages yet, the center pane shows only the centered composer with the send action.

### 025. Desktop Aria Chat Shares One Conversation Lane And Shows Streaming Thinking State

Scope: Desktop

In active desktop `Aria > Chat`, the transcript and the composer must align to the same centered conversation lane so left and right workspace gutters stay visually consistent.

While a response is streaming and assistant text has not fully settled, the assistant lane must show a neutral `Thinking` status with motion instead of leaving the stream visually blank.

### 026. Desktop Aria Session Row Actions Reveal On Hover At The Right Edge

Scope: Desktop

In the desktop `Aria` session list, secondary row actions must stay icon-only and reveal on hover or focus instead of adding persistent text controls.

When present, both actions live on the right edge of the row. `Pin` appears to the left of `Archive`, and pinning reorders that session to the top of the list.

### 027. Untitled Desktop Aria Sessions Use New Session

Scope: Desktop

When a desktop `Aria` session has no explicit title and no usable summary-derived label yet, its fallback title is `New Session`.

### 028. Desktop Ask User Prompts Sit Above The Composer And Reuse Composer Chrome

Scope: Desktop

In desktop `Aria > Chat`, pending `ask_user` prompts must render immediately above the composer instead of inside the transcript stream.

### 033. Desktop Prompt Reference Suggestions Stay Inline And Compact

Scope: Desktop

Prompt reference suggestions such as `$skills` and `@files` must open adjacent to the composer, not inside the input box.

Use one compact flat list treatment with minimal padding.

Do not introduce nested boxes, repeated metadata, or decorative sub-panels just to resolve prompt references.

### 029. Desktop Project Threads Reuse The Aria Conversation Lane

Scope: Desktop

In desktop `Projects > Active Thread`, the transcript and composer must reuse the same centered conversation lane, message spacing, and composer chrome as desktop `Aria > Chat`.

Do not duplicate the project and thread identity inside the center pane when that identity is already present in desktop chrome.

Project-specific quick controls such as the current branch and active coding agent live in a compact row directly beneath the composer, while richer status stays in the inspector.

When present in desktop `Projects > Active Thread`, the composer-adjacent quick controls are ordered as follows:

- left side: branch/environment
- right side: model

Those quick controls use one compact typography scale across the trigger and menu rows, and their menu padding stays tighter than the main composer shell.

Free-text answers reuse the same rounded neutral shell language as the composer, with the answer field and submit control aligned to that chrome.

### 030. Desktop Approval Prompts Share The Composer-Adjacent Action Layer

Scope: Desktop

In desktop `Aria > Chat`, pending approvals render in the same composer-adjacent action layer as pending questions instead of inside the transcript stream.

Approval controls use compact pill buttons with the primary action emphasized, while tool-call details stay in a restrained neutral shell.

### 031. Desktop Tool Activity Uses Inline Process Rows Instead Of Cards

Scope: Desktop

In desktop `Aria > Chat`, tool and system activity inside the transcript render as compact inline process rows with a small leading icon and subdued copy.

Routine tool activity must not use boxed card containers unless the interaction requires direct user action.

### 032. Desktop Project Branch Menus Use A Dedicated Create-Branch Popover

Scope: Desktop

In desktop `Projects > Active Thread`, the branch/environment composer control may create and immediately switch to a new local branch without leaving the active thread.

That creation affordance starts from the branch dropdown but opens a dedicated popover instead of embedding a free-text form inline inside the branch list.

The branch dropdown itself must avoid repeating information the trigger already shows. List branch names once, and do not restate the selected environment label inside each branch row.

The branch dropdown uses one outer shell only. Do not render nested boxed rows or boxed footer actions inside that shell.

The popover owns the branch name field, one close affordance, and the primary `Create and checkout` action.

Fixed desktop create-branch popover metrics:

- max width: `560px`
- outer padding: `16px`
- section gap: `16px`
- title size: `16px`
- input height: `36px`
- action button height: `36px`

Creating a branch from this control must produce a dedicated local worktree environment rather than mutating the shared main checkout in place.
