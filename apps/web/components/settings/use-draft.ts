"use client";
import { useEffect, useRef, useState } from "react";

/** Form draft that tracks dirtiness against the server value and adopts server changes only while clean. */
export function useDraft<T>(server: T) {
  const serverKey = JSON.stringify(server);
  const [draft, setDraft] = useState<T>(server);
  const lastServerKey = useRef(serverKey);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (lastServerKey.current === serverKey) return;
    const wasDirty = JSON.stringify(draftRef.current) !== lastServerKey.current;
    lastServerKey.current = serverKey;
    if (!wasDirty) setDraft(JSON.parse(serverKey) as T);
  }, [serverKey]);

  return { draft, setDraft, dirty: JSON.stringify(draft) !== serverKey, reset: () => setDraft(JSON.parse(serverKey) as T) };
}
