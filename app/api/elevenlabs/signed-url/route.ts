import { createCredentialResponse } from "@/lib/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return createCredentialResponse("signedUrl");
}
