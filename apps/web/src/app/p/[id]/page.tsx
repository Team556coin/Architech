import { EditorScreen } from "@/components/editor/EditorScreen";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorScreen key={id} id={id} />;
}
