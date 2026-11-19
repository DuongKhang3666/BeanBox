// Liveness cho healthcheck container (D-030): không gọi backend, không cache.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
