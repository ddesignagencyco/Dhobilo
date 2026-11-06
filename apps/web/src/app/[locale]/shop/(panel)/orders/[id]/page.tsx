import { setRequestLocale } from "next-intl/server";
import { OrderDetail } from "@/components/vendor/orders/order-detail";

export const metadata = { title: "Order" };

export default async function VendorOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <OrderDetail orderId={id} />;
}
