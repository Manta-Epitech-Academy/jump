import jsforce, {Connection} from "jsforce";
import {
    buildCampaign,
    buildStageStudent,
    type Campaign,
    type StageStudent,
} from "../model/Student.ts";

export class SalesforceService {
    private conn: Connection | null = null;

    constructor() {
    }

    async login(SF_USERNAME: string, SF_PASSWORD: string, SF_SECURITY_TOKEN?: string, SF_LOGIN_URL?: string) {
        this.conn = new jsforce.Connection({
            loginUrl: SF_LOGIN_URL || "https://login.salesforce.com",
        });

        await this.conn.login(SF_USERNAME, SF_PASSWORD + (SF_SECURITY_TOKEN ?? ""));
        console.log("Logged in to Salesforce as", SF_USERNAME);
    }


    async getCampaigns(): Promise<Campaign[]> {
        if (!this.conn)
            throw new Error("Not logged in to Salesforce");
        const result = await this.conn.query(
            "SELECT Id, Name FROM Campaign ORDER BY StartDate DESC LIMIT 300"
        );
        return result.records.map((r: any) => buildCampaign(r));
    }

    async getChildCampaigns(parentId: string): Promise<Campaign[]> {
        if (!this.conn)
            throw new Error("Not logged in to Salesforce");
        const records = await this.conn.sobject("Campaign")
            .find({ParentId: parentId}, "Id, Name");
        return records.map((r) => buildCampaign(r));
    }

    async getCampaign(id: string): Promise<Campaign | null> {
        if (!this.conn)
            throw new Error("Not logged in to Salesforce");
        const c = await this.conn.sobject("Campaign").retrieve(id);
        if (!c)
            return null;
        return buildCampaign(c);
    }

    async getStageStudentsFromCampaign(campaignId: string): Promise<StageStudent[]> {
        if (!this.conn)
            throw new Error("Not logged in to Salesforce");

        const result = await this.conn.query(
            `SELECT Id, CampaignId, LeadId, AccountId, ContactId, FirstName, LastName, Email, MobilePhone
             FROM CampaignMember
             WHERE CampaignId = '${campaignId}'
               AND Status = '3 - Convention validée'`
        );
        for (const r of result.records) {
            // get lead
            console.log("CampaignMember:", r);
            const contact = await this.conn.sobject("Contact").retrieve(r.ContactId);
            console.log("Contact:", contact);
            // if AccountId, get account
            if (contact.AccountId) {
                const account = await this.conn.sobject("Account").retrieve(contact.AccountId);
                console.log("Account:", account);
            }
        }
       //console.log(result)
        return result.records.map((r: any) => buildStageStudent(r));
    }

    async getUserFromEmail(email: string): Promise<StageStudent | null> {
        if (!this.conn)
            throw new Error("Not logged in to Salesforce");
        const result = await this.conn.query(
            `SELECT *
             FROM Lead
             WHERE Email = '${email}'`
        );
        if (result.totalSize === 0)
            return null;
        return buildStageStudent(result.records[0]);
    }
}

