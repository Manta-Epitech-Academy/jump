import {SalesforceService} from "./service/SalesforceService.ts";

const {SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN, API_TOKEN} = process.env;
const PORT = Number(process.env.PORT) || 3001;

if (!SF_USERNAME || !SF_PASSWORD) {
    console.error("Missing SF_USERNAME or SF_PASSWORD in .env");
    process.exit(1);
}

if (!API_TOKEN) {
    console.error("Missing API_TOKEN in .env");
    process.exit(1);
}

const sf = new SalesforceService();
await sf.login(SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN, SF_LOGIN_URL);

function json(data: unknown, status = 200) {
    return Response.json(data, {status});
}

function error(message: string, status = 400) {
    return Response.json({error: message}, {status});
}

async function handleRequest(req: Request): Promise<Response> {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (token !== API_TOKEN) {
        return error("Unauthorized", 401);
    }

    const url = new URL(req.url);
    const path = url.pathname;

    try {
        // GET /campaigns — list all campaigns
        if (path === "/campaigns" && req.method === "GET") {
            return json(await sf.getCampaigns());
        }

        // GET /campaigns/:id — single campaign
        const campaignMatch = path.match(/^\/campaigns\/([^/]+)$/);
        if (campaignMatch && req.method === "GET") {
            const campaign = await sf.getCampaign(campaignMatch[1]!);
            if (!campaign) return error("Campaign not found", 404);
            return json(campaign);
        }

        // GET /campaigns/:id/children — child campaigns
        const childrenMatch = path.match(/^\/campaigns\/([^/]+)\/children$/);
        if (childrenMatch && req.method === "GET") {
            return json(await sf.getChildCampaigns(childrenMatch[1]!));
        }

        // GET /campaigns/:id/members — students in a campaign
        const membersMatch = path.match(/^\/campaigns\/([^/]+)\/members$/);
        if (membersMatch && req.method === "GET") {
            return json(await sf.getStudentsFromCampaign(membersMatch[1]!));
        }

        // GET /students?email=... — find student by email
        if (path === "/students" && req.method === "GET") {
            const email = url.searchParams.get("email");
            if (!email) return error("Query parameter 'email' is required");
            const student = await sf.getStudentFromEmail(email);
            if (!student) return error("Student not found", 404);
            return json(student);
        }

        return error("Not found", 404);
    } catch (e: any) {
        console.error("Request error:", e);
        return error(e.message || "Internal server error", 500);
    }
}

Bun.serve({
    port: PORT,
    fetch: handleRequest,
});

console.log(`Salesforce API running on http://localhost:${PORT}`);
