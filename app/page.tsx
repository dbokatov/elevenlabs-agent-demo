import { VoiceAgent } from "./voice-agent";

export default function Home() {
  // Development connects directly to the public test agent. Production does
  // not send an agent ID to the browser; its backend endpoints use the private
  // production agent ID and API key from server-side environment variables.
  const developmentAgentId = process.env.ELEVENLABS_DEV_AGENT_ID;
  const secureSessions = process.env.NODE_ENV === "production";

  return (
    <main className="demo-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Voxline home">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span>Voxline</span>
        </a>
        <span className="step-label">ElevenLabs</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">CUSTOM VOICE INTERFACE</p>
          <h1>A conversation that feels present.</h1>
          <p className="hero-summary">
            Speak naturally with your ElevenLabs agent and watch the session
            move from connection to listening, thinking, and response.
          </p>
        </div>

        <VoiceAgent
          agentId={secureSessions ? undefined : developmentAgentId}
          secureSessions={secureSessions}
        />
      </section>
    </main>
  );
}
