import { Client } from 'pg';
import { readFileSync } from 'fs';

type Inscrit = { campus: string; first: string; last: string; email: string };

const inscrits: Inscrit[] = JSON.parse(
  readFileSync('/tmp/inscrits.json', 'utf8'),
);
const emails = inscrits.map((i) => i.email.trim().toLowerCase());

const client = new Client({
  host: 'localhost',
  port: 1111,
  user: 'REDACTED',
  password: 'REDACTED',
  database: 'livedev',
});

function norm(s: string | null): string {
  return (s ?? '').trim().toLowerCase();
}

const main = async () => {
  await client.connect();

  // 1) Talents by email (case-insensitive)
  const talentRes = await client.query(
    `SELECT id, email, "userId" FROM "Talent" WHERE lower(email) = ANY($1::text[])`,
    [emails],
  );
  const talentByEmail = new Map<
    string,
    { id: string; email: string; userId: string | null }
  >();
  for (const r of talentRes.rows) talentByEmail.set(norm(r.email), r);

  const talentIds = talentRes.rows.map((r) => r.id);

  // 2) Stage participations for those talents
  const partRes = await client.query(
    `SELECT p."talentId", e."eventType"
       FROM "Participation" p
       JOIN "Event" e ON e.id = p."eventId"
      WHERE p."talentId" = ANY($1::text[]) AND e."eventType" = 'stage_seconde'`,
    [talentIds],
  );
  const stageTalentIds = new Set<string>(partRes.rows.map((r) => r.talentId));

  // 3) bauth_user for the userIds
  const userIds = talentRes.rows
    .map((r) => r.userId)
    .filter(Boolean) as string[];
  const userRes = await client.query(
    `SELECT id, email FROM "bauth_user" WHERE id = ANY($1::text[])`,
    [userIds],
  );
  const userById = new Map<string, { id: string; email: string }>();
  for (const r of userRes.rows) userById.set(r.id, r);

  // Buckets
  const noTalent: Inscrit[] = [];
  const noStage: Inscrit[] = [];
  const noUserId: Inscrit[] = [];
  const userMissing: Inscrit[] = [];
  const emailMismatch: {
    i: Inscrit;
    talentEmail: string;
    userEmail: string;
  }[] = [];
  const ok: Inscrit[] = [];

  for (const i of inscrits) {
    const e = norm(i.email);
    const t = talentByEmail.get(e);
    if (!t) {
      noTalent.push(i);
      continue;
    }
    if (!stageTalentIds.has(t.id)) {
      noStage.push(i);
      continue;
    }
    if (!t.userId) {
      noUserId.push(i);
      continue;
    }
    const u = userById.get(t.userId);
    if (!u) {
      userMissing.push(i);
      continue;
    }
    if (norm(u.email) !== norm(t.email)) {
      emailMismatch.push({ i, talentEmail: t.email, userEmail: u.email });
      continue;
    }
    ok.push(i);
  }

  const line = (s: string) => console.log(s);
  line('================ RÉSULTAT VÉRIFICATION ================');
  line(`Inscrits (Excel)            : ${inscrits.length}`);
  line(`Emails uniques              : ${new Set(emails).size}`);
  line('------------------------------------------------------');
  line(`✅ OK (Talent + Stage + bauth_user email alignée) : ${ok.length}`);
  line(
    `❌ Pas de Talent pour l'email                      : ${noTalent.length}`,
  );
  line(
    `❌ Talent SANS participation Stage                 : ${noStage.length}`,
  );
  line(
    `❌ Talent sans userId (pas de compte auth lié)     : ${noUserId.length}`,
  );
  line(
    `❌ userId pointe vers un bauth_user inexistant     : ${userMissing.length}`,
  );
  line(
    `❌ Email bauth_user ≠ Talent.email                 : ${emailMismatch.length}`,
  );
  line('======================================================');

  const dump = (title: string, arr: Inscrit[]) => {
    if (!arr.length) return;
    line(`\n### ${title} (${arr.length})`);
    for (const i of arr)
      line(`  - ${i.email}  [${i.first} ${i.last} / ${i.campus}]`);
  };
  dump('PAS DE TALENT', noTalent);
  dump('TALENT SANS STAGE', noStage);
  dump('TALENT SANS userId', noUserId);
  dump('bauth_user INEXISTANT', userMissing);
  if (emailMismatch.length) {
    line(`\n### EMAIL bauth_user ≠ Talent.email (${emailMismatch.length})`);
    for (const m of emailMismatch)
      line(
        `  - inscrit:${m.i.email} | Talent.email:${m.talentEmail} | bauth_user.email:${m.userEmail}  [${m.i.first} ${m.i.last}]`,
      );
  }

  await client.end();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
