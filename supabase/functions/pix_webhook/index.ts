import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders, json } from '../_shared/http.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import {
  getMercadoPagoPayment,
  mapMercadoPagoStatusToOrderStatus,
  verifyMercadoPagoWebhookSignature,
} from '../_shared/mercadopago.ts';

type MercadoPagoWebhookPayload = {
  type?: string;
  topic?: string;
  action?: string;
  data?: {
    id?: string | number;
  } | null;
};

type OrderLookupRow = {
  id: string;
  status: string;
  provider: string;
  provider_reference: string | null;
  paid_at: string | null;
};

const parseBodySafe = async (request: Request) => {
  try {
    return (await request.json()) as MercadoPagoWebhookPayload;
  } catch {
    return {} as MercadoPagoWebhookPayload;
  }
};

const parsePaidAt = (raw: Record<string, unknown>) => {
  const dateApproved = raw.date_approved;
  if (typeof dateApproved === 'string' && dateApproved) return dateApproved;
  const dateLastUpdated = raw.date_last_updated;
  if (typeof dateLastUpdated === 'string' && dateLastUpdated) return dateLastUpdated;
  return new Date().toISOString();
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const url = new URL(request.url);
    const provider = (url.searchParams.get('provider') || Deno.env.get('PIX_PROVIDER') || 'mercadopago')
      .trim()
      .toLowerCase();

    if (provider !== 'mercadopago') {
      return json(200, { ok: true, ignored: true, reason: 'unsupported_provider_router' });
    }

    const payload = await parseBodySafe(request.clone());
    const eventType = (payload.type || payload.topic || '').toLowerCase();
    const dataIdFromBody =
      payload.data?.id === null || payload.data?.id === undefined ? null : String(payload.data.id);
    const dataIdFromQuery = url.searchParams.get('data.id') || url.searchParams.get('id');
    const paymentId = (dataIdFromQuery || dataIdFromBody || '').trim();

    if (!paymentId) {
      return json(400, { error: 'Missing payment id' });
    }

    const mpWebhookSecret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET') || '';
    if (!mpWebhookSecret) {
      return json(500, { error: 'Missing MERCADOPAGO_WEBHOOK_SECRET' });
    }

    const signatureValid = await verifyMercadoPagoWebhookSignature(request, mpWebhookSecret, paymentId);
    if (!signatureValid) {
      return json(401, { error: 'Invalid webhook signature' });
    }

    if (eventType && eventType !== 'payment') {
      return json(200, { ok: true, ignored: true, reason: `event:${eventType}` });
    }

    const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '';
    if (!accessToken) {
      return json(500, { error: 'Missing MERCADOPAGO_ACCESS_TOKEN' });
    }

    const adminClient = createAdminClient();
    const payment = await getMercadoPagoPayment(accessToken, paymentId);
    const orderStatus = mapMercadoPagoStatusToOrderStatus(payment.status);

    let orderLookup:
      | { data: OrderLookupRow | null; error: { message?: string } | null }
      | null = null;

    const externalReference = payment.externalReference?.trim() || '';
    if (externalReference) {
      const result = await adminClient
        .from('orders')
        .select('id, status, provider, provider_reference, paid_at')
        .eq('id', externalReference)
        .eq('provider', 'mercadopago')
        .maybeSingle();
      orderLookup = {
        data: (result.data as OrderLookupRow | null) ?? null,
        error: result.error ? { message: result.error.message } : null,
      };
    }

    if (!orderLookup?.data) {
      const result = await adminClient
        .from('orders')
        .select('id, status, provider, provider_reference, paid_at')
        .eq('provider', 'mercadopago')
        .eq('provider_reference', payment.id)
        .maybeSingle();
      orderLookup = {
        data: (result.data as OrderLookupRow | null) ?? null,
        error: result.error ? { message: result.error.message } : null,
      };
    }

    if (orderLookup?.error) {
      return json(500, { error: orderLookup.error.message || 'Failed to lookup order' });
    }

    if (!orderLookup?.data) {
      return json(404, { error: 'Order not found for payment', payment_id: payment.id });
    }

    const order = orderLookup.data;

    if (orderStatus === 'paid') {
      const { data: rpcResult, error: rpcError } = await adminClient.rpc('mark_order_paid_and_apply_effects', {
        p_order_id: order.id,
        p_paid_at: parsePaidAt(payment.raw),
      });

      if (rpcError) {
        return json(500, { error: rpcError.message || 'Failed to mark order as paid' });
      }

      return json(200, {
        ok: true,
        order_id: order.id,
        payment_id: payment.id,
        status: 'paid',
        applied: Boolean(rpcResult),
      });
    }

    if (orderStatus !== 'pending') {
      await adminClient
        .from('orders')
        .update({
          status: orderStatus,
          provider_reference: payment.id,
        })
        .eq('id', order.id)
        .neq('status', 'paid');
    }

    return json(200, {
      ok: true,
      order_id: order.id,
      payment_id: payment.id,
      status: orderStatus,
      ignored: orderStatus === 'pending',
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
