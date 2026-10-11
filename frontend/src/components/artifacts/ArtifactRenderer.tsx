import type { Artifact } from '@logisticai/shared';
import { DataChart } from './DataChart';
import { DataTable } from './DataTable';

export function ArtifactRenderer({ artifact }: { artifact: Artifact }) {
  return artifact.kind === 'chart' ? <DataChart spec={artifact} /> : <DataTable spec={artifact} />;
}
