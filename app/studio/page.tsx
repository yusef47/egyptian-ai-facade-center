import QattanStudio from "../../components/qattan/QattanStudio";
import type { StudioMode } from "../../components/qattan/qattan-content";

const STUDIO_MODES: StudioMode[] = [
  "facade",
  "cad",
  "exterior",
  "interior",
  "sketch",
  "masterplan",
  "landscape",
  "staging",
  "enhancer",
];

type StudioPageProps = {
  searchParams?: Promise<{ mode?: string | string[] }>;
};

function parseMode(value: string | string[] | undefined): StudioMode {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && STUDIO_MODES.includes(candidate as StudioMode)
    ? (candidate as StudioMode)
    : "facade";
}

export default async function StudioPage({ searchParams }: StudioPageProps) {
  const params = searchParams ? await searchParams : undefined;
  return <QattanStudio locale="en" initialMode={parseMode(params?.mode)} />;
}
