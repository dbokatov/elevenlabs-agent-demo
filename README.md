# ElevenLabs Agent Demo

A standard Next.js application for voice and text conversations with two
ElevenLabs agents:

- Development connects directly to a public test agent.
- Production obtains short-lived credentials from server-side API routes and
  connects to a private production agent.

## Requirements

- Node.js 22.13 or newer
- An ElevenLabs API key
- A public development agent
- A private production agent

## Environment

Copy `.env.example` to `.env` and provide your values:

```dotenv
ELEVENLABS_API_KEY=your_server_side_api_key
ELEVENLABS_DEV_AGENT_ID=your_public_development_agent_id
ELEVENLABS_PROD_AGENT_ID=your_private_production_agent_id
ELEVENLABS_SECRET_ARN=arn:aws:secretsmanager:eu-west-1:123456789012:secret:your-secret-name
```

Never prefix the API key with `NEXT_PUBLIC_`; that would expose it to browser
code. `.env` files are ignored by Git. Local development reads
`ELEVENLABS_API_KEY` directly. AWS Lambda omits that value and uses
`ELEVENLABS_SECRET_ARN` to retrieve a JSON secret containing the
`ELEVENLABS_API_KEY` field at runtime.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Development uses
`ELEVENLABS_DEV_AGENT_ID` directly and does not call the credential endpoints.

## Production-mode test

```bash
npm run build
npm run start
```

Production uses `ELEVENLABS_PROD_AGENT_ID`. The browser requests a WebRTC token
for voice or a signed WebSocket URL for chat. The API key stays on the server.

## AWS Lambda container

The production image uses the standard Next.js standalone server with AWS
Lambda Web Adapter. Build it for the same architecture as the Lambda function:

```bash
docker buildx build \
  --platform linux/arm64 \
  --provenance=false \
  --load \
  -t voxline-elevenlabs-agent-demo:local .
```

The image contains no `.env` files. In AWS, configure only
`ELEVENLABS_PROD_AGENT_ID` and `ELEVENLABS_SECRET_ARN`, and grant the Lambda
execution role `secretsmanager:GetSecretValue` for that exact secret ARN.

## Validation

```bash
npm run check
```

This runs linting, TypeScript checking, project tests, and the production build.

## Project structure

```text
app/
  api/elevenlabs/       Server-only credential endpoints
  globals.css           Application styling
  layout.tsx            Root document and metadata
  page.tsx              Environment selection and page layout
  voice-agent.tsx       ElevenLabs React SDK integration and UI
lib/
  elevenlabs.ts         Shared server-side ElevenLabs credential logic
public/
  favicon.svg
tests/
  project.test.mjs
Dockerfile              Lambda container image
run.sh                  Next.js container startup command
```
