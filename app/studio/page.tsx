import { Suspense } from "react";
import QattanStudio from "../../components/qattan/QattanStudio";
import { resolveStudioMode } from "../../tools/registry";

type StudioPageProps = {
  searchParams?: Promise<{ mode?: string | string[] }>;
};

function parseMode(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? "";
}

function StudioFallback() {
  return <div style={{ minHeight: "100vh", background: "#0a0f1d" }} aria-hidden="true" />;
}

export default async function StudioPage({ searchParams }: StudioPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const initialMode = resolveStudioMode(parseMode(params?.mode));
  return (
    <Suspense fallback={<StudioFallback />}>
      <QattanStudio locale="en" initialMode={initialMode} />
    </Suspense>
  );
}
