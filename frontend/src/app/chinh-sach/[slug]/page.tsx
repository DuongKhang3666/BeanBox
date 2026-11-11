import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { PolicyArticle } from "@/features/content/components/PolicyArticle";
import { POLICIES, POLICY_SLUGS, isPolicySlug } from "@/features/content/policies";

export const dynamicParams = false;

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isPolicySlug(slug)) return { title: "Không tìm thấy trang" };
  const { title, description } = POLICIES[slug];
  return { title, description, alternates: { canonical: `/chinh-sach/${slug}` } };
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  if (!isPolicySlug(slug)) notFound();
  return (
    <Container className="py-8">
      <PolicyArticle policy={POLICIES[slug]} />
    </Container>
  );
}
