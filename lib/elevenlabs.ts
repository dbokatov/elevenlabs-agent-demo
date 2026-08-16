import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

const secretsManagerClient = new SecretsManagerClient({});

let cachedApiKeyPromise: Promise<string> | undefined;

async function loadApiKeyFromSecretsManager() {
  const secretArn = process.env.ELEVENLABS_SECRET_ARN;

  if (!secretArn) {
    throw new Error("ELEVENLABS_SECRET_ARN is not configured.");
  }

  const response = await secretsManagerClient.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );

  if (!response.SecretString) {
    throw new Error("The ElevenLabs secret has no string value.");
  }

  let secret: unknown;

  try {
    secret = JSON.parse(response.SecretString);
  } catch {
    throw new Error("The ElevenLabs secret is not valid JSON.");
  }

  if (
    typeof secret !== "object" ||
    secret === null ||
    !("ELEVENLABS_API_KEY" in secret) ||
    typeof secret.ELEVENLABS_API_KEY !== "string" ||
    secret.ELEVENLABS_API_KEY.length === 0
  ) {
    throw new Error("The ElevenLabs secret does not contain ELEVENLABS_API_KEY.");
  }

  return secret.ELEVENLABS_API_KEY;
}

async function getElevenLabsApiKey() {
  // Local development can use the API key from .env. In AWS, only the secret
  // ARN is configured and the execution role retrieves the value at runtime.
  const localApiKey = process.env.ELEVENLABS_API_KEY;

  if (localApiKey) {
    return localApiKey;
  }

  cachedApiKeyPromise ??= loadApiKeyFromSecretsManager().catch((error) => {
    // Allow a later invocation to retry after a temporary AWS failure.
    cachedApiKeyPromise = undefined;
    throw error;
  });

  return cachedApiKeyPromise;
}

const credentialSettings = {
  conversationToken: {
    path: "/v1/convai/conversation/token",
    upstreamField: "token",
    failureMessage: "Could not create a voice session.",
    missingMessage: "ElevenLabs returned no conversation token.",
  },
  signedUrl: {
    path: "/v1/convai/conversation/get-signed-url",
    upstreamField: "signed_url",
    failureMessage: "Could not create a chat session.",
    missingMessage: "ElevenLabs returned no signed URL.",
  },
} as const;

export type CredentialKind = keyof typeof credentialSettings;

export async function createCredentialResponse(kind: CredentialKind) {
  const agentId = process.env.ELEVENLABS_PROD_AGENT_ID;

  if (!agentId) {
    return Response.json(
      { error: "ElevenLabs server configuration is missing." },
      { status: 500, headers: noStoreHeaders },
    );
  }

  let apiKey: string;

  try {
    apiKey = await getElevenLabsApiKey();
  } catch (secretError) {
    console.error(
      "ElevenLabs API key could not be loaded:",
      secretError instanceof Error ? secretError.name : "unknown error",
    );

    return Response.json(
      { error: "ElevenLabs server configuration is unavailable." },
      { status: 500, headers: noStoreHeaders },
    );
  }

  const settings = credentialSettings[kind];
  const query = new URLSearchParams({
    agent_id: agentId,
    environment: "production",
  });

  let response: Response;

  try {
    response = await fetch(
      `https://api.elevenlabs.io${settings.path}?${query}`,
      {
        method: "GET",
        headers: { "xi-api-key": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (requestError) {
    const timedOut =
      requestError instanceof Error && requestError.name === "TimeoutError";

    console.error(
      `ElevenLabs ${kind} request could not be sent:`,
      timedOut ? "request timed out" : "network error",
    );

    return Response.json(
      {
        error: timedOut
          ? "ElevenLabs did not respond in time."
          : "Could not reach ElevenLabs.",
      },
      { status: timedOut ? 504 : 502, headers: noStoreHeaders },
    );
  }

  if (!response.ok) {
    console.error(`ElevenLabs ${kind} request failed:`, response.status);

    return Response.json(
      { error: settings.failureMessage },
      { status: 502, headers: noStoreHeaders },
    );
  }

  let data: Record<string, unknown>;

  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "ElevenLabs returned an invalid response." },
      { status: 502, headers: noStoreHeaders },
    );
  }

  const credential = data[settings.upstreamField];

  if (typeof credential !== "string" || credential.length === 0) {
    return Response.json(
      { error: settings.missingMessage },
      { status: 502, headers: noStoreHeaders },
    );
  }

  return Response.json(
    { [kind]: credential },
    { headers: noStoreHeaders },
  );
}
