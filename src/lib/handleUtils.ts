const HANDLE_BODY_MIN_LENGTH = 3;
const HANDLE_BODY_MAX_LENGTH = 30;
const HANDLE_REGEX = /^@[a-z0-9._]{3,30}$/;

const toText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
};

const compactHandleBody = (value: string) =>
  value
    .replace(/[^a-z0-9._]/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');

export const normalizeHandle = (value: unknown) => toText(value).trim().replace(/^@+/, '').toLowerCase();

export const sanitizeHandleBody = (value: unknown) => {
  const normalized = normalizeHandle(value);
  const compacted = compactHandleBody(normalized);
  return compacted.slice(0, HANDLE_BODY_MAX_LENGTH);
};

const ensureMinLength = (value: string, filler = 'fit') => {
  if (value.length >= HANDLE_BODY_MIN_LENGTH) return value;
  const padded = `${value}${filler}`;
  return padded.slice(0, HANDLE_BODY_MIN_LENGTH);
};

export const toHandle = (value: unknown, fallback = 'fit.user') => {
  const sanitized = sanitizeHandleBody(value);
  const fallbackBody = sanitizeHandleBody(fallback) || 'fit.user';
  const body = ensureMinLength(sanitized || fallbackBody);
  return `@${body}`;
};

export const formatHandleInput = (value: unknown) => {
  const compact = toText(value).trim().replace(/\s+/g, '');
  if (!compact) return '';
  if (compact === '@') return '@';
  return toHandle(compact);
};

export const isValidHandle = (value: unknown) => HANDLE_REGEX.test(toText(value).trim().toLowerCase());

export const createHandleBase = (value: unknown, fallback = 'fit.user') =>
  ensureMinLength(sanitizeHandleBody(value) || sanitizeHandleBody(fallback) || 'fit.user');

export const getHandleBodyLimits = () => ({
  min: HANDLE_BODY_MIN_LENGTH,
  max: HANDLE_BODY_MAX_LENGTH,
});
