import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readProjectFile = (path) => readFile(projectFile(path), "utf8");

test("uses the standard Next.js runtime without Cloudflare scaffolding", async () => {
  const [packageText, page, tokenRoute, signedUrlRoute] = await Promise.all([
    readProjectFile("package.json"),
    readProjectFile("app/page.tsx"),
    readProjectFile("app/api/elevenlabs/conversation-token/route.ts"),
    readProjectFile("app/api/elevenlabs/signed-url/route.ts"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.build, "next build");
  assert.equal(packageJson.scripts.start, "next start");
  assert.ok(packageJson.dependencies.next);

  for (const text of [packageText, page, tokenRoute, signedUrlRoute]) {
    assert.doesNotMatch(text, /cloudflare:workers|\bvinext\b|\bwrangler\b/);
  }
});

test("keeps development public and production credentialed", async () => {
  const [page, client, server] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("app/voice-agent.tsx"),
    readProjectFile("lib/elevenlabs.ts"),
  ]);

  assert.match(page, /process\.env\.ELEVENLABS_DEV_AGENT_ID/);
  assert.match(page, /process\.env\.NODE_ENV === "production"/);
  assert.match(client, /startSession\(\{\s*agentId,/);
  assert.match(client, /startSession\(\{\s*conversationToken,/);
  assert.match(client, /startSession\(\{\s*signedUrl,/);
  assert.match(server, /process\.env\.ELEVENLABS_API_KEY/);
  assert.match(server, /process\.env\.ELEVENLABS_SECRET_ARN/);
  assert.match(server, /process\.env\.ELEVENLABS_PROD_AGENT_ID/);
  assert.match(server, /SecretsManagerClient/);
  assert.match(server, /GetSecretValueCommand/);
  assert.match(server, /AbortSignal\.timeout\(10_000\)/);
  assert.match(server, /"Cache-Control": "no-store"/);
});

test("packages the standalone Next.js server for AWS Lambda", async () => {
  const [dockerfile, dockerignore, startup] = await Promise.all([
    readProjectFile("Dockerfile"),
    readProjectFile(".dockerignore"),
    readProjectFile("run.sh"),
  ]);

  assert.match(dockerfile, /aws-lambda-adapter:1\.0\.1/);
  assert.match(dockerfile, /\.next\/standalone/);
  assert.match(dockerfile, /\.next\/static/);
  assert.match(dockerignore, /^\.env\*$/m);
  assert.match(startup, /exec node server\.js/);
});
