import { ExperimentView } from "../../../components/experiment-view";

export default async function ExperimentPage({
  params,
  searchParams,
}: {
  params: Promise<{ experimentId: string }>;
  searchParams: Promise<{ source?: string; label?: string }>;
}) {
  const { experimentId } = await params;
  const resolvedSearchParams = await searchParams;
  return (
    <ExperimentView
      experimentId={decodeURIComponent(experimentId)}
      experimentLabel={resolvedSearchParams.label ? decodeURIComponent(resolvedSearchParams.label) : undefined}
      sourceName={resolvedSearchParams.source ? decodeURIComponent(resolvedSearchParams.source) : undefined}
    />
  );
}
