"use client";

// ElevenLabs supplies the conversation provider and the hook used to control a session.
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useRef, useState } from "react";

// Each transcript item records who sent the message and what they said.
type TranscriptEntry = {
  role: "user" | "agent";
  message: string;
  timestamp: number;
};

// The user can choose one of these session types before connecting.
type ConversationChannel = "voice" | "chat";

type VoiceSessionProps = {
  agentId?: string;
  secureSessions: boolean;
};

type ApiError = {
  error?: string;
};

async function readApiResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & ApiError;

  if (!response.ok) {
    throw new Error(data.error ?? "Could not create an ElevenLabs session.");
  }

  return data;
}

// Convert a stored Unix timestamp into a readable local clock time.
function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function VoiceSession({ agentId, secureSessions }: VoiceSessionProps) {
  // React state used by both voice and chat sessions. 
  const [conversationId, setConversationId] = useState<string>();
  const [error, setError] = useState<string>();
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [channel, setChannel] = useState<ConversationChannel>("voice");
  const [draftMessage, setDraftMessage] = useState("");
  // Stores when the current connection attempt started.
  const connectionStartedAtRef = useRef<number | null>(null);
  // Stores when the most recent chat message was sent.
  const pendingMessageStartedAtRef = useRef<number | null>(null);
  // Values displayed in the UI.
  const [connectionLatencyMs, setConnectionLatencyMs] = useState<number>();
  const [responseLatencyMs, setResponseLatencyMs] = useState<number>();

  // Configure the ElevenLabs SDK and react to events received from the session.
  const conversation = useConversation({
    // Log every connection-status change for local diagnostics.
    onStatusChange: ({ status }) => {
      console.info("[ElevenLabs] Session status changed:", status);
    },
    onConnect: ({ conversationId: id }) => {
      setConversationId(id);
      setError(undefined);

      if (connectionStartedAtRef.current !== null) {
        const latency =
          performance.now() -
          connectionStartedAtRef.current;

        const roundedLatency = Math.round(latency);

        setConnectionLatencyMs(roundedLatency);
        connectionStartedAtRef.current = null;

        console.info(
          `[ElevenLabs] Connected in ${roundedLatency} ms`,
        );
      }
    },
    onDisconnect: () => {
      connectionStartedAtRef.current = null;
      pendingMessageStartedAtRef.current = null;
    },
    onError: (message) => {
      connectionStartedAtRef.current = null;
      pendingMessageStartedAtRef.current = null;
      setError(message);
    },
    // Add user and agent messages to the transcript.
    onMessage: ({ role, message }) => {
      const timestamp = Date.now();

      // If this is the first agent message after a user message,
      // calculate how long the agent took to respond.
      if (
        role === "agent" &&
        pendingMessageStartedAtRef.current !== null
      ) {
        const latency =
          performance.now() -
          pendingMessageStartedAtRef.current;

        const roundedLatency = Math.round(latency);

        setResponseLatencyMs(roundedLatency);
        pendingMessageStartedAtRef.current = null;

        console.info(
          `[ElevenLabs] Agent response latency: ${roundedLatency} ms`,
        );
      }

      setTranscript((current) => {
        const previous = current.at(-1);

        if (
          previous?.role === role &&
          previous.message === message
        ) {
          return current;
        }

        return [
          ...current,
          {
            role,
            message,
            timestamp,
          },
        ];
      });
    },

  });

  // Derived values make the JSX below easier to read.
  const isConnected = conversation.status === "connected";
  const isConnecting = conversation.status === "connecting";
  const isChat = channel === "chat";

  const statusLabel = error
    ? "Needs attention"
    : isConnecting
      ? "Connecting"
      : isConnected && !isChat && conversation.isSpeaking
        ? "Agent speaking"
        : isConnected
          ? isChat
            ? "Chat ready"
            : "Listening"
          : "Ready";

  const heading = error
    ? "Connection paused"
    : isConnecting
      ? "Opening the session"
      : isConnected && !isChat && conversation.isSpeaking
        ? "Your agent is responding"
        : isConnected
          ? isChat
            ? "Chat is ready"
            : "I’m listening"
          : "Ready when you are";

  // Development uses the public test agent ID. Production asks our backend for
  // a short-lived conversation token, keeping the API key server-side.
  async function startVoiceConversation() {
    setError(undefined);
    setTranscript([]);
    setConnectionLatencyMs(undefined);
    setResponseLatencyMs(undefined);
    connectionStartedAtRef.current = null;
    pendingMessageStartedAtRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      // Start timing after microphone permission, immediately before the SDK connects.
      connectionStartedAtRef.current = performance.now();

      if (secureSessions) {
        const response = await fetch("/api/elevenlabs/conversation-token", {
          cache: "no-store",
        });
        const { conversationToken } = await readApiResponse<{
          conversationToken: string;
        }>(response);

        await conversation.startSession({
          conversationToken,
          textOnly: false,
        });
      } else {
        if (!agentId) {
          throw new Error("The development ElevenLabs agent ID is not configured.");
        }

        await conversation.startSession({
          agentId,
          textOnly: false,
        });
      }
    } catch (sessionError) {
      connectionStartedAtRef.current = null;
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "Could not start the voice session.",
      );
    }
  }

  // Development uses the public test agent ID. Production asks our backend for
  // a short-lived signed WebSocket URL for the private ElevenLabs agent.
  async function startChatConversation() {
    setError(undefined);
    setTranscript([]);
    setConnectionLatencyMs(undefined);
    setResponseLatencyMs(undefined);
    connectionStartedAtRef.current = null;
    pendingMessageStartedAtRef.current = null;

    try {
      // Start timing immediately before the text-only SDK connection begins.
      connectionStartedAtRef.current = performance.now();

      const textOnlyOptions = {
        textOnly: true,
        overrides: {
          conversation: {
            textOnly: true,
          },
        },
      } as const;

      if (secureSessions) {
        const response = await fetch("/api/elevenlabs/signed-url", {
          cache: "no-store",
        });
        const { signedUrl } = await readApiResponse<{
          signedUrl: string;
        }>(response);

        await conversation.startSession({
          signedUrl,
          ...textOnlyOptions,
        });
      } else {
        if (!agentId) {
          throw new Error("The development ElevenLabs agent ID is not configured.");
        }

        await conversation.startSession({
          agentId,
          ...textOnlyOptions,
        });
      }
    } catch (sessionError) {
      connectionStartedAtRef.current = null;
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "Could not start the chat session.",
      );
    }
  }
  
  // Send a trimmed chat message and then clear the composer.
  function sendChatMessage(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const message = draftMessage.trim();

    if (
      !message ||
      conversation.status !== "connected"
    ) {
      return;
    }

    // The next agent message will complete this response-latency measurement.
    pendingMessageStartedAtRef.current = performance.now();
    setResponseLatencyMs(undefined);

    // Immediately display what the user typed.
    setTranscript((current) => [
      ...current,
      {
        role: "user",
        message,
        timestamp: Date.now(),
      },
    ]);

    // Send the same message to ElevenLabs.
    conversation.sendUserMessage(message);

    // Clear the message box.
    setDraftMessage("");
  }

  // Both session types use the same method to disconnect.
  function endConversation() {
    conversation.endSession();
  }

  return (
    // Main card containing the mode selector, transcript, and session controls.
    <div
      className={`conversation-card ${isConnected ? "is-connected" : ""} ${conversation.isSpeaking ? "is-speaking" : ""}`}
      aria-label={isChat ? "Chat conversation" : "Voice conversation"}
    >
      
      {/* Choose the session type before connecting. */}
      <div className="channel-selector" role="group" aria-label="Conversation type">
        <button
          className={`channel-button ${!isChat ? "is-active" : ""}`}
          type="button"
          onClick={() => setChannel("voice")}
          disabled={conversation.status !== "disconnected"}
          aria-pressed={!isChat}
        >
          <span className="channel-symbol voice-symbol" aria-hidden="true">●</span>
          Voice
        </button>

        <button
          className={`channel-button ${isChat ? "is-active" : ""}`}
          type="button"
          onClick={() => setChannel("chat")}
          disabled={conversation.status !== "disconnected"}
          aria-pressed={isChat}
        >
          <span className="channel-symbol chat-symbol" aria-hidden="true">Aa</span>
          Chat
        </button>
      </div>
      {/* Current session label and connection status. */}
      <div className="card-topline">
        <span>{isChat ? "CHAT SESSION" : "VOICE SESSION"}</span>
        <span className={`status-pill status-${conversation.status}`}>
          <span className="status-dot" /> {statusLabel}
        </span>
      </div>

      {/* Reserve the same central area for voice and chat to keep both cards balanced. */}
      <div className={`conversation-stage ${isChat ? "chat-stage" : "voice-stage"}`}>
        {/* Matching visual for the selected voice or chat experience. */}
        <div className="orb-stage" aria-hidden="true">
          <div className="orb-ring orb-ring-outer" />
          <div className="orb-ring orb-ring-inner" />
          {isChat ? (
            <div className="chat-orb">
              <div className="chat-bubble-mark">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : (
            <div className="voice-orb"><span /><span /><span /><span /><span /></div>
          )}
        </div>

        {/* Human-readable heading, instructions, or error message. */}
        <div className="session-copy" aria-live="polite">
          <h2>{heading}</h2>
          <p>
            {error
              ? error
              : isConnected
                ? isChat
                  ? "Write a message below and press Send."
                  : "Speak naturally. You can interrupt the agent at any time."
                : isChat
                  ? "Start a session to chat with your configured AI agent."
                  : "Start a session to speak with your configured AI agent."}
          </p>
        </div>
      </div>

      {/* Messages received through the ElevenLabs onMessage callback. */}
      {transcript.length > 0 && (
        <div
          className={`transcript ${isChat ? "chat-thread" : ""}`}
          aria-label={isChat ? "Conversation messages" : "Latest transcript"}
        >
          {transcript.map((entry, index) => (
            <p className={`transcript-line transcript-${entry.role}`} key={`${entry.role}-${index}-${entry.message}`}>
              <span className="transcript-meta">
                <strong>{entry.role === "agent" ? "Agent" : "You"}</strong>
                <time
                  className="message-time"
                  dateTime={new Date(entry.timestamp).toISOString()}
                >
                  {formatTimestamp(entry.timestamp)}
                </time>
              </span>
              <span className="transcript-message">{entry.message}</span>
            </p>
          ))}
        </div>
      )}

      {/* Show the latest connection and chat-response measurements. */}
      {(connectionLatencyMs !== undefined || responseLatencyMs !== undefined) && (
        <div className="latency-summary" aria-label="Session performance">
          {connectionLatencyMs !== undefined && (
            <span>
              Connected in <strong>{connectionLatencyMs} ms</strong>
            </span>
          )}
          {responseLatencyMs !== undefined && (
            <span>
              Agent responded in <strong>{responseLatencyMs} ms</strong>
            </span>
          )}
        </div>
      )}

      {/* Chat composer appears after a text-only session connects. */}
      {isChat && isConnected && (
        <form className="chat-composer" onSubmit={sendChatMessage}>
          <textarea
            className="chat-input"
            value={draftMessage}
            placeholder="Write a message…"
            rows={3}
            aria-label="Message to the agent"
            onChange={(event) => {
              setDraftMessage(event.target.value);
              conversation.sendUserActivity();
            }}
          />

          <div className="chat-composer-footer">
            <span>Press Send when your message is ready</span>
            <button
              className="send-button"
              type="submit"
              disabled={
                conversation.status !== "connected" ||
                !draftMessage.trim()
              }
            >
              Send
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      )}

      {/* Buttons for muting, starting, and ending the active VOICE session. */}
      <div className="session-controls">
        {channel === "voice" && isConnected && (
          <button
            className="mute-button"
            type="button"
            onClick={() => conversation.setMuted(!conversation.isMuted)}
            aria-pressed={conversation.isMuted}
          >
            {conversation.isMuted ? "Unmute" : "Mute"}
          </button>
        )}
        
        {/* Start the selected channel, or end the active conversation. */}
        <button
          className={`start-button ${isConnected ? "end-button" : ""}`}
          type="button"
          onClick={isConnected ? endConversation : channel === "chat" ? startChatConversation : startVoiceConversation}
          disabled={isConnecting}
        >
          {isChat ? (
            <span className="chat-icon" aria-hidden="true">Aa</span>
          ) : (
            <span className="mic-icon" aria-hidden="true">●</span>
          )}
          {isConnecting
            ? "Connecting…"
            : isConnected
              ? "End conversation"
                : channel === "chat"
                  ? "Start chat conversation"
                  : "Start voice conversation"}
        </button>
      </div>

      {/* Show the assigned conversation ID after a connection is established. */}
      <p className="permission-note">
        {conversationId
          ? `Conversation ${conversationId}`
          : isChat
            ? "Chat mode does not require microphone access."
            : "Your browser will ask for microphone permission."}
      </p>
    </div>
  );
}

export function VoiceAgent({ agentId, secureSessions }: VoiceSessionProps) {
  return (
    // Every component that calls an ElevenLabs conversation hook must be inside this provider.
    <ConversationProvider>
      <VoiceSession agentId={agentId} secureSessions={secureSessions} />
    </ConversationProvider>
  );
}
