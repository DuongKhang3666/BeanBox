import type { AdminCategory } from "@/types/admin";

/** Cây 2 cấp -> danh sách phẳng, nhãn "Cha" hoặc "Cha / Con". */
export function categoryOptions(tree: AdminCategory[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const root of tree) {
    out.push({ id: root.id, label: root.name });
    for (const child of root.children ?? []) {
      out.push({ id: child.id, label: `${root.name} / ${child.name}` });
    }
  }
  return out;
}
