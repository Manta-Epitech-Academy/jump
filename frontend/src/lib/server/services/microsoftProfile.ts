import { prisma } from '$lib/server/db';

const PHOTO_SIZE = 96;

// Refresh bauth_user.image from MS Graph. BetterAuth's Microsoft provider
// only fetches the photo on first user creation, so pre-provisioned accounts
// (e.g. seeded via scripts/add-admin-user.ts) and subsequent logins never
// pick up profile photo changes. Best-effort: failures must not block login.
export async function syncMicrosoftAvatar(userId: string): Promise<void> {
  try {
    const account = await prisma.bauth_account.findFirst({
      where: { userId, providerId: 'microsoft' },
      select: { accessToken: true },
    });
    if (!account?.accessToken) return;

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/photos/${PHOTO_SIZE}x${PHOTO_SIZE}/$value`,
      { headers: { Authorization: `Bearer ${account.accessToken}` } },
    );
    // 404 = user has no Graph photo set; skip silently.
    if (!res.ok) return;

    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    await prisma.bauth_user.update({
      where: { id: userId },
      data: { image: dataUrl },
    });
  } catch (err) {
    console.error('[microsoftProfile] avatar sync failed', err);
  }
}
