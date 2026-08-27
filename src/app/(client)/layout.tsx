import React from "react";
import ClientHeader from "@/components/client/Header";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-bg text-white w-full max-w-full overflow-x-hidden">
      <ClientHeader />
      <div className="flex-1 w-full max-w-full overflow-x-hidden">{children}</div>
    </div>
  );
}
