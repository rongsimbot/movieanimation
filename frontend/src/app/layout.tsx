import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ToastProvider } from "@/components/ui/toast";

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
    default: "MovieAnimation.ai — AI Video Generation Studio",
    template: "%s — MovieAnimation.ai",
  },
  description:
    "Turn your screenplay into a movie. Upload scripts, generate characters, compose scenes with lip-synced dialogue, and export finished films — all powered by AI.",
  keywords: [
    "AI video generation",
    "movie creation",
    "AI animation",
    "script to video",
    "video generation",
    "AI filmmaking",
    "screenplay to movie",
  ],
  authors: [{ name: "SimRobotics Corp", url: "https://simrobotics.com" }],
  creator: "SimRobotics Corp",
  publisher: "SimRobotics Corp",
  metadataBase: new URL("https://movieanimation.ai"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://movieanimation.ai",
    siteName: "MovieAnimation.ai",
    title: "MovieAnimation.ai — AI Video Generation Studio",
    description:
      "Turn your screenplay into a movie. Upload scripts, generate characters, compose scenes with lip-synced dialogue, and export finished films.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MovieAnimation.ai — AI-Powered Movie Studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MovieAnimation.ai — AI Video Generation Studio",
    description:
      "Turn your screenplay into a movie with AI. Upload scripts, generate characters, and export finished films.",
    images: ["/og-image.png"],
    creator: "@simrobotics",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950">
        <ErrorBoundary>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
