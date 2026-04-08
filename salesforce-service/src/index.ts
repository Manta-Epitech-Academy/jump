import {SalesforceService} from "./service/SalesforceService.ts";

const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN } =
  process.env;

if (!SF_USERNAME || !SF_PASSWORD) {
  console.error("Missing SF_USERNAME or SF_PASSWORD in .env");
  process.exit(1);
}

const service = new SalesforceService();
await service.login(SF_USERNAME, SF_PASSWORD);

const mplStageSecondes = await service.getCampaign("701Sm00000dOcAaIAK");
const res = await service.getStageStudentsFromCampaign(mplStageSecondes?.id!);

console.log(res)
// async function getCampaignMembers(campaignId: string) {
//     const result = await conn.query(
//         `SELECT Id, CampaignId, LeadId, FirstName, LastName, Email, MobilePhone, Phone, Status, Lead.Telephone_Parents__c
//          FROM CampaignMember
//          WHERE CampaignId = '${campaignId}' AND Status = '3 - Convention validée'`
//     );
//     return result.records.map((r: any) => ({
//         Id: r.Id,
//         CampaignId: r.CampaignId,
//         LeadId: r.LeadId,
//         FirstName: r.FirstName,
//         LastName: r.LastName,
//         Email: r.Email,
//         MobilePhone: r.MobilePhone, // Student
//         Phone: r.Phone,
//         Status: r.Status,
//         Telephone_Parents: r.Lead?.Telephone_Parents__c ?? null,
//     }));
// }

//console.log(cm)
//console.log("Campaign:", await getCampaignMembers("701Sm00000dOcAaIAK"));







//
//
// const campaigns = await conn.query(
//   "SELECT Id, Name, Status, StartDate, EndDate, NumberOfContacts FROM Campaign ORDER BY StartDate DESC LIMIT 300"
// );
//
// console.log(`\nFound ${campaigns.totalSize} campaign(s):\n`);
// for (const c of campaigns.records) {
//   const { Id, Name, Status, StartDate, EndDate, NumberOfContacts } = c as any;
//   console.log(`  [${Status}] ${Name}`);
//   console.log(`    ID: ${Id} | ${StartDate ?? "?"} → ${EndDate ?? "?"} | Contacts: ${NumberOfContacts ?? 0}`);
// }
