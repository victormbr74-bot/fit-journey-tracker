import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { corsHeaders, json } from '../_shared/http.ts';
import { createAdminClient, getSupabaseEnv, requireAuthenticatedUser } from '../_shared/supabase.ts';
import { createMercadoPagoPixPayment } from '../_shared/mercadopago.ts';

type CreatePixOrderRequest = {
  product_key?: string;
  professional_id?: string | null;
};

type PaymentProviderSettingsRow = {
  active_provider?: string | null;
  manual_pix_key?: string | null;
  manual_pix_copy_paste?: string | null;
  manual_pix_display_name?: string | null;
  manual_pix_instructions?: string | null;
};

type ResolvedPriceRow = {
  pricing_rule_id: string;
  price_cents: number;
  currency: string;
  source_scope: string;
  source_owner_id: string | null;
  source_client_id: string | null;
};

const validProviders = new Set(['mercadopago', 'pagarme', 'efi', 'pagbank', 'manual']);

const normalizeProvider = (value: string | null | undefined) => {
  const normalized = (value || '').trim().toLowerCase();
  return validProviders.has(normalized) ? normalized : null;
};

const buildNotificationUrl = (baseUrl: string | null | undefined) => {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('provider', 'mercadopago');
    return url.toString();
  } catch {
    return null;
  }
};

const toIsoWithMinutesOffset = (minutesFromNow: number) => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutesFromNow);
  return date.toISOString();
};

const toUserFacingProvider = (provider: string) => {
  if (provider === 'mercadopago') return 'mercadopago';
  return 'manual';
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const requestBody = (await request.json()) as CreatePixOrderRequest;
    const productKey = (requestBody.product_key || '').trim();
    const professionalId =
      typeof requestBody.professional_id === 'string' && requestBody.professional_id.trim()
        ? requestBody.professional_id.trim()
        : null;

    if (!productKey) {
      return json(400, { error: 'product_key is required' });
    }

    const { user } = await requireAuthenticatedUser(request.headers.get('Authorization'));
    const adminClient = createAdminClient();
    const { url: supabaseUrl } = getSupabaseEnv();

    const [{ data: profile, error: profileError }, { data: settingsRow }] = await Promise.all([
      adminClient
        .from('profiles')
        .select('id, name, email')
        .eq('id', user.id)
        .maybeSingle(),
      adminClient
        .from('payment_provider_settings')
        .select('active_provider, manual_pix_key, manual_pix_copy_paste, manual_pix_display_name, manual_pix_instructions')
        .eq('id', true)
        .maybeSingle(),
    ]);

    if (profileError || !profile) {
      return json(403, { error: profileError?.message || 'Profile not found' });
    }

    const { data: resolvedPrice, error: resolvePriceError } = await adminClient.rpc('resolve_order_price', {
      p_client_id: user.id,
      p_product_key: productKey,
      p_professional_id: professionalId,
    });

    if (resolvePriceError) {
      return json(400, { error: resolvePriceError.message || 'Unable to resolve price' });
    }

    const resolvedRow = Array.isArray(resolvedPrice)
      ? ((resolvedPrice[0] as ResolvedPriceRow | undefined) ?? null)
      : ((resolvedPrice as ResolvedPriceRow | null) ?? null);

    if (!resolvedRow) {
      return json(400, { error: 'No active pricing rule found' });
    }

    const providerFromEnv = normalizeProvider(Deno.env.get('PIX_PROVIDER'));
    const providerFromSettings = normalizeProvider((settingsRow as PaymentProviderSettingsRow | null)?.active_provider);
    let provider = providerFromEnv || providerFromSettings || 'manual';

    const mercadopagoAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') || '';
    if (provider === 'mercadopago' && !mercadopagoAccessToken) {
      provider = 'manual';
    }

    if (provider !== 'mercadopago' && provider !== 'manual') {
      provider = 'manual';
    }

    const isManual = provider === 'manual';
    const expirationMinutes = Number(Deno.env.get('PIX_ORDER_EXPIRATION_MINUTES') || '30');
    const expiresAt = isManual ? null : toIsoWithMinutesOffset(Number.isFinite(expirationMinutes) ? expirationMinutes : 30);

    const manualSettings = (settingsRow as PaymentProviderSettingsRow | null) || {};
    const manualPixKey = (manualSettings.manual_pix_key || Deno.env.get('PIX_MANUAL_KEY') || '').trim();
    const manualCopyPaste = (
      manualSettings.manual_pix_copy_paste ||
      Deno.env.get('PIX_MANUAL_COPY_PASTE') ||
      manualPixKey
    ).trim();
    const manualDisplayName = (
      manualSettings.manual_pix_display_name ||
      Deno.env.get('PIX_MANUAL_DISPLAY_NAME') ||
      'Pagamento Manual'
    ).trim();
    const manualInstructions = (
      manualSettings.manual_pix_instructions ||
      Deno.env.get('PIX_MANUAL_INSTRUCTIONS') ||
      'Pague via Pix manual e envie o comprovante para aprovacao.'
    ).trim();

    if (isManual && !manualCopyPaste) {
      return json(500, {
        error: 'Manual PIX fallback is active but no manual key/copy-paste is configured',
      });
    }

    const initialOrderStatus = isManual ? 'manual_review' : 'pending';
    const orderProvider = toUserFacingProvider(provider);

    const { data: createdOrder, error: createOrderError } = await adminClient
      .from('orders')
      .insert({
        client_id: user.id,
        professional_id: professionalId,
        product_key: productKey,
        amount_cents: resolvedRow.price_cents,
        currency: resolvedRow.currency || 'BRL',
        status: initialOrderStatus,
        provider: orderProvider,
        pix_copy_paste: isManual ? (manualCopyPaste || null) : null,
        expires_at: expiresAt,
      })
      .select('id, status, provider, amount_cents, currency, pix_copy_paste, pix_qr_image_url, expires_at')
      .single();

    if (createOrderError || !createdOrder) {
      return json(500, { error: createOrderError?.message || 'Failed to create order' });
    }

    if (isManual) {
      return json(200, {
        order_id: createdOrder.id,
        status: createdOrder.status,
        provider: createdOrder.provider,
        amount_cents: createdOrder.amount_cents,
        currency: createdOrder.currency,
        pix_copy_paste: createdOrder.pix_copy_paste,
        pix_qr_image_url: null,
        expires_at: createdOrder.expires_at,
        manual_pix: {
          key: manualPixKey || null,
          copy_paste: createdOrder.pix_copy_paste || null,
          display_name: manualDisplayName,
          instructions: manualInstructions,
          proof_required: true,
        },
        pricing_source: {
          pricing_rule_id: resolvedRow.pricing_rule_id,
          scope: resolvedRow.source_scope,
          owner_id: resolvedRow.source_owner_id,
          client_id: resolvedRow.source_client_id,
        },
      });
    }

    const webhookUrl = buildNotificationUrl(Deno.env.get('PIX_WEBHOOK_URL') || `${supabaseUrl}/functions/v1/pix_webhook`);
    const paymentDescription = `SouFit - ${productKey}`;
    let mercadopagoPayment;
    try {
      mercadopagoPayment = await createMercadoPagoPixPayment({
        accessToken: mercadopagoAccessToken,
        amountCents: resolvedRow.price_cents,
        currency: resolvedRow.currency || 'BRL',
        description: paymentDescription,
        payerEmail: profile.email || user.email || 'cliente@soufit.local',
        payerName: profile.name || user.user_metadata?.name?.toString() || 'Cliente SouFit',
        externalReference: createdOrder.id,
        notificationUrl: webhookUrl || undefined,
        expiresAt: expiresAt || undefined,
        idempotencyKey: createdOrder.id,
      });
    } catch (providerError) {
      await adminClient
        .from('orders')
        .update({ status: 'canceled' })
        .eq('id', createdOrder.id)
        .eq('status', 'pending');
      return json(502, {
        error: providerError instanceof Error ? providerError.message : String(providerError),
      });
    }

    const { data: updatedOrder, error: updateOrderError } = await adminClient
      .from('orders')
      .update({
        provider_reference: mercadopagoPayment.id,
        pix_copy_paste: mercadopagoPayment.qrCode,
        pix_qr_image_url: mercadopagoPayment.qrCodeBase64,
        expires_at: mercadopagoPayment.expiresAt || expiresAt,
      })
      .eq('id', createdOrder.id)
      .select('id, status, provider, amount_cents, currency, pix_copy_paste, pix_qr_image_url, expires_at')
      .single();

    if (updateOrderError || !updatedOrder) {
      await adminClient
        .from('orders')
        .update({ status: 'canceled' })
        .eq('id', createdOrder.id)
        .eq('status', 'pending');
      return json(500, { error: updateOrderError?.message || 'Failed to store provider response' });
    }

    return json(200, {
      order_id: updatedOrder.id,
      status: updatedOrder.status,
      provider: updatedOrder.provider,
      amount_cents: updatedOrder.amount_cents,
      currency: updatedOrder.currency,
      pix_copy_paste: updatedOrder.pix_copy_paste,
      pix_qr_image_url: updatedOrder.pix_qr_image_url,
      expires_at: updatedOrder.expires_at,
      manual_pix: null,
      pricing_source: {
        pricing_rule_id: resolvedRow.pricing_rule_id,
        scope: resolvedRow.source_scope,
        owner_id: resolvedRow.source_owner_id,
        client_id: resolvedRow.source_client_id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      message.includes('Missing authorization') || message.includes('Invalid auth token')
        ? 401
        : message.includes('Profile not found')
          ? 403
          : 500;

    return json(status, { error: message });
  }
});
