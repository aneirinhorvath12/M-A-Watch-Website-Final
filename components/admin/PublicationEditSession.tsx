"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import styles from "./admin.module.css";

type SaveResult = { version?: number; resetBody?: string };
type EditSession = {
  version: number;
  busy: boolean;
  articleDirty: boolean;
  setArticleDirty(dirty: boolean): void;
  begin(): boolean;
  finish(result?: SaveResult): void;
  bodyReset: { value: string; key: number } | null;
};

const Context = createContext<EditSession | null>(null);
export const usePublicationEditSession = () => useContext(Context);

/** Local successful saves advance all forms together. An external refresh must
 * never silently bless stale, uncontrolled form fields as the latest revision. */
export function PublicationEditSession({ version: serverVersion, children }: {
  version: number;
  children: ReactNode;
}) {
  const [version, setVersion] = useState(serverVersion);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [articleDirty, setArticleDirty] = useState(false);
  const [bodyReset, setBodyReset] = useState<EditSession["bodyReset"]>(null);
  const begin = useCallback(() => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    return true;
  }, []);
  const finish = useCallback((result?: SaveResult) => {
    if (typeof result?.version === "number") setVersion(result.version);
    if (typeof result?.resetBody === "string") {
      const value = result.resetBody;
      setBodyReset((previous) => ({ value, key: (previous?.key ?? 0) + 1 }));
    }
    locked.current = false;
    setBusy(false);
  }, []);
  return (
    <Context.Provider value={{ version, busy, articleDirty, setArticleDirty, begin, finish, bodyReset }}>
      {serverVersion > version ? (
        <div className={styles.noticeWarning} role="status">
          This publication changed in another session or finished background processing.
          Your current inputs have been kept. Copy any unsaved changes before reloading to see the latest version.
          {" "}<button className={styles.buttonSecondary} type="button" onClick={() => window.location.reload()}>Reload latest version</button>
        </div>
      ) : null}
      {children}
    </Context.Provider>
  );
}
