import jsforce from "jsforce";

const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN } =
    process.env;

if (!SF_USERNAME || !SF_PASSWORD) {
    console.error("Missing SF_USERNAME or SF_PASSWORD in .env");
    process.exit(1);
}

const conn = new jsforce.Connection({
    loginUrl: SF_LOGIN_URL || "https://login.salesforce.com",
});

await conn.login(SF_USERNAME, SF_PASSWORD + (SF_SECURITY_TOKEN ?? ""));
console.log("Connected to Salesforce — user:", conn.userInfo?.id);

const campaigns = [
    "701Sm00000dXOt8IAG",
    "701Sm00000dg8sLIAQ",
    "701Sm00000dfh11IAA",
    "701Sm00000dgEXzIAM",
    "701Sm00000dA0d1IAC",
    "701Sm00000dOcAaIAK",
    "701Sm00000dgDTqIAM",
    "701Sm00000dg7DIIAY",
    "701Sm00000dgFIoIAM",
    "701Sm00000dfuj1IAA",
    "701Sm00000dNt3oIAC",
    "701Sm00000dg6FbIAI",
    "701Sm00000dVwndIAC",
    "701Sm00000dg6p1IAA",
    "701Sm00000dg9dMIAQ"
]

async function getCampaignMembers(campaignId: string) {
    const result = await conn.query(
        `SELECT Id, CampaignId, LeadId, FirstName, LastName, Email, MobilePhone, Phone, Status, Lead.Telephone_Parents__c
         FROM CampaignMember
         WHERE CampaignId = '${campaignId}' AND Status = '3 - Convention validée'`
    );
    return result.records.map((r: any) => ({
        Id: r.Id,
        CampaignId: r.CampaignId,
        LeadId: r.LeadId,
        FirstName: r.FirstName,
        LastName: r.LastName,
        Email: r.Email,
        MobilePhone: r.MobilePhone, // Student
        Phone: r.Phone,
        Status: r.Status,
        Telephone_Parents: r.Lead?.Telephone_Parents__c ?? null,
    }));
}

let allMembers: any[] = [];
for (const campaignId of campaigns) {
    const members = await getCampaignMembers(campaignId);
    allMembers = allMembers.concat(members);
}
console.log(`Total members across ${campaigns.length} campaigns: ${allMembers.length}`);
const leadIds = allMembers.map((m) => m.LeadId).filter((id): id is string => !!id);

// Make blocks of 200 leadIds to avoid SOQL limits
let filesByLead = new Map<string, any[]>();

for (let i = 0; i < leadIds.length; i += 200) {
    const blockIds = leadIds.slice(i, i + 200);
    const blockFiles = await getLeadFiles(blockIds);
    for (const [leadId, files] of blockFiles.entries()) {
        if (!filesByLead.has(leadId)) filesByLead.set(leadId, []);
        filesByLead.get(leadId)!.push(...files);
    }
}


async function getLeadFiles(leadIds: string[]) {
    const ids = leadIds.map((id) => `'${id}'`).join(",");
    const result = await conn.query(
        `SELECT ContentDocumentId, ContentDocument.Id, ContentDocument.Title, ContentDocument.FileType, ContentDocument.ContentSize, ContentDocument.CreatedDate, LinkedEntityId
         FROM ContentDocumentLink
         WHERE LinkedEntityId IN (${ids})`
    );
    const filesByLead = new Map<string, any[]>();
    for (const r of result.records as any[]) {
        const leadId = r.LinkedEntityId;
        if (!filesByLead.has(leadId)) filesByLead.set(leadId, []);
        filesByLead.get(leadId)!.push({
            Id: r.ContentDocument.Id,
            Title: r.ContentDocument.Title,
            FileType: r.ContentDocument.FileType,
            ContentSize: r.ContentDocument.ContentSize,
            CreatedDate: r.ContentDocument.CreatedDate,
        });
    }
    return filesByLead;
}

//const filesByLead = await getLeadFiles(leadIds);

for (const member of allMembers) {
    const files = filesByLead.get(member.LeadId!) ?? [];
    const dir = `./downloads/`;
    console.log(`${member.FirstName} ${member.LastName} — ${files.length} file(s):`);
    for (const f of files) {
        const versionRes = await conn.query(
            `SELECT Id FROM ContentVersion WHERE ContentDocumentId = '${f.Id}' AND IsLatest = true LIMIT 1`
        );
        const versionId = (versionRes.records[0] as any)?.Id;
        if (!versionId) continue;

        const response = await fetch(
            `${conn.instanceUrl}/services/data/v50.0/sobjects/ContentVersion/${versionId}/VersionData`,
            { headers: { Authorization: `Bearer ${conn.accessToken}` } }
        );
        const buffer = await response.arrayBuffer();
        const filePath = `${dir}/${member.LeadId}-${f.Title}.${f.FileType}`;
        await Bun.write(filePath, buffer);
        console.log(`  ✓ ${filePath} (${f.ContentSize} bytes)`);
    }
}

