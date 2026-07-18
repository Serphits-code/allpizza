import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
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
      <body className={`${inter.variable} ${playfair.variable} bg-brand-bg text-white antialiased`}>
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
        {children}
      </body>
    </html>
  );
}
