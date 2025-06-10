import React from "react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">
        <h1 className="text-6xl font-bold">
          Welcome to{" "}
          <span className="text-blue-600">
            Sovereign Bitcoin Identity Forge
          </span>
        </h1>

        <p className="mt-3 text-2xl">
          Your secure platform for Bitcoin identity management
        </p>

        <div className="flex flex-wrap items-center justify-around max-w-4xl mt-6 sm:w-full">
          <a
            href="#"
            className="p-6 mt-6 text-left border w-96 rounded-xl hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Family Coordination &rarr;</h3>
            <p className="mt-4 text-xl">
              Manage your family's Bitcoin identity and access.
            </p>
          </a>

          <a
            href="#"
            className="p-6 mt-6 text-left border w-96 rounded-xl hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Identity Forge &rarr;</h3>
            <p className="mt-4 text-xl">
              Create and manage your sovereign Bitcoin identity.
            </p>
          </a>

          <a
            href="#"
            className="p-6 mt-6 text-left border w-96 rounded-xl hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Nostr Ecosystem &rarr;</h3>
            <p className="mt-4 text-xl">
              Connect with the decentralized social network.
            </p>
          </a>

          <a
            href="#"
            className="p-6 mt-6 text-left border w-96 rounded-xl hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Education Platform &rarr;</h3>
            <p className="mt-4 text-xl">
              Learn about Bitcoin and self-sovereign identity.
            </p>
          </a>
        </div>
      </main>
    </div>
  );
}
