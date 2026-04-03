# Satnam Agent Wallet Quickstart

## What agents get

- Stateless Bearer JWT auth
- Zero wallet UI / zero seed phrase handling
- Auto-provisioned Lightning + Cashu rails on first call
- Outcome-scoped spending via `credit_envelope_id`

## Fastest possible smoke test

```bash
export SATNAM_AGENT_WALLET_BASE_URL="https://satnam.pub"
export SATNAM_AGENT_JWT="<agent-jwt>"

npm run agent-wallet -- balance
npm run agent-wallet -- receive --amount 1000 --rail lightning
npm run agent-wallet -- history --limit 10
```

If you later publish the CLI, the same commands can be exposed as `satnam-agent-wallet ...`.

## HTTP shape

- `GET /v1/agent-wallet`
- `POST /v1/agent-wallet/pay`
- `POST /v1/agent-wallet/send`
- `POST /v1/agent-wallet/receive`
- `GET /v1/agent-wallet/history`

All requests use:

```http
Authorization: Bearer <agent-jwt>
Content-Type: application/json
```

## Example: send with auto rail selection

```json
{
  "amount_sats": 1200,
  "payment_uri": "bitcoin:?amount=0.000012&lightning=lnbc...",
  "privacy_preference": "high"
}
```

- If the agent has enough Cashu balance and privacy is set to `high`, Satnam prefers Cashu.
- Otherwise it falls back to Lightning.

## Outcome-scoped spending

For NIP-AC spend controls, include:

```json
{
  "amount_sats": 2500,
  "invoice": "lnbc...",
  "credit_envelope_id": "uuid",
  "outcome_scope": "l402:lunanode:compute:5min"
}
```

## Framework examples

- `docs/agent-wallet/examples/crewai_tool.py`
- `docs/agent-wallet/examples/langchain_tool.ts`
- `docs/agent-wallet/examples/mcp_server.ts`
- `docs/agent-wallet/examples/a2a_actor.ts`
