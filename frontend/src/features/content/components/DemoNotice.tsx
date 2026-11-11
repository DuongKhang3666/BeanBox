import { DEMO_NOTICE } from "../policies";

export function DemoNotice() {
  return (
    <aside
      aria-label="Lưu ý"
      className="rounded-xl border border-moss-200 bg-moss-50 px-4 py-3 text-sm text-moss-800"
    >
      <strong className="font-semibold">Lưu ý:</strong> {DEMO_NOTICE}
    </aside>
  );
}
