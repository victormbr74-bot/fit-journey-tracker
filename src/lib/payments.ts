export type PaymentProductKey =
  | 'personal_package'
  | 'nutritionist_package'
  | 'full_bundle'
  | 'assistant_full_addon'
  | 'workout_full_addon'
  | 'diet_full_addon';

export type PaymentProductDefinition = {
  key: PaymentProductKey;
  label: string;
  description: string;
  category: 'package' | 'addon';
};

export const PAYMENT_PRODUCTS: PaymentProductDefinition[] = [
  {
    key: 'personal_package',
    label: 'Pacote Personal',
    description: 'Libera acompanhamento e planos com personal trainer.',
    category: 'package',
  },
  {
    key: 'nutritionist_package',
    label: 'Pacote Nutricionista',
    description: 'Libera acompanhamento e dietas com nutricionista.',
    category: 'package',
  },
  {
    key: 'full_bundle',
    label: 'Pacote Full',
    description: 'Pacote completo com liberacao de features FULL.',
    category: 'package',
  },
  {
    key: 'assistant_full_addon',
    label: 'Addon Assistant Full',
    description: 'Libera recursos avancados do assistente.',
    category: 'addon',
  },
  {
    key: 'workout_full_addon',
    label: 'Addon Workout Full',
    description: 'Libera recursos avancados de treino (requer pacote personal).',
    category: 'addon',
  },
  {
    key: 'diet_full_addon',
    label: 'Addon Diet Full',
    description: 'Libera recursos avancados de dieta (requer pacote nutricionista).',
    category: 'addon',
  },
];

export const PAYMENT_PRODUCT_KEYS = PAYMENT_PRODUCTS.map((product) => product.key);

export const PAYMENT_PRODUCT_LABELS = PAYMENT_PRODUCTS.reduce<Record<string, string>>((accumulator, product) => {
  accumulator[product.key] = product.label;
  return accumulator;
}, {});

export const getPaymentProduct = (key: string | null | undefined) =>
  PAYMENT_PRODUCTS.find((product) => product.key === key) || null;

export const formatCurrencyBRL = (amountCents: number, currency = 'BRL') => {
  const normalizedAmount = Number.isFinite(amountCents) ? amountCents : 0;
  const normalizedCurrency = (currency || 'BRL').toUpperCase();
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: normalizedCurrency,
    }).format(normalizedAmount / 100);
  } catch {
    return `R$ ${(normalizedAmount / 100).toFixed(2)}`;
  }
};

export const parseCurrencyInputToCents = (input: string) => {
  const normalized = (input || '').replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
};

export const centsToCurrencyInput = (amountCents: number | null | undefined) => {
  if (typeof amountCents !== 'number' || !Number.isFinite(amountCents)) return '';
  return (amountCents / 100).toFixed(2).replace('.', ',');
};

export const formatOrderStatus = (status: string | null | undefined) => {
  if (status === 'paid') return 'Pago';
  if (status === 'pending') return 'Pendente';
  if (status === 'expired') return 'Expirado';
  if (status === 'canceled') return 'Cancelado';
  if (status === 'manual_review') return 'Aguardando comprovante';
  return status || '-';
};

export const formatCountdown = (expiresAt: string | null | undefined) => {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt).getTime();
  if (Number.isNaN(expires)) return null;
  const diff = expires - Date.now();
  if (diff <= 0) return 'Expirado';
  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const isManualProvider = (provider: string | null | undefined) => provider === 'manual';
