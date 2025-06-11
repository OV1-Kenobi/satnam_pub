import React from "react";
import "../styles/globals.css"; // Tailwind CSS imports

export const metadata = {
  title: "Satnam.pub Identity Forge",
  description: "Your sovereign Bitcoin identity platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
