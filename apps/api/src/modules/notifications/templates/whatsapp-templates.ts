import { TemplateName, TemplateParams } from './order-templates';

/**
 * WhatsApp only lets a business start a conversation with templates its BSP has approved. This is the name <-> BSP
 * template id map (TRD §14): replace `bspId` with the id you get on approval. Each entry also fixes the order of
 * the template's numbered placeholders ({{1}}, {{2}}, ...).
 */
export const WHATSAPP_TEMPLATES: Record<TemplateName, { bspId: string; paramOrder: (keyof TemplateParams)[] }> = {
  order_placed: { bspId: 'dhoblio_order_placed', paramOrder: ['orderNo', 'vendor'] },
  order_accepted: { bspId: 'dhoblio_order_accepted', paramOrder: ['orderNo', 'vendor'] },
  order_rejected: { bspId: 'dhoblio_order_rejected', paramOrder: ['orderNo', 'vendor', 'reason'] },
  order_cancelled: { bspId: 'dhoblio_order_cancelled', paramOrder: ['orderNo', 'reason'] },
  order_picked_up: { bspId: 'dhoblio_order_picked_up', paramOrder: ['orderNo'] },
  order_in_process: { bspId: 'dhoblio_order_in_process', paramOrder: ['orderNo', 'vendor'] },
  order_ready: { bspId: 'dhoblio_order_ready', paramOrder: ['orderNo'] },
  order_out_for_delivery: { bspId: 'dhoblio_order_out_for_delivery', paramOrder: ['orderNo'] },
  order_delivered: { bspId: 'dhoblio_order_delivered', paramOrder: ['orderNo'] },
  vendor_new_order: { bspId: 'dhoblio_vendor_new_order', paramOrder: ['orderNo', 'items', 'total', 'minutes'] },
  vendor_order_cancelled: { bspId: 'dhoblio_vendor_order_cancelled', paramOrder: ['orderNo', 'reason'] },
  vendor_order_expired: { bspId: 'dhoblio_vendor_order_expired', paramOrder: ['orderNo'] },
  order_rider_assigned: { bspId: 'dhoblio_order_rider_assigned', paramOrder: ['orderNo', 'rider', 'jobType'] },
  delivery_code: { bspId: 'dhoblio_delivery_code', paramOrder: ['orderNo', 'code'] },
  rider_job_offer: { bspId: 'dhoblio_rider_job_offer', paramOrder: ['orderNo', 'jobType', 'minutes'] },
  rider_job_assigned: { bspId: 'dhoblio_rider_job_assigned', paramOrder: ['orderNo', 'jobType'] },
  rider_job_cancelled: { bspId: 'dhoblio_rider_job_cancelled', paramOrder: ['orderNo', 'jobType', 'reason'] },
};

export function whatsappParams(name: TemplateName, params: TemplateParams): string[] {
  return WHATSAPP_TEMPLATES[name].paramOrder.map((k) => String(params[k] ?? '-'));
}
