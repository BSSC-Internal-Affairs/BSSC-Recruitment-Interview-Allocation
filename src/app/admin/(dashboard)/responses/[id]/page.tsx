import { ResponseDetail } from "@/components/admin/response-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ResponseDetail id={(await params).id} />;
}
