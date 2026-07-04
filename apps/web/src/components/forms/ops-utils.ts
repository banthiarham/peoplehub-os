export function apiErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } } };
  const message = e?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? 'Something went wrong';
}
