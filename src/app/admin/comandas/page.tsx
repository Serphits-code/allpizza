import React from "react";
import ComandasManager from "@/components/admin/comandas/ComandasManager";

export const dynamic = "force-dynamic";

export default function AdminComandasPage() {
  return <ComandasManager isAdminView={true} />;
}
