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
