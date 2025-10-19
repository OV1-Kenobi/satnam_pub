# Part 3: Infrastructure Decentralization Implementation Plan

## Overview

This specification defines a phased approach to reduce centralized dependencies and enable self-hosted deployments.

**Current Dependencies:**

- Supabase (database)
- Netlify Functions (serverless)
- Nostr relays (external)
- LNbits (Lightning wallet)

**Target State:**

- Self-hosted PostgreSQL or SQLite
- Multiple serverless platform support (Netlify, AWS Lambda, GCP)
- Federated instance deployment
- Optional self-hosted Nostr relay

---

## Phase 1: Self-Hosted Deployment (Weeks 1-3)

### 1.1 Docker/Kubernetes Setup

**Dockerfile (Frontend):**

```dockerfile
# File: Dockerfile.frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**docker-compose.yml (Local Development):**

```yaml
# File: docker-compose.yml
version: "3.8"
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: satnam
      POSTGRES_USER: satnam_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/privacy-first-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    ports:
      - "5432:5432"

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    environment:
      VITE_API_BASE_URL: http://localhost:3000
      VITE_SUPABASE_URL: http://localhost:54321
    ports:
      - "80:80"
    depends_on:
      - functions

  functions:
    build:
      context: .
      dockerfile: Dockerfile.functions
    environment:
      DATABASE_URL: postgresql://satnam_user:${DB_PASSWORD}@postgres:5432/satnam
      PHOENIXD_API_URL: ${PHOENIXD_API_URL}
      PHOENIXD_API_PASSWORD: ${PHOENIXD_API_PASSWORD}
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  phoenixd:
    image: acinq/phoenixd:latest
    environment:
      PHOENIX_API_PASSWORD: ${PHOENIXD_API_PASSWORD}
    ports:
      - "9740:9740"
    volumes:
      - phoenixd_data:/data

volumes:
  postgres_data:
  phoenixd_data:
```

**Dockerfile (Functions):**

```dockerfile
# File: Dockerfile.functions
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY netlify/functions_active ./functions
COPY lib ./lib
COPY src/lib ./src/lib
EXPOSE 3000
CMD ["node", "--loader", "tsx", "functions/index.ts"]
```

**Kubernetes Manifests:**

```yaml
# File: k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: satnam-frontend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: satnam-frontend
  template:
    metadata:
      labels:
        app: satnam-frontend
    spec:
      containers:
        - name: frontend
          image: satnam:frontend-latest
          ports:
            - containerPort: 80
          env:
            - name: VITE_API_BASE_URL
              value: "https://api.satnam.local"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: satnam-functions
spec:
  replicas: 2
  selector:
    matchLabels:
      app: satnam-functions
  template:
    metadata:
      labels:
        app: satnam-functions
    spec:
      containers:
        - name: functions
          image: satnam:functions-latest
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: satnam-secrets
                  key: database-url
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
```

### 1.2 Alternative Database Backends

**Database Abstraction Layer:**

```typescript
// File: src/lib/database/db-adapter.ts
import { Pool } from "pg";
import Database from "better-sqlite3";

export interface DatabaseAdapter {
  query(sql: string, params?: any[]): Promise<any>;
  insert(table: string, data: Record<string, any>): Promise<any>;
  update(
    table: string,
    data: Record<string, any>,
    where: Record<string, any>
  ): Promise<any>;
  delete(table: string, where: Record<string, any>): Promise<any>;
}

export class PostgresAdapter implements DatabaseAdapter {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async query(sql: string, params?: any[]): Promise<any> {
    return this.pool.query(sql, params);
  }

  async insert(table: string, data: Record<string, any>): Promise<any> {
    const keys = Object.keys(data);
    const vals = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${table} (${keys.join(
      ", "
    )}) VALUES (${placeholders}) RETURNING *`;
    const { rows } = await this.pool.query(sql, vals);
    return rows[0];
  }

  async update(
    table: string,
    data: Record<string, any>,
    where: Record<string, any>
  ): Promise<any> {
    const setKeys = Object.keys(data);
    const setClause = setKeys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const whereKeys = Object.keys(where);
    const whereClause = whereKeys
      .map((k, i) => `${k} = $${setKeys.length + i + 1}`)
      .join(" AND ");
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
    const { rows } = await this.pool.query(sql, [
      ...Object.values(data),
      ...Object.values(where),
    ]);
    return rows[0];
  }

  async delete(table: string, where: Record<string, any>): Promise<number> {
    const whereKeys = Object.keys(where);
    const whereClause = whereKeys
      .map((k, i) => `${k} = $${i + 1}`)
      .join(" AND ");
    const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    const res = await this.pool.query(sql, Object.values(where));
    return res.rowCount ?? 0;
  }
}

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
  }

  async query(sql: string, params?: any[]): Promise<any> {
    return this.db.prepare(sql).all(...(params || []));
  }

  async insert(table: string, data: Record<string, any>): Promise<any> {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => "?").join(", ");
    const stmt = this.db.prepare(
      `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`
    );
    const info = stmt.run(...Object.values(data));
    const row = this.db
      .prepare(`SELECT * FROM ${table} WHERE rowid = ?`)
      .get(info.lastInsertRowid);
    return row;
  }

  async update(
    table: string,
    data: Record<string, any>,
    where: Record<string, any>
  ): Promise<any> {
    const setKeys = Object.keys(data);
    const setClause = setKeys.map((k) => `${k} = ?`).join(", ");
    const whereKeys = Object.keys(where);
    const whereClause = whereKeys.map((k) => `${k} = ?`).join(" AND ");
    const stmt = this.db.prepare(
      `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`
    );
    stmt.run(...Object.values(data), ...Object.values(where));
    const row = this.db
      .prepare(`SELECT * FROM ${table} WHERE ${whereClause}`)
      .get(...Object.values(where));
    return row;
  }

  async delete(table: string, where: Record<string, any>): Promise<number> {
    const whereKeys = Object.keys(where);
    const whereClause = whereKeys.map((k) => `${k} = ?`).join(" AND ");
    const stmt = this.db.prepare(`DELETE FROM ${table} WHERE ${whereClause}`);
    const info = stmt.run(...Object.values(where));
    return info.changes ?? 0;
  }
}

export function createDatabaseAdapter(config: DatabaseConfig): DatabaseAdapter {
  switch (config.type) {
    case "postgres":
      return new PostgresAdapter(config.connectionString);
    case "sqlite":
      return new SQLiteAdapter(config.filePath);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}
```

**Environment Configuration:**

```bash
# .env.local
DATABASE_TYPE=postgres  # or sqlite
DATABASE_URL=postgresql://user:pass@localhost/satnam
# OR
DATABASE_FILE=/data/satnam.db
```

**Migration Scripts:**

```sql
-- File: database/migrations/001_init_schema.sql
-- Idempotent schema that works with both PostgreSQL and SQLite

CREATE TABLE IF NOT EXISTS user_identities (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  npub TEXT NOT NULL UNIQUE,
  encrypted_nsec TEXT NOT NULL,
  nip05 TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SQLite-compatible indexes
CREATE INDEX IF NOT EXISTS idx_user_identities_username ON user_identities(username);
CREATE INDEX IF NOT EXISTS idx_user_identities_npub ON user_identities(npub);
```

---

## Phase 2: Alternative Serverless Platforms (Weeks 4-6)

### 2.1 Serverless Abstraction Layer

````typescript

**SQLite Synchronous Adapter Architecture**

- Imports used by current adapters:
  - `import { Pool } from 'pg'`
  - `import Database from 'better-sqlite3'`
- Event-loop blocking risk: `better-sqlite3` is synchronous. Wrapping calls in `async` does NOT make them non-blocking and can block request processing under load.

Decision: Use Worker Threads to offload SQLite operations.

Implementation outline:
- Create a small Worker pool (`node:worker_threads`) dedicated to executing SQLite statements.
- Dispatch `query/insert/update/delete` tasks to workers; bound concurrency and queue requests.
- Pass SQL and parameters via structured clone; return results or errors to main thread.
- Keep direct sync path for CLI/migrations where blocking is acceptable.

Example skeleton:

```ts
// File: src/lib/database/sqlite-worker.ts
import { parentPort } from 'node:worker_threads';
import Database from 'better-sqlite3';
const db = new Database(process.env.SQLITE_FILE!);
parentPort!.on('message', ({ id, sql, params }) => {
  try {
    const stmt = db.prepare(sql);
    const res = /^(insert|update|delete)/i.test(sql)
      ? stmt.run(...(params || []))
      : stmt.all(...(params || []));
    parentPort!.postMessage({ id, ok: true, res });
  } catch (e) {
    parentPort!.postMessage({ id, ok: false, error: (e as Error).message });
  }
});
````

Rationale: This preserves SQLite portability while preventing event-loop stalls in production.

// File: netlify/functions/utils/serverless-adapter.ts
export interface ServerlessContext {
functionName: string;
requestId: string;
memoryLimitInMB: number;
getRemainingTimeInMillis(): number;
}

export interface ServerlessRequest {
method: string;
path: string;
headers: Record<string, string>;
body?: string;
queryStringParameters?: Record<string, string>;
}

export interface ServerlessResponse {
statusCode: number;
headers: Record<string, string>;
body: string;
}

export type ServerlessHandler = (
request: ServerlessRequest,
context: ServerlessContext
) => Promise<ServerlessResponse>;

// Platform-specific adapters
export class NetlifyAdapter {
static toServerlessRequest(event: any): ServerlessRequest {
return {
method: event.httpMethod,
path: event.path,
headers: event.headers,
body: event.body,
queryStringParameters: event.queryStringParameters,
};
}

static toNetlifyResponse(response: ServerlessResponse): any {
return {
statusCode: response.statusCode,
headers: response.headers,
body: response.body,
};
}
}

export class AWSLambdaAdapter {
static toServerlessRequest(event: any): ServerlessRequest {
return {
method: event.requestContext.http.method,
path: event.rawPath,
headers: event.headers,
body: event.body,
queryStringParameters: event.queryStringParameters,
};
}

static toLambdaResponse(response: ServerlessResponse): any {
return {
statusCode: response.statusCode,
headers: response.headers,
body: response.body,
};
}
}

export class GCPAdapter {
static toServerlessRequest(req: any): ServerlessRequest {
return {
method: req.method,
path: req.path,
headers: req.headers,
body: req.rawBody?.toString(),
queryStringParameters: req.query,
};
}

static toGCPResponse(res: any, response: ServerlessResponse): void {
res.status(response.statusCode);
Object.entries(response.headers).forEach(([key, value]) => {
res.set(key, value as string);
});
res.send(response.body);
}
}

````

### 2.2 AWS Lambda Deployment

**Terraform Configuration:**

```hcl
# File: terraform/aws/main.tf
provider "aws" {
  region = var.aws_region
}

resource "aws_lambda_function" "satnam_functions" {
  filename      = "function.zip"
  function_name = "satnam-functions"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 512

  environment {
    variables = {
      DATABASE_URL = aws_db_instance.postgres.endpoint
      PHOENIXD_API_URL = var.phoenixd_api_url
    }
  }
}

resource "aws_apigatewayv2_api" "satnam_api" {
  name          = "satnam-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id           = aws_apigatewayv2_api.satnam_api.id
  integration_type = "AWS_PROXY"
  integration_method = "POST"
  payload_format_version = "2.0"
  target = aws_lambda_function.satnam_functions.arn
}
````

### 2.3 GCP Cloud Functions Deployment

```yaml
# File: gcp/cloudfunctions.yaml
runtime: nodejs20
entryPoint: handler
sourceArchiveUrl: gs://satnam-functions/source.zip
environmentVariables:
  DATABASE_URL: ${DATABASE_URL}
  PHOENIXD_API_URL: ${PHOENIXD_API_URL}
```

---

## Phase 3: Federated Deployment (Weeks 7-10)

### 3.1 Multi-Instance Federation

**Federation Protocol:**

```typescript
// File: src/lib/federation/federation-protocol.ts
export interface FederatedInstance {
  instanceId: string;
  domain: string;
  publicKey: string;
  relays: string[];
  trustScore: number;
  lastSeen: Date;
}

export class FederationManager {
  async discoverInstances(): Promise<FederatedInstance[]> {
    // 1. Query Nostr relays for instance announcements (kind:30078)
    const events = await CEPS.list([
      { kinds: [30078], tags: [["d", "satnam_instance"]] },
    ]);

    // 2. Parse and verify instance metadata
    return events.map((e) => this.parseInstanceEvent(e));
  }

  async verifyIdentityAcrossInstances(
    nip05: string,
    targetInstance: FederatedInstance
  ): Promise<boolean> {
    // 1. Query target instance's identity resolver
    const response = await fetch(
      `https://${targetInstance.domain}/api/identity/verify?nip05=${nip05}`
    );

    // 2. Verify response signature
    const data = await response.json();
    return this.verifySignature(data, targetInstance.publicKey);
  }
}
```

#### 3.1.1 Response Signature Verification Specification

- Payload scope: Signature covers the SHA-256 hash of the exact raw HTTP response body (bytes) to avoid JSON canonicalization ambiguity. Additionally include a timestamp for freshness.
- Signature encoding: Server includes the following headers on signed responses:
  - `X-Signature: <hex-encoded Ed25519 signature>`
  - `X-Signature-Timestamp: <unix-seconds>`
  - `X-Key-Id: <stable key identifier>`
- Key management:
  - Primary discovery: Nostr kind:30078 announcement MUST include a `pubkey` tag with the Ed25519 public key (hex or npub resolved to hex).
  - Secondary discovery: `https://<domain>/.well-known/satnam-instance.json` exposing `{ keyId, ed25519PublicKey }` with integrity via HTTPS and long-cache headers.
  - Rotation: Publish updated kind:30078 event with new key and include `prev-key-id` for continuity; keep old keys valid for a grace period.
- Verification policy:
  - Reject if timestamp is older than 1 hour (replay protection) or more than 5 minutes in the future (clock skew guard).
  - Reject if `X-Key-Id` not recognized or public key not yet validated.
  - On failure: treat the response as untrusted, return `false`, and do not cache; log with rate-limited warnings and apply exponential backoff.

Example verifier (client):

```ts
import { ed25519 } from "@noble/curves/ed25519";

async function verifyFederationResponse(
  res: Response,
  pubkeyHex: string
): Promise<boolean> {
  const bodyBuf = new Uint8Array(await res.clone().arrayBuffer());
  const sigHex = res.headers.get("X-Signature") || "";
  const tsStr = res.headers.get("X-Signature-Timestamp") || "";
  if (!/^[0-9a-fA-F]{128}$/.test(sigHex)) return false;
  const ts = Number(tsStr);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(ts) || ts < now - 3600 || ts > now + 300) return false;
  const hash = await crypto.subtle.digest("SHA-256", bodyBuf);
  const toVerify = new Uint8Array(hash); // SHA-256(body)
  const sig = new Uint8Array(Buffer.from(sigHex, "hex"));
  const pub = new Uint8Array(Buffer.from(pubkeyHex, "hex"));
  return ed25519.verify(sig, toVerify, pub);
}
```

### 3.2 Instance Discovery

**Nostr Event for Instance Discovery (kind:30078):**

```json
{
  "kind": 30078,
  "tags": [
    ["d", "satnam_instance"],
    ["domain", "satnam.pub"],
    ["name", "Satnam.pub Primary Instance"],
    ["description", "Bitcoin-only family banking"],
    ["icon", "https://satnam.pub/icon.png"],
    ["pubkey", "npub1..."],
    ["trust", "95"]
  ],
  "content": "Instance metadata (additional info)"
}
```

---

## Implementation Timeline

| Week | Task                        | Dependencies |
| ---- | --------------------------- | ------------ |
| 1    | Docker/Compose setup        | None         |
| 2    | Database abstraction layer  | Week 1       |
| 3    | Kubernetes manifests        | Week 1-2     |
| 4    | Serverless adapter layer    | None         |
| 5    | AWS Lambda deployment       | Week 4       |
| 6    | GCP Cloud Functions         | Week 4       |
| 7    | Federation protocol design  | Week 1-6     |
| 8    | Instance discovery          | Week 7       |
| 9    | Cross-instance verification | Week 7-8     |
| 10   | Testing & documentation     | Week 1-9     |

---

## Deployment Checklist

- [ ] Docker images build successfully
- [ ] docker-compose runs locally
- [ ] Kubernetes manifests deploy to cluster
- [ ] Database migrations run on all backends
- [ ] Serverless adapters work on all platforms
- [ ] Federation protocol tested with 2+ instances
- [ ] Cross-instance identity verification works
- [ ] Monitoring and alerting configured
- [ ] Disaster recovery procedures documented
- [ ] User migration guide created
