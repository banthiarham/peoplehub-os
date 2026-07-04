export function apiErrorMessage(err: unknown): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response
    ?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? 'Something went wrong. Please try again.';
}
