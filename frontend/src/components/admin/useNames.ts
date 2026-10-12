import { useState } from 'react';
import type { Pseudonym } from '@logisticai/shared';
import { adminApi } from '../../api/admin';

/** Pseudonimi di default; i nomi reali si caricano solo su richiesta (registrata nell'audit). */
export function useNames() {
  const [names, setNames] = useState<Record<string, string> | null>(null);
  const reveal = async () => setNames(await adminApi.revealNames());
  const label = (u: Pseudonym) => (names?.[u.id] ? `${names[u.id]} (${u.alias})` : u.alias);
  return { revealed: !!names, reveal, hide: () => setNames(null), label };
}
