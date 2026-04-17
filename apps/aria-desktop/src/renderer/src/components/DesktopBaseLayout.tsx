import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  SquareTerminal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LayoutToggleIconButton } from "./LayoutToggleIconButton.js";

const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 320;
const DEFAULT_BOTTOM_HEIGHT = 180;
const MIN_LEFT_WIDTH = 220;
const MIN_RIGHT_WIDTH = 240;
const MIN_CENTER_WIDTH = 360;
const MIN_BOTTOM_HEIGHT = 120;
const MIN_CENTER_HEIGHT = 180;
const RESIZE_HANDLE_WIDTH = 1;

export type DesktopBaseLayoutToolbarItem = {
  id: string;
  content: ReactNode;
  side?: "left" | "right";
};

type LayoutState = {
  bottomCollapsed: boolean;
  bottomHeight: number;
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
};

type DragState = {
  side: "left" | "right" | "bottom";
  startBottomHeight: number;
  startX: number;
  startY: number;
  startLeftWidth: number;
  startRightWidth: number;
};

export type DesktopBaseLayoutProps = {
  bottomBar?: ReactNode;
  bottomBarTitle?: ReactNode;
  center: ReactNode;
  leftSidebar: ReactNode;
  leftSidebarTitle?: ReactNode;
  leftSidebarToolbarItems?: DesktopBaseLayoutToolbarItem[];
  rightSidebar?: ReactNode;
  rightSidebarTitle?: ReactNode;
  showMainTopbar?: boolean;
  title?: ReactNode;
  toolbarItems?: DesktopBaseLayoutToolbarItem[];
};

type LayoutTopbarProps = {
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  title?: ReactNode;
  className?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getVisibleSidebarWidth(width: number, collapsed: boolean): number {
  return collapsed ? 0 : width;
}

function getHandleWidth(collapsed: boolean): number {
  return collapsed ? 0 : RESIZE_HANDLE_WIDTH;
}

function getMinCenterWidth(shellWidth: number): number {
  return Math.max(220, Math.min(MIN_CENTER_WIDTH, shellWidth - RESIZE_HANDLE_WIDTH * 2));
}

function getMaxBottomHeight(contentHeight: number): number {
  return Math.max(MIN_BOTTOM_HEIGHT, contentHeight - MIN_CENTER_HEIGHT - RESIZE_HANDLE_WIDTH);
}

function normalizeLayout(
  layout: LayoutState,
  shellWidth: number,
  contentHeight: number,
  hasBottomBar: boolean,
  hasRightSidebar: boolean,
): LayoutState {
  if (shellWidth <= 0 || contentHeight <= 0) {
    return layout;
  }

  const minCenterWidth = getMinCenterWidth(shellWidth);
  const bottomCollapsed = hasBottomBar ? layout.bottomCollapsed : true;
  const rightCollapsed = hasRightSidebar ? layout.rightCollapsed : true;
  let nextLeftWidth = layout.leftWidth;
  let nextRightWidth = layout.rightWidth;

  if (!layout.leftCollapsed) {
    const rightVisibleWidth = getVisibleSidebarWidth(nextRightWidth, rightCollapsed);
    const rightHandleWidth = getHandleWidth(rightCollapsed);
    const maxLeftWidth = Math.max(
      MIN_LEFT_WIDTH,
      shellWidth - minCenterWidth - rightVisibleWidth - rightHandleWidth - RESIZE_HANDLE_WIDTH,
    );

    nextLeftWidth = clamp(nextLeftWidth, MIN_LEFT_WIDTH, maxLeftWidth);
  }

  if (!rightCollapsed) {
    const leftVisibleWidth = getVisibleSidebarWidth(nextLeftWidth, layout.leftCollapsed);
    const leftHandleWidth = getHandleWidth(layout.leftCollapsed);
    const maxRightWidth = Math.max(
      MIN_RIGHT_WIDTH,
      shellWidth - minCenterWidth - leftVisibleWidth - leftHandleWidth - RESIZE_HANDLE_WIDTH,
    );

    nextRightWidth = clamp(nextRightWidth, MIN_RIGHT_WIDTH, maxRightWidth);
  }

  if (nextLeftWidth === layout.leftWidth && nextRightWidth === layout.rightWidth) {
    if (bottomCollapsed) {
      return layout;
    }

    const nextBottomHeight = clamp(
      layout.bottomHeight,
      MIN_BOTTOM_HEIGHT,
      getMaxBottomHeight(contentHeight),
    );

    if (nextBottomHeight === layout.bottomHeight) {
      return layout;
    }

    return {
      ...layout,
      bottomHeight: nextBottomHeight,
    };
  }

  let nextBottomHeight = layout.bottomHeight;

  if (!bottomCollapsed) {
    nextBottomHeight = clamp(
      nextBottomHeight,
      MIN_BOTTOM_HEIGHT,
      getMaxBottomHeight(contentHeight),
    );
  }

  return {
    ...layout,
    bottomHeight: nextBottomHeight,
    leftWidth: nextLeftWidth,
    rightWidth: nextRightWidth,
  };
}

function renderToolbarItems(items: DesktopBaseLayoutToolbarItem[]): ReactNode {
  return items.map((item) => (
    <div key={item.id} className="desktop-base-layout-toolbar-item">
      {item.content}
    </div>
  ));
}

function LayoutTopbar({ leftSlot, rightSlot, title, className }: LayoutTopbarProps) {
  return (
    <div className={`desktop-base-layout-topbar${className ? ` ${className}` : ""}`}>
      <div className="desktop-base-layout-toolbar desktop-base-layout-toolbar-left">{leftSlot}</div>
      <div className="desktop-base-layout-title">{title}</div>
      <div className="desktop-base-layout-toolbar desktop-base-layout-toolbar-right">
        {rightSlot}
      </div>
    </div>
  );
}

export function DesktopBaseLayout({
  bottomBar,
  bottomBarTitle,
  center,
  leftSidebar,
  leftSidebarTitle,
  leftSidebarToolbarItems = [],
  rightSidebar,
  rightSidebarTitle,
  showMainTopbar = true,
  title,
  toolbarItems = [],
}: DesktopBaseLayoutProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [shellWidth, setShellWidth] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [layout, setLayout] = useState<LayoutState>({
    bottomCollapsed: true,
    bottomHeight: DEFAULT_BOTTOM_HEIGHT,
    leftWidth: DEFAULT_LEFT_WIDTH,
    rightWidth: DEFAULT_RIGHT_WIDTH,
    leftCollapsed: false,
    rightCollapsed: true,
  });
  const hasBottomBar = bottomBar !== undefined && bottomBar !== null;
  const hasRightSidebar = rightSidebar !== undefined && rightSidebar !== null;

  const leftToolbarItems = toolbarItems.filter((item) => item.side !== "right");
  const rightToolbarItems = toolbarItems.filter((item) => item.side === "right");

  useEffect(() => {
    const shellElement = shellRef.current;

    if (!shellElement) {
      return;
    }

    setShellWidth(shellElement.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const nextEntry = entries[0];

      if (nextEntry) {
        setShellWidth(nextEntry.contentRect.width);
      }
    });

    observer.observe(shellElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const contentElement = contentRef.current;

    if (!contentElement) {
      return;
    }

    setContentHeight(contentElement.getBoundingClientRect().height);

    const observer = new ResizeObserver((entries) => {
      const nextEntry = entries[0];

      if (nextEntry) {
        setContentHeight(nextEntry.contentRect.height);
      }
    });

    observer.observe(contentElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!shellWidth || !contentHeight) {
      return;
    }

    setLayout((currentLayout) =>
      normalizeLayout(currentLayout, shellWidth, contentHeight, hasBottomBar, hasRightSidebar),
    );
  }, [contentHeight, hasBottomBar, hasRightSidebar, shellWidth]);

  useEffect(() => {
    if (!dragState || !shellWidth || !contentHeight) {
      return;
    }

    function handlePointerMove(event: PointerEvent): void {
      setLayout((currentLayout) => {
        const minCenterWidth = getMinCenterWidth(shellWidth);
        const rightCollapsed = hasRightSidebar ? currentLayout.rightCollapsed : true;

        if (dragState.side === "left") {
          const rightVisibleWidth = getVisibleSidebarWidth(
            currentLayout.rightWidth,
            rightCollapsed,
          );
          const rightHandleWidth = getHandleWidth(rightCollapsed);
          const maxLeftWidth = Math.max(
            MIN_LEFT_WIDTH,
            shellWidth -
              minCenterWidth -
              rightVisibleWidth -
              rightHandleWidth -
              RESIZE_HANDLE_WIDTH,
          );

          return {
            ...currentLayout,
            leftWidth: clamp(
              dragState.startLeftWidth + event.clientX - dragState.startX,
              MIN_LEFT_WIDTH,
              maxLeftWidth,
            ),
          };
        }

        const leftVisibleWidth = getVisibleSidebarWidth(
          currentLayout.leftWidth,
          currentLayout.leftCollapsed,
        );
        const leftHandleWidth = getHandleWidth(currentLayout.leftCollapsed);
        const maxRightWidth = Math.max(
          MIN_RIGHT_WIDTH,
          shellWidth - minCenterWidth - leftVisibleWidth - leftHandleWidth - RESIZE_HANDLE_WIDTH,
        );

        if (dragState.side === "right") {
          return {
            ...currentLayout,
            rightWidth: clamp(
              dragState.startRightWidth - (event.clientX - dragState.startX),
              MIN_RIGHT_WIDTH,
              maxRightWidth,
            ),
          };
        }

        return {
          ...currentLayout,
          bottomHeight: clamp(
            dragState.startBottomHeight - (event.clientY - dragState.startY),
            MIN_BOTTOM_HEIGHT,
            getMaxBottomHeight(contentHeight),
          ),
        };
      });
    }

    function stopDragging(): void {
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    document.body.classList.add("is-resizing");

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      document.body.classList.remove("is-resizing");
    };
  }, [contentHeight, dragState, hasRightSidebar, shellWidth]);

  function toggleLeftSidebar(): void {
    setLayout((currentLayout) => ({
      ...currentLayout,
      leftCollapsed: !currentLayout.leftCollapsed,
    }));
  }

  function toggleRightSidebar(): void {
    if (!hasRightSidebar) {
      return;
    }

    setLayout((currentLayout) => ({
      ...currentLayout,
      rightCollapsed: !currentLayout.rightCollapsed,
    }));
  }

  function toggleBottomBar(): void {
    if (!hasBottomBar) {
      return;
    }

    setLayout((currentLayout) => ({
      ...currentLayout,
      bottomCollapsed: !currentLayout.bottomCollapsed,
    }));
  }

  function startResize(side: "left" | "right" | "bottom", clientX: number, clientY: number): void {
    setDragState({
      side,
      startBottomHeight: layout.bottomHeight,
      startX: clientX,
      startY: clientY,
      startLeftWidth: layout.leftWidth,
      startRightWidth: layout.rightWidth,
    });
  }

  const shellTemplateColumns = [
    `${layout.leftCollapsed ? 0 : layout.leftWidth}px`,
    `${layout.leftCollapsed ? 0 : RESIZE_HANDLE_WIDTH}px`,
    "minmax(0, 1fr)",
  ].join(" ");

  const contentTemplateColumns = hasRightSidebar
    ? [
        "minmax(0, 1fr)",
        `${layout.rightCollapsed ? 0 : RESIZE_HANDLE_WIDTH}px`,
        `${layout.rightCollapsed ? 0 : layout.rightWidth}px`,
      ].join(" ")
    : "minmax(0, 1fr)";

  const centerTemplateRows = hasBottomBar
    ? [
        "minmax(0, 1fr)",
        `${layout.bottomCollapsed ? 0 : RESIZE_HANDLE_WIDTH}px`,
        `${layout.bottomCollapsed ? 0 : layout.bottomHeight}px`,
      ].join(" ")
    : "minmax(0, 1fr)";

  const collapsedSidebarControls = (
    <>
      <LayoutToggleIconButton
        icon={<PanelLeftOpen aria-hidden="true" />}
        label="Expand left sidebar"
        onClick={toggleLeftSidebar}
      />
      {renderToolbarItems(leftSidebarToolbarItems)}
    </>
  );

  return (
    <div
      ref={shellRef}
      className="desktop-base-layout-shell"
      style={{ gridTemplateColumns: shellTemplateColumns }}
    >
      {!showMainTopbar && layout.leftCollapsed ? (
        <div className="desktop-base-layout-floating-left-toolbar">{collapsedSidebarControls}</div>
      ) : null}

      <aside
        className={`pane pane-sidebar pane-left${layout.leftCollapsed ? " is-collapsed" : ""}`}
      >
        <LayoutTopbar
          className="desktop-base-layout-topbar-sidebar"
          leftSlot={
            <LayoutToggleIconButton
              icon={<PanelLeftClose aria-hidden="true" />}
              label="Collapse left sidebar"
              onClick={toggleLeftSidebar}
            />
          }
          rightSlot={renderToolbarItems(leftSidebarToolbarItems)}
          title={leftSidebarTitle}
        />
        <div className="pane-body">{leftSidebar}</div>
      </aside>

      <div
        className={`resize-handle${layout.leftCollapsed ? " is-collapsed" : ""}`}
        role="separator"
        aria-label="Resize left sidebar"
        aria-orientation="vertical"
        onPointerDown={(event) => startResize("left", event.clientX, event.clientY)}
      />

      <div className="desktop-base-layout-main">
        {showMainTopbar ? (
          <LayoutTopbar
            className="desktop-base-layout-topbar-main"
            title={title}
            leftSlot={
              <div className="desktop-base-layout-main-left-content">
                {layout.leftCollapsed ? collapsedSidebarControls : null}
                {renderToolbarItems(leftToolbarItems)}
              </div>
            }
            rightSlot={
              <>
                {renderToolbarItems(rightToolbarItems)}
                {hasBottomBar ? (
                  <LayoutToggleIconButton
                    active={!layout.bottomCollapsed}
                    icon={<SquareTerminal aria-hidden="true" />}
                    label={layout.bottomCollapsed ? "Expand bottom bar" : "Collapse bottom bar"}
                    onClick={toggleBottomBar}
                  />
                ) : null}
                {hasRightSidebar ? (
                  <LayoutToggleIconButton
                    icon={
                      layout.rightCollapsed ? (
                        <PanelRightOpen aria-hidden="true" />
                      ) : (
                        <PanelRightClose aria-hidden="true" />
                      )
                    }
                    label={
                      layout.rightCollapsed ? "Expand right sidebar" : "Collapse right sidebar"
                    }
                    onClick={toggleRightSidebar}
                  />
                ) : null}
              </>
            }
          />
        ) : null}

        <div
          ref={contentRef}
          className="desktop-base-layout-content"
          style={{ gridTemplateColumns: contentTemplateColumns }}
        >
          <div
            className="desktop-base-layout-center-stack"
            style={{ gridTemplateRows: centerTemplateRows }}
          >
            <section className="pane pane-center">
              <div className="pane-body">{center}</div>
            </section>

            {hasBottomBar ? (
              <>
                <div
                  className={`resize-handle resize-handle-horizontal${layout.bottomCollapsed ? " is-collapsed" : ""}`}
                  role="separator"
                  aria-label="Resize bottom bar"
                  aria-orientation="horizontal"
                  onPointerDown={(event) => startResize("bottom", event.clientX, event.clientY)}
                />

                <section
                  className={`pane pane-bottom${layout.bottomCollapsed ? " is-collapsed" : ""}`}
                >
                  <div className="pane-header">
                    <span className="pane-title">{bottomBarTitle}</span>
                  </div>
                  <div className="pane-body">{bottomBar}</div>
                </section>
              </>
            ) : null}
          </div>

          {hasRightSidebar ? (
            <>
              <div
                className={`resize-handle${layout.rightCollapsed ? " is-collapsed" : ""}`}
                role="separator"
                aria-label="Resize right sidebar"
                aria-orientation="vertical"
                onPointerDown={(event) => startResize("right", event.clientX, event.clientY)}
              />

              <aside
                className={`pane pane-sidebar pane-right${layout.rightCollapsed ? " is-collapsed" : ""}`}
              >
                <div className="pane-header">
                  <span className="pane-title">{rightSidebarTitle}</span>
                </div>
                <div className="pane-body">{rightSidebar}</div>
              </aside>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
