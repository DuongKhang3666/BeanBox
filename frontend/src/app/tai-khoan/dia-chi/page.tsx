import type { Metadata } from "next";
import { AddressBook } from "@/features/account/components/AddressBook";

export const metadata: Metadata = {
  title: "Sổ địa chỉ",
  robots: { index: false },
};

export default function Page() {
  return <AddressBook />;
}
