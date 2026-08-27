import React from "react";
import SessionWrapper from "@/components/admin/SessionWrapper";
import { getStoreConfig } from "@/lib/configHelper";

export const metadata = {
  title: "Painel do Entregador",
  description: "Área operacional mobile do entregador",
};

export default async function EntregadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = await getStoreConfig();

  return (
    <SessionWrapper>
      <div className="min-h-screen bg-brand-bg text-white flex flex-col justify-between selection:bg-brand-red selection:text-white">
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --brand-primary: ${config.primaryColor};
                --brand-primary-hover: ${config.primaryColorHover};
              }
            `,
          }}
        />
        <div className="flex-1 w-full max-w-lg mx-auto">
          {children}
        </div>
      </div>
    </SessionWrapper>
  );
}
