import { useEffect, useState } from "react";
import type { AriaDesktopRuntimeInfo } from "../../shared/api.js";

export function App() {
  const [runtimeInfo, setRuntimeInfo] = useState<AriaDesktopRuntimeInfo | null>(null);
  const [pingStatus, setPingStatus] = useState("Waiting for main process");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    void window.ariaDesktop
      .getRuntimeInfo()
      .then((info) => {
        if (!disposed) {
          setRuntimeInfo(info);
          setPingStatus("Desktop bridge ready");
        }
      })
      .catch((loadError: unknown) => {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load runtime info");
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  async function handlePing(): Promise<void> {
    setError(null);

    try {
      const response = await window.ariaDesktop.ping();
      setPingStatus(`Main process responded: ${response}`);
    } catch (pingError) {
      setError(pingError instanceof Error ? pingError.message : "Ping failed");
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="eyebrow">Esperta Aria</div>
        <h1>Aria Desktop</h1>
        <p>
          Minimal Electron shell is in place. Main, preload, and renderer are wired through a typed
          IPC bridge and ready for the workbench UI.
        </p>
        <div className="actions">
          <button type="button" onClick={handlePing}>
            Ping main process
          </button>
          <span className="status">{pingStatus}</span>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>Runtime</h2>
          <dl>
            <div>
              <dt>Product</dt>
              <dd>{runtimeInfo?.productName ?? "Loading..."}</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>{runtimeInfo?.platform ?? "Loading..."}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h2>Versions</h2>
          <dl>
            <div>
              <dt>Electron</dt>
              <dd>{runtimeInfo?.versions.electron ?? "Loading..."}</dd>
            </div>
            <div>
              <dt>Chromium</dt>
              <dd>{runtimeInfo?.versions.chrome ?? "Loading..."}</dd>
            </div>
            <div>
              <dt>Node</dt>
              <dd>{runtimeInfo?.versions.node ?? "Loading..."}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h2>Next</h2>
          <ul>
            <li>Move renderer shell state into `@aria/desktop` when the workbench starts.</li>
            <li>Add access-client connectivity for server-backed Aria threads.</li>
            <li>Add desktop-local bridge IPC for local project execution.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
