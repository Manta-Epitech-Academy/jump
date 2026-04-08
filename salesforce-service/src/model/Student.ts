export interface StageStudent {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    mobilePhone: string | null;
    parentPhone: string | null;
    parentEmail: string | null;
}

export interface Campaign {
    id: string;
    name: string;
}

export function buildCampaign(data: any): Campaign {
    return {
        id: data.Id,
        name: data.Name,
    };
}

export function buildStageStudent(data: any): StageStudent {
    return {
        id: data.Id,
        firstName: data.FirstName,
        lastName: data.LastName,
        emailAddress: data.Email,
        mobilePhone: data.MobilePhone ?? null,
        parentPhone: data.Lead?.Telephone_Parents__c ?? null,
        parentEmail: null, // Not available in the current query
    };
}