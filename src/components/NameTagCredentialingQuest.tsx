import { ExternalLink } from 'lucide-react';
import React from 'react';

interface Props {
  onBack: () => void;
}

/**
 * NameTagCredentialingQuest
 * Beginner‑friendly internal guide for the "Name Tag ID Credentialing Quest".
 * Presents a simple, non‑technical journey that helps users set up their NFC Name Tag
 * and establish a "Source of Truth Architecture" with clear "Stamping" language.
 */
export default function NameTagCredentialingQuest({ onBack }: Props) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-6">
        <button
          onClick={onBack}
          className="bg-purple-700 hover:bg-purple-800 text-white font-semibold py-2 px-4 rounded-lg border-2 border-black"
        >
          Back to Home
        </button>
      </div>

      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 shadow-lg">
        <h1 className="text-3xl font-bold text-white mb-4">Name Tag ID Credentialing Quest</h1>
        <p className="text-purple-100 mb-8">
          Welcome! This guided journey helps you set up your physical Name Tag so you can tap to authenticate
          and prove your identity—simply and privately. No jargon. No stress. Just a few clear steps.
        </p>

        <div className="space-y-8">
          {/* Step 1 */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-2">Step 1 — LNbits Account Setup</h2>
            <p className="text-purple-100">
              LNbits is your wallet manager. Through the Satnam integration, you can create or connect a wallet
              that lets your Name Tag handle simple payments and confirmations when you tap.
            </p>
            <ul className="list-disc list-inside text-purple-100 mt-2 space-y-1">
              <li>Open the Satnam app and visit the LNbits section to create your wallet.</li>
              <li>That’s it—no extra apps needed yet. We’ll use this wallet in a later step.</li>
            </ul>
          </section>

          {/* Step 2 */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-2">Step 2 — App Installation</h2>
            <p className="text-purple-100">Install the Boltcard programming app on your phone.</p>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <a
                href="https://apps.apple.com/us/app/boltcard-nfc-programmer/id6450968873"
                target="_blank" rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center space-x-2"
                title="Install Boltcard Programmer for iOS"
              >
                <span>Install on iOS (Boltcard Programmer)</span>
                <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.lightningnfcapp&pcampaignid=web_share"
                target="_blank" rel="noopener noreferrer"
                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center space-x-2"
                title="Install Boltcard Programming App for Android"
              >
                <span>Install on Android (Boltcard Programming)</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <p className="text-purple-100 mt-3">
              Both versions help you prepare (program) your physical Name Tag.
            </p>
          </section>

          {/* Step 3 */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-2">Step 3 — Data Input</h2>
            <p className="text-purple-100">
              Open the Boltcard app and follow the on‑screen prompts. You’ll enter a few simple pieces of
              information that connect your Name Tag to your LNbits wallet.
            </p>
            <ul className="list-disc list-inside text-purple-100 mt-2 space-y-1">
              <li>Pick a label for your card (for example: “My Name Tag”).</li>
              <li>Confirm or paste the details provided by the Satnam LNbits integration when needed.</li>
              <li>Keep it simple—no secrets leave your phone.</li>
            </ul>
          </section>

          {/* Step 4 */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-2">Step 4 — Name Tag Stamping</h2>
            <p className="text-purple-100">
              “Stamping” is the moment your credentials are registered onto your physical Name Tag.
              After the app writes the data, return to Satnam and tap your Name Tag to confirm ownership.
            </p>
            <ul className="list-disc list-inside text-purple-100 mt-2 space-y-1">
              <li>Tap your Name Tag on your phone when prompted.</li>
              <li>You’ll see a simple success message once Stamping is complete.</li>
            </ul>
          </section>

          {/* Source of Truth Architecture */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-2">Your Source of Truth Architecture</h2>
            <p className="text-purple-100">
              Your Source of Truth Architecture is your personal setup that keeps identity facts consistent and
              verifiable. Your Name Tag becomes a trusted tap‑to‑verify companion—no central authority required.
            </p>
          </section>

          {/* Extra resources */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-2">More Help & Community</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <a href="https://boltcard.org/" target="_blank" rel="noopener noreferrer"
                 className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg p-3 text-white flex items-center justify-between">
                <span>boltcard.org</span>
                <ExternalLink className="h-4 w-4" />
              </a>
              <a href="https://ereignishorizont.xyz/en/boltcard_en/" target="_blank" rel="noopener noreferrer"
                 className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg p-3 text-white flex items-center justify-between">
                <span>External Boltcard Setup Guide</span>
                <ExternalLink className="h-4 w-4" />
              </a>
              <a href="https://t.me/bolt_card" target="_blank" rel="noopener noreferrer"
                 className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg p-3 text-white flex items-center justify-between">
                <span>Telegram: @bolt_card</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </section>

          {/* Closing */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-2">You’re in Control</h2>
            <p className="text-purple-100">
              This is your journey to digital sovereignty. Take it step by step—you’ve got this. When you’re ready,
              tap your Name Tag on Satnam to sign in and enjoy a smooth, private experience.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

