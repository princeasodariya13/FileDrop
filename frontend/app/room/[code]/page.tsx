import type { Metadata } from "next";
import { RoomPageClient } from "./RoomPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const code = resolvedParams.code;

  return {
    title: `Live Room #${code} — FileDrop Connect Devices`,
    description: "Join live multi-device shared room on FileDrop for real-time file transfer.",
    robots: {
      index: false,
      follow: false,
      noimageindex: true,
      nocache: true,
    },
  };
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const resolvedParams = await params;
  return <RoomPageClient code={resolvedParams.code} />;
}
