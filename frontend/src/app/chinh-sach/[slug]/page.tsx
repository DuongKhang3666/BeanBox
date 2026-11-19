import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { PolicyArticle } from "@/features/content/components/PolicyArticle";
import { buildPolicies, POLICY_SLUGS, isPolicySlug } from "@/features/content/policies";
import { getPublicSettings } from "@/features/content/publicSettings";

export const dynamicParams = false;
/** ISR: số liệu từ /settings/public cập nhật trong khoảng 5 phút. */
export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isPolicySlug(slug)) return { title: "Không tìm thấy trang" };
  const { title, description } = buildPolicies(await getPublicSettings())[slug];
  return { title, description, alternates: { canonical: `/chinh-sach/${slug}` } };
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  if (!isPolicySlug(slug)) notFound();
  const policies = buildPolicies(await getPublicSettings());
  return (
    <Container className="py-8">
      <PolicyArticle policy={policies[slug]} />
    </Container>
  );
}
