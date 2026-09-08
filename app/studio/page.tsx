import QattanStudio, { resolveStudioMode } from "../../components/qattan/QattanStudio";

type StudioPageProps = {
  searchParams?: Promise<{ mode?: string | string[] }>;
};

function parseMode(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? "";
}

export default async function StudioPage({ searchParams }: StudioPageProps) {
  const params = searchParams ? await searchParams : undefined;
  return <QattanStudio locale="en" initialMode={resolveStudioMode(parseMode(params?.mode) as never)} />;
}
