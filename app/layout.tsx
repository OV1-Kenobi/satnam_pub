import React from "react";
import "../src/index.css"; // Assuming this contains your Tailwind CSS imports

export const metadata = {
  title: "Sovereign Bitcoin Identity Forge",
  description: "A platform for managing sovereign Bitcoin identity",
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
