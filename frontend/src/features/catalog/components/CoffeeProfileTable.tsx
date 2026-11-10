import type { CoffeeProfile } from "@/types/catalog";
import { BREW_LABELS, PROCESS_LABELS, ROAST_LABELS } from "../labels";

export function CoffeeProfileTable({ coffee }: { coffee: CoffeeProfile }) {
  const origin = [coffee.originCountry, coffee.originRegion].filter(Boolean).join(" – ");
  const rows: Array<{ label: string; value: React.ReactNode }> = [];

  if (origin) rows.push({ label: "Xuất xứ", value: origin });
  if (coffee.variety) rows.push({ label: "Giống", value: coffee.variety });
  if (coffee.process) rows.push({ label: "Sơ chế", value: PROCESS_LABELS[coffee.process] });
  if (coffee.roastLevel) rows.push({ label: "Mức rang", value: ROAST_LABELS[coffee.roastLevel] });
  if (coffee.altitude != null) {
    rows.push({ label: "Độ cao", value: `${coffee.altitude.toLocaleString("vi-VN")} m` });
  }
  if (coffee.tastingNotes.length > 0) {
    rows.push({
      label: "Hương vị",
      value: (
        <ul className="flex flex-wrap gap-1.5">
          {coffee.tastingNotes.map((n) => (
            <li
              key={n}
              className="rounded-full bg-moss-100 px-2.5 py-0.5 text-xs font-medium text-moss-800"
            >
              {n}
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (coffee.brewMethods.length > 0) {
    rows.push({
      label: "Cách pha phù hợp",
      value: coffee.brewMethods.map((m) => BREW_LABELS[m]).join(", "),
    });
  }
  if (rows.length === 0) return null;

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Thông tin cà phê</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-coffee-200 last:border-0">
            <th
              scope="row"
              className="w-2/5 py-2.5 pr-3 text-left align-top font-medium text-coffee-700"
            >
              {r.label}
            </th>
            <td className="py-2.5 text-coffee-900">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
