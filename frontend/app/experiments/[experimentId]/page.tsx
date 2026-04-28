import { ExperimentView } from "../../../components/experiment-view";

export default async function ExperimentPage({
  params,
}: {
  params: Promise<{ experimentId: string }>;
}) {
  const { experimentId } = await params;
  return <ExperimentView experimentId={decodeURIComponent(experimentId)} />;
}
