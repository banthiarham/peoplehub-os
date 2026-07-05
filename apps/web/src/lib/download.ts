import { api } from './api';

/** Downloads an authenticated API response as a file (honors the server's
 *  Content-Disposition filename when present). */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const res = await api.get(url, { responseType: 'blob' });
  const disposition: string = res.headers['content-disposition'] ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const name = match?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}
