import { prisma } from '$lib/server/db';

const KEY = 'tickets.enabled';

export async function getTicketsEnabled(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return row?.value === 'true';
}

export async function setTicketsEnabled(enabled: boolean): Promise<void> {
  const value = enabled ? 'true' : 'false';
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
}
