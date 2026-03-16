# Control Plane API - OpenAuthority

## Overview
Service: `control-plane-api`  
Tech Stack: TypeScript + NestJS + PostgreSQL + Kafka  
Port: `3001`

---

## Database Schema

### Tenants
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
```

### Users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
```

### Policies
```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  spec JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'review', 'active', 'deprecated')),
  created_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  promoted_at TIMESTAMPTZ
);

CREATE INDEX idx_policies_tenant ON policies(tenant_id);
CREATE INDEX idx_policies_status ON policies(status);
CREATE INDEX idx_policies_version ON policies(tenant_id, name, version);
```

### Policy Versions
```sql
CREATE TABLE policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  spec JSONB NOT NULL,
  changelog TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(policy_id, version)
);

CREATE INDEX idx_policy_versions_policy ON policy_versions(policy_id);
```

### Policy Promotion History
```sql
CREATE TABLE policy_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  from_status VARCHAR(50) NOT NULL,
  to_status VARCHAR(50) NOT NULL,
  promoted_by UUID REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_promotions_policy ON policy_promotions(policy_id);
```

---

## API Endpoints

### Tenants
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/tenants` | List all tenants |
| `POST` | `/api/v1/tenants` | Create tenant |
| `GET` | `/api/v1/tenants/:id` | Get tenant by ID |
| `PATCH` | `/api/v1/tenants/:id` | Update tenant |
| `DELETE` | `/api/v1/tenants/:id` | Delete tenant |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/tenants/:tenantId/users` | List users in tenant |
| `POST` | `/api/v1/tenants/:tenantId/users` | Create user |
| `GET` | `/api/v1/tenants/:tenantId/users/:id` | Get user |
| `PATCH` | `/api/v1/tenants/:tenantId/users/:id` | Update user |
| `DELETE` | `/api/v1/tenants/:tenantId/users/:id` | Delete user |

### Policies
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/tenants/:tenantId/policies` | List policies |
| `POST` | `/api/v1/tenants/:tenantId/policies` | Create policy (draft) |
| `GET` | `/api/v1/tenants/:tenantId/policies/:id` | Get policy |
| `PUT` | `/api/v1/tenants/:tenantId/policies/:id` | Update policy spec |
| `DELETE` | `/api/v1/tenants/:tenantId/policies/:id` | Delete policy |

### Policy Versions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/tenants/:tenantId/policies/:id/versions` | List versions |
| `GET` | `/api/v1/tenants/:tenantId/policies/:id/versions/:version` | Get specific version |

### Policy Promotion
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/tenants/:tenantId/policies/:id/promote` | Promote to next status |
| `POST` | `/api/v1/tenants/:tenantId/policies/:id/demote` | Demote to previous status |

---

## Request/Response Schemas

### Create Tenant
**POST** `/api/v1/tenants`
```json
Request:
{
  "name": "Acme Corp",
  "slug": "acme",
  "settings": { "theme": "dark" }
}

Response (201):
{
  "id": "uuid",
  "name": "Acme Corp",
  "slug": "acme",
  "settings": { "theme": "dark" },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### Create User
**POST** `/api/v1/tenants/:tenantId/users`
```json
Request:
{
  "email": "john@acme.com",
  "name": "John Doe",
  "role": "editor"
}

Response (201):
{
  "id": "uuid",
  "tenantId": "uuid",
  "email": "john@acme.com",
  "name": "John Doe",
  "role": "editor",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### Create Policy
**POST** `/api/v1/tenants/:tenantId/policies`
```json
Request:
{
  "name": "customer-data-access",
  "description": "Controls access to customer PII",
  "spec": {
    "rules": [
      { "effect": "permit", "actions": ["read"], "resource": "customer:**" }
    ]
  }
}

Response (201):
{
  "id": "uuid",
  "tenantId": "uuid",
  "name": "customer-data-access",
  "description": "Controls access to customer PII",
  "spec": { "rules": [...] },
  "version": 1,
  "status": "draft",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### Promote Policy
**POST** `/api/v1/tenants/:tenantId/policies/:id/promote`
```json
Request:
{
  "note": "Passed security review"
}

Response (200):
{
  "id": "uuid",
  "status": "review",
  "version": 1,
  "promotedAt": "2024-01-01T00:00:00Z"
}
```

### List Policies
**GET** `/api/v1/tenants/:tenantId/policies?status=draft&version=2`
```json
Response (200):
{
  "data": [
    {
      "id": "uuid",
      "name": "customer-data-access",
      "version": 1,
      "status": "active",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

---

## Kafka Event Schema

### Topic: `policy.update`

```json
{
  "eventId": "uuid",
  "eventType": "policy.update",
  "tenantId": "uuid",
  "policyId": "uuid",
  "policyName": "customer-data-access",
  "version": 2,
  "previousStatus": "review",
  "newStatus": "active",
  "changedBy": "uuid",
  "timestamp": "2024-01-01T00:00:00Z",
  "metadata": {
    "promotionNote": "Approved for production"
  }
}
```

**Headers:**
- `event-type`: `policy.update`
- `tenant-id`: `<tenant-uuid>`

---

## Policy Promotion Workflow

```
draft → review → active → deprecated
  ↑        ↓
  └────────┘ (demote allowed)
```

**Rules:**
- `draft` → `review`: Editor+ required, creates version snapshot
- `review` → `active`: Admin approval required, publishes Kafka event
- `active` → `deprecated`: Admin only, retains policy for audit
- Any status can demote to previous status

---

## Quick Start

```bash
# Install dependencies
npm install

# Run migrations
npm run migration:run

# Start service
npm run start:dev
```

### Environment Variables
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/openauthority
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=policy.update
JWT_SECRET=your-secret
PORT=3001
```
