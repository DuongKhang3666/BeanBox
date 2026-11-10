import { Container } from "@/components/ui/Container";

/** Khung chung cho các trang auth: tiêu đề + thẻ nội dung hẹp, căn giữa. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Container className="py-8 sm:py-12">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-coffee-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="font-serif text-2xl font-bold text-coffee-900">{title}</h1>
        {description ? <p className="mt-2 text-sm text-coffee-700">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </Container>
  );
}

export const authLinkClass =
  "font-medium text-moss-700 underline underline-offset-2 hover:text-moss-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600";
