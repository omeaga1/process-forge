/**
 * The one place the cloud API's address is decided.
 */
export function cloudApiBase(): string {
  if (typeof window !== 'undefined' && (window as any).__PF_CLOUD_API_URL__) {
    return (window as any).__PF_CLOUD_API_URL__;
  }
  return 'https://process-forge-community-library.vprescenzi.workers.dev/api';
}

/** What the API returns for a successful sign-in. */
export interface CloudSignIn {
  token: string;
  expiresAt: string;
  user: { id: string; email: string; name: string; avatarUrl: string | null };
}

export async function postCloudSignIn(path: '/auth/google' | '/auth/google/code', body: unknown): Promise<CloudSignIn> {
  let res: Response;
  try {
    res = await fetch(`${cloudApiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('Could not reach ProcessForge Cloud. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; session?: CloudSignIn };
  if (!res.ok || !data.session) {
    throw new Error(data.error || `Sign-in failed (HTTP ${res.status}).`);
  }
  return data.session;
}
