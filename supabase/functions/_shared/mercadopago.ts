export type MercadoPagoCreatePixInput = {
  accessToken: string;
  amountCents: number;
  currency?: string;
  description: string;
  payerEmail: string;
  payerName: string;
  externalReference: string;
  notificationUrl?: string;
  expiresAt?: string;
  idempotencyKey?: string;
};

export type MercadoPagoPixPayment = {
  id: string;
  status: string;
  externalReference: string | null;
  qrCode: string | null;
  qrCodeBase64: string | null;
  expiresAt: string | null;
  raw: Record<string, unknown>;
};

const normalizeBase64Png = (value: string | null | undefined) => {
  if (!value) return null;
  if (value.startsWith('data:image')) return value;
  return `data:image/png;base64,${value}`;
};

const splitName = (name: string) => {
  const sanitized = name.trim().replace(/\s+/g, ' ');
  if (!sanitized) {
    return { firstName: 'Cliente', lastName: '' };
  }

  const [firstName, ...rest] = sanitized.split(' ');
  return {
    firstName: firstName || 'Cliente',
    lastName: rest.join(' '),
  };
};

const parseMercadoPagoPayment = (payload: Record<string, unknown>): MercadoPagoPixPayment => {
  const pointOfInteraction =
    typeof payload.point_of_interaction === 'object' && payload.point_of_interaction
      ? (payload.point_of_interaction as Record<string, unknown>)
      : {};
  const transactionData =
    typeof pointOfInteraction.transaction_data === 'object' && pointOfInteraction.transaction_data
      ? (pointOfInteraction.transaction_data as Record<string, unknown>)
      : {};

  const rawId = payload.id;
  const externalReference =
    typeof payload.external_reference === 'string' && payload.external_reference
      ? payload.external_reference
      : null;

  return {
    id: rawId === null || rawId === undefined ? '' : String(rawId),
    status: typeof payload.status === 'string' ? payload.status : 'unknown',
    externalReference,
    qrCode: typeof transactionData.qr_code === 'string' ? transactionData.qr_code : null,
    qrCodeBase64: normalizeBase64Png(
      typeof transactionData.qr_code_base64 === 'string' ? transactionData.qr_code_base64 : null
    ),
    expiresAt: typeof payload.date_of_expiration === 'string' ? payload.date_of_expiration : null,
    raw: payload,
  };
};

export const createMercadoPagoPixPayment = async (
  input: MercadoPagoCreatePixInput
): Promise<MercadoPagoPixPayment> => {
  const { firstName, lastName } = splitName(input.payerName);
  const body: Record<string, unknown> = {
    transaction_amount: Number((input.amountCents / 100).toFixed(2)),
    description: input.description,
    payment_method_id: 'pix',
    payer: {
      email: input.payerEmail,
      first_name: firstName,
      last_name: lastName || undefined,
    },
    external_reference: input.externalReference,
  };

  if (input.notificationUrl) {
    body.notification_url = input.notificationUrl;
  }
  if (input.expiresAt) {
    body.date_of_expiration = input.expiresAt;
  }

  const response = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': input.idempotencyKey || input.externalReference,
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let rawPayload: Record<string, unknown> = {};
  try {
    rawPayload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    rawPayload = { raw: rawText };
  }

  if (!response.ok) {
    const message =
      typeof rawPayload.message === 'string'
        ? rawPayload.message
        : `Mercado Pago create payment failed (${response.status})`;
    throw new Error(`${message}: ${JSON.stringify(rawPayload)}`);
  }

  return parseMercadoPagoPayment(rawPayload);
};

export const getMercadoPagoPayment = async (
  accessToken: string,
  paymentId: string
): Promise<MercadoPagoPixPayment> => {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const rawText = await response.text();
  let rawPayload: Record<string, unknown> = {};
  try {
    rawPayload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    rawPayload = { raw: rawText };
  }

  if (!response.ok) {
    const message =
      typeof rawPayload.message === 'string'
        ? rawPayload.message
        : `Mercado Pago get payment failed (${response.status})`;
    throw new Error(`${message}: ${JSON.stringify(rawPayload)}`);
  }

  return parseMercadoPagoPayment(rawPayload);
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
};

export const verifyMercadoPagoWebhookSignature = async (
  request: Request,
  secret: string,
  dataId: string
) => {
  const signatureHeader = request.headers.get('x-signature') || request.headers.get('X-Signature') || '';
  const requestId = request.headers.get('x-request-id') || request.headers.get('X-Request-Id') || '';

  if (!signatureHeader || !requestId || !dataId) {
    return false;
  }

  const parts = signatureHeader
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, part) => {
      const [key, ...rest] = part.split('=');
      if (key) {
        accumulator[key.trim().toLowerCase()] = rest.join('=').trim();
      }
      return accumulator;
    }, {});

  const ts = parts.ts;
  const v1 = (parts.v1 || '').toLowerCase();

  if (!ts || !v1) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const expected = toHex(signature).toLowerCase();

  return timingSafeEqual(expected, v1);
};

export const mapMercadoPagoStatusToOrderStatus = (status: string): 'pending' | 'paid' | 'expired' | 'canceled' => {
  const normalized = status.toLowerCase();
  if (normalized === 'approved') return 'paid';
  if (normalized === 'expired') return 'expired';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'rejected') return 'canceled';
  return 'pending';
};
