# Salesforce Service

REST API proxy for Salesforce campaign and student data. Built with [Bun](https://bun.sh) and [jsforce](https://jsforce.github.io/).

## Setup

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- A Salesforce account with API access

### Installation

```bash
bun install
```

### Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `SF_USERNAME` | Yes | Salesforce username |
| `SF_PASSWORD` | Yes | Salesforce password |
| `SF_SECURITY_TOKEN` | No | Salesforce security token (appended to password) |
| `SF_LOGIN_URL` | No | Login URL (defaults to `https://login.salesforce.com`) |
| `API_TOKEN` | Yes | Bearer token required to access the API |
| `PORT` | No | Server port (defaults to `3001`) |

### Run

```bash
bun run dev
```

## Authentication

All endpoints require a Bearer token in the `Authorization` header. The token must match the `API_TOKEN` environment variable.

```
Authorization: Bearer <your-api-token>
```

Unauthenticated requests receive a `401 Unauthorized` response:

```json
{ "error": "Unauthorized" }
```

## API Routes

### Campaigns

#### `GET /campaigns`

List all campaigns (up to 300, ordered by start date descending).

**Response** `200`

```json
[
  { "id": "701...", "name": "Campaign Name" }
]
```

---

#### `GET /campaigns/:id`

Get a single campaign by its Salesforce ID.

**Response** `200`

```json
{ "id": "701...", "name": "Campaign Name" }
```

**Response** `404`

```json
{ "error": "Campaign not found" }
```

---

#### `GET /campaigns/:id/children`

Get child campaigns of a parent campaign.

**Response** `200`

```json
[
  { "id": "701...", "name": "Child Campaign" }
]
```

---

#### `GET /campaigns/:id/members`

Get students (campaign members with status "3 - Convention validee") from a campaign.

**Response** `200`

```json
[
  {
    "id": "00Q...",
    "firstName": "Jean",
    "lastName": "Dupont",
    "emailAddress": "jean.dupont@example.com",
    "mobilePhone": "+33612345678"
  }
]
```

### Students

#### `GET /students?email=:email`

Find a student (lead) by email address.

**Parameters**

| Query param | Required | Description |
|---|---|---|
| `email` | Yes | Student email address |

**Response** `200`

```json
{
  "id": "00Q...",
  "firstName": "Jean",
  "lastName": "Dupont",
  "emailAddress": "jean.dupont@example.com",
  "mobilePhone": "+33612345678"
}
```

**Response** `400`

```json
{ "error": "Query parameter 'email' is required" }
```

**Response** `404`

```json
{ "error": "Student not found" }
```

## Error Handling

All errors return JSON with an `error` field:

| Status | Meaning |
|---|---|
| `400` | Bad request (missing parameters) |
| `401` | Unauthorized (invalid or missing token) |
| `404` | Resource not found |
| `500` | Internal server error (Salesforce query failure, etc.) |
