export interface Student {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    mobilePhone: string | null;
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

export function buildStudent(data: any): Student {
    return {
        id: data.Id,
        firstName: data.FirstName,
        lastName: data.LastName,
        emailAddress: data.Email,
        mobilePhone: data.MobilePhone ?? null,
    };
}