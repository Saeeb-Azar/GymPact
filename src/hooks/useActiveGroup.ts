import { useCallback, useEffect, useState } from 'react';
import { useMemberships, type Membership } from './queries';

const STORAGE_KEY = 'gympact-active-group';

/**
 * Aktive Gruppe des Nutzers. Die meisten Nutzer haben genau eine Gruppe;
 * bei mehreren wird die Auswahl lokal gemerkt.
 */
export function useActiveGroup(): {
  memberships: Membership[];
  activeGroupId: string | undefined;
  activeMembership: Membership | undefined;
  setActiveGroupId: (id: string) => void;
  isLoading: boolean;
} {
  const { data: memberships = [], isLoading } = useMemberships();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  // Auswahl validieren: gelöschte/verlassene Gruppen nicht weiter anzeigen
  const valid = memberships.some((m) => m.group_id === selectedId);
  const activeGroupId = valid
    ? (selectedId ?? undefined)
    : memberships[0]?.group_id;

  useEffect(() => {
    if (!isLoading && selectedId && !valid && memberships.length > 0) {
      localStorage.setItem(STORAGE_KEY, memberships[0].group_id);
      setSelectedId(memberships[0].group_id);
    }
  }, [isLoading, selectedId, valid, memberships]);

  const setActiveGroupId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setSelectedId(id);
  }, []);

  return {
    memberships,
    activeGroupId,
    activeMembership: memberships.find((m) => m.group_id === activeGroupId),
    setActiveGroupId,
    isLoading,
  };
}
