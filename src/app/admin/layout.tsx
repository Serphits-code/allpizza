import React from "react";
import SessionWrapper from "@/components/admin/SessionWrapper";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionWrapper>
      <AdminShell>{children}</AdminShell>
    </SessionWrapper>
  );
}
