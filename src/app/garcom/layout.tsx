import React from "react";
import SessionWrapper from "@/components/admin/SessionWrapper";
import { getStoreConfig } from "@/lib/configHelper";

export const metadata = {
  title: "Área do Garçom — Salão & Mesas",
  description: "Sistema Quick-Order e gestão de mesas para garçons",
};

export default async function GarcomLayout({
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
        <div className="flex-1 w-full">
          {children}
        </div>
      </div>
    </SessionWrapper>
  );
}
