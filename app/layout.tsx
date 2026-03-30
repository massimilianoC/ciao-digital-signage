import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Ciao Digital Signage",
    template: "%s | Ciao Digital Signage",
  },
  description:
    "Ciao Digital Signage Platform - Gestisci schermi, contenuti e palinsesti da un'unica piattaforma.",
  icons: {
    icon: [
      { url: "/ciao_sprite_dark.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/ciao_sprite_dark.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Ciao Digital Signage",
    description:
      "Ciao Digital Signage Platform - Gestisci schermi, contenuti e palinsesti da un'unica piattaforma.",
    images: [
      {
        url: "/ciao_sprite_dark.png",
        width: 1106,
        height: 660,
        alt: "Ciao Digital Signage",
      },
    ],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
