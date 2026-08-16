import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voxline · ElevenLabs Voice Agent",
  description: "A custom voice interface for an ElevenLabs AI agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
