import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AllDelivery | Artisanal Crust & Ember",
  description: "Cardápio digital premium da pizzaria Artisanal Crust & Ember",
};

import { getStoreConfig } from "@/lib/configHelper";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await getStoreConfig();

  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.variable} bg-brand-bg text-white antialiased font-sans`}>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --font-playfair: var(--font-inter);
                --brand-primary: ${config.primaryColor};
                --brand-primary-hover: ${config.primaryColorHover};
              }
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
