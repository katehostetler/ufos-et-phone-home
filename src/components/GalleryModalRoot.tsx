import { useEffect, useState } from "react";
import RecordModal from "./RecordModal";
import type { Record } from "@/types/record";

interface Props {
  records: Record[];
}

/**
 * Mounted on every gallery page (videos / photos / files / no-location).
 * Listens for `record-modal-open` window events (dispatched by RecordCard
 * clicks) and renders the shared RecordModal in-place — so users never get
 * bounced out to war.gov / DVIDS just to view a record.
 */
export default function GalleryModalRoot({ records }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<string>;
      setActiveId(ce.detail);
    };
    window.addEventListener("record-modal-open", onOpen);
    return () => window.removeEventListener("record-modal-open", onOpen);
  }, []);

  if (!activeId) return null;
  const rec = records.find((r) => r.id === activeId);
  if (!rec) return null;

  return <RecordModal records={[rec]} onClose={() => setActiveId(null)} closeLabel="BACK TO GALLERY" />;
}
