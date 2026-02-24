import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders, json } from '../_shared/http.ts';
import { requireAdminUser } from '../_shared/supabase.ts';

type AdminApproveManualRequest = {
  proof_id?: string;
  action?: 'approve' | 'reject';
};

type ManualProofRow = {
  id: string;
  order_id: string;
  status: 'submitted' | 'approved' | 'rejected';
};

type ManualOrderRow = {
  id: string;
  provider: string;
  status: string;
  client_id: string;
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const { adminClient, user } = await requireAdminUser(request.headers.get('Authorization'));

    let payload: AdminApproveManualRequest | null = null;
    try {
      payload = (await request.json()) as AdminApproveManualRequest;
    } catch {
      payload = null;
    }

    const proofId = (payload?.proof_id || '').trim();
    const action = payload?.action === 'reject' ? 'reject' : payload?.action === 'approve' ? 'approve' : null;

    if (!proofId) {
      return json(400, { error: 'proof_id is required' });
    }
    if (!action) {
      return json(400, { error: 'action must be approve or reject' });
    }

    const { data: proof, error: proofError } = await adminClient
      .from('manual_pix_proofs')
      .select('id, order_id, status')
      .eq('id', proofId)
      .maybeSingle();

    if (proofError) {
      return json(500, { error: proofError.message || 'Failed to load proof' });
    }
    if (!proof) {
      return json(404, { error: 'Proof not found' });
    }

    const proofRow = proof as ManualProofRow;

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, provider, status, client_id')
      .eq('id', proofRow.order_id)
      .maybeSingle();

    if (orderError) {
      return json(500, { error: orderError.message || 'Failed to load order' });
    }
    if (!order) {
      return json(404, { error: 'Order not found' });
    }

    const orderRow = order as ManualOrderRow;
    if (orderRow.provider !== 'manual') {
      return json(400, { error: 'Order provider is not manual' });
    }

    const reviewedAt = new Date().toISOString();

    if (action === 'reject') {
      const { error: updateProofError } = await adminClient
        .from('manual_pix_proofs')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: reviewedAt,
        })
        .eq('id', proofRow.id);

      if (updateProofError) {
        return json(500, { error: updateProofError.message || 'Failed to reject proof' });
      }

      if (orderRow.status === 'paid') {
        return json(200, {
          ok: true,
          action,
          proof_id: proofRow.id,
          order_id: orderRow.id,
          order_status: orderRow.status,
          warning: 'Order was already paid before proof rejection.',
        });
      }

      return json(200, {
        ok: true,
        action,
        proof_id: proofRow.id,
        order_id: orderRow.id,
        order_status: orderRow.status,
      });
    }

    const { error: approveProofError } = await adminClient
      .from('manual_pix_proofs')
      .update({
        status: 'approved',
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
      })
      .eq('id', proofRow.id);

    if (approveProofError) {
      return json(500, { error: approveProofError.message || 'Failed to approve proof' });
    }

    const { data: appliedResult, error: applyError } = await adminClient.rpc('mark_order_paid_and_apply_effects', {
      p_order_id: orderRow.id,
      p_paid_at: reviewedAt,
    });

    if (applyError) {
      return json(500, { error: applyError.message || 'Failed to approve manual payment' });
    }

    const { data: refreshedOrder } = await adminClient
      .from('orders')
      .select('id, status, paid_at')
      .eq('id', orderRow.id)
      .maybeSingle();

    return json(200, {
      ok: true,
      action,
      proof_id: proofRow.id,
      order_id: orderRow.id,
      order_status: (refreshedOrder as { status?: string } | null)?.status || 'paid',
      paid_at: (refreshedOrder as { paid_at?: string | null } | null)?.paid_at || reviewedAt,
      applied: Boolean(appliedResult),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      message.includes('Missing authorization') || message.includes('Invalid auth token')
        ? 401
        : message.includes('Admin access required')
          ? 403
          : 500;

    return json(status, { error: message });
  }
});
