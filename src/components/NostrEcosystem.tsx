import React from "react";
import {
  ArrowLeft,
  ExternalLink,
  Smartphone,
  Globe,
  Image,
  FileText,
  Radio,
  Music,
  Newspaper,
  Users,
  Zap,
  Key,
  Copy,
  CheckCircle,
  Download,
  Camera,
  Mic,
  BookOpen,
  MessageCircle,
  Video,
  Headphones,
} from "lucide-react";

interface NostrEcosystemProps {
  onBack: () => void;
  userIdentity?: string;
}

interface NostrApp {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: React.ReactNode;
  category: "mobile" | "web" | "media" | "publishing" | "social" | "tools";
  platform?: string;
}

const NostrEcosystem: React.FC<NostrEcosystemProps> = ({
  onBack,
  userIdentity = "yourname@satnam.pub",
}) => {
  const [copiedIdentity, setCopiedIdentity] = React.useState(false);

  const copyIdentity = () => {
    navigator.clipboard.writeText(userIdentity);
    setCopiedIdentity(true);
    setTimeout(() => setCopiedIdentity(false), 2000);
  };

  const nostrApps: NostrApp[] = [
    {
      id: "amethyst",
      name: "Amethyst",
      description: "The most popular Nostr client for Android",
      url: "https://amethyst.social",
      icon: <Smartphone className="h-6 w-6" />,
      category: "mobile",
      platform: "Android",
    },
    {
      id: "damus",
      name: "Damus",
      description: "The go-to Nostr client for iPhone/iPad",
      url: "https://damus.io",
      icon: <Smartphone className="h-6 w-6" />,
      category: "mobile",
      platform: "iOS",
    },
    {
      id: "iris",
      name: "Iris.to",
      description: "Fast, privacy-focused Nostr web client",
      url: "https://iris.to",
      icon: <Globe className="h-6 w-6" />,
      category: "web",
    },
    {
      id: "coracle",
      name: "Coracle",
      description: "Clean, feature-rich web interface",
      url: "https://coracle.social",
      icon: <Globe className="h-6 w-6" />,
      category: "web",
    },
    {
      id: "primal",
      name: "Primal.net",
      description: "Social network with advanced features",
      url: "https://primal.net",
      icon: <Users className="h-6 w-6" />,
      category: "social",
    },
    {
      id: "snort",
      name: "Snort.social",
      description: "Feature-rich web client for power users",
      url: "https://snort.social",
      icon: <MessageCircle className="h-6 w-6" />,
      category: "social",
    },
    {
      id: "nostr-build",
      name: "nostr.build",
      description: "Upload and share images and files on Nostr",
      url: "https://nostr.build",
      icon: <Image className="h-6 w-6" />,
      category: "media",
    },
    {
      id: "yakihonne",
      name: "Yakihonne",
      description: "Decentralized Nostr-powered blogging",
      url: "https://yakihonne.com",
      icon: <FileText className="h-6 w-6" />,
      category: "publishing",
    },
    {
      id: "zap-stream",
      name: "Zap.stream",
      description: "Livestreaming with Lightning tips",
      url: "https://zap.stream",
      icon: <Video className="h-6 w-6" />,
      category: "media",
    },
    {
      id: "wavlake",
      name: "Wavlake",
      description: "Music platform for artists and fans, Bitcoin-native",
      url: "https://wavlake.com",
      icon: <Music className="h-6 w-6" />,
      category: "media",
    },
    {
      id: "tunestr",
      name: "Tunestr",
      description: "Share and discover music on Nostr",
      url: "https://tunestr.io",
      icon: <Headphones className="h-6 w-6" />,
      category: "media",
    },
    {
      id: "highlighter",
      name: "Highlighter",
      description: "Publish and annotate articles and research",
      url: "https://highlighter.com",
      icon: <BookOpen className="h-6 w-6" />,
      category: "publishing",
    },
    {
      id: "habla",
      name: "Habla.news",
      description: "Nostr-powered news aggregator",
      url: "https://habla.news",
      icon: <Newspaper className="h-6 w-6" />,
      category: "publishing",
    },
  ];

  const categoryColors = {
    mobile: "from-blue-400 to-blue-600",
    web: "from-green-400 to-green-600",
    media: "from-purple-400 to-purple-600",
    publishing: "from-orange-400 to-orange-600",
    social: "from-pink-400 to-pink-600",
    tools: "from-yellow-400 to-yellow-600",
  };

  const categoryIcons = {
    mobile: <Smartphone className="h-5 w-5" />,
    web: <Globe className="h-5 w-5" />,
    media: <Camera className="h-5 w-5" />,
    publishing: <FileText className="h-5 w-5" />,
    social: <Users className="h-5 w-5" />,
    tools: <Key className="h-5 w-5" />,
  };

  const categories = [
    {
      id: "mobile",
      name: "Mobile Apps",
      description: "Native mobile experiences",
    },
    { id: "web", name: "Web Clients", description: "Browser-based interfaces" },
    {
      id: "social",
      name: "Social Networks",
      description: "Connect and communicate",
    },
    {
      id: "media",
      name: "Media & Streaming",
      description: "Share and discover content",
    },
    {
      id: "publishing",
      name: "Publishing",
      description: "Write and share articles",
    },
    { id: "tools", name: "Tools", description: "Essential utilities" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-purple-900 rounded-2xl p-6 mb-8 border border-yellow-400/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
              >
                <ArrowLeft className="h-5 w-5 text-white" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-white">
                  Next Steps: Use Your New Decentralized Identity
                </h1>
                <p className="text-purple-200">
                  Explore the Nostr ecosystem with your sovereign identity
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <img
                src="/SatNam.Pub logo.png"
                alt="SatNam.Pub"
                className="h-10 w-10 rounded-full"
              />
            </div>
          </div>
        </div>

        {/* Introduction */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 mb-8 border border-white/20">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <img
                src="/SatNam.Pub logo.png"
                alt="SatNam.Pub"
                className="h-12 w-12 rounded-full"
              />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Welcome to the Nostr-verse!
            </h2>
            <p className="text-purple-100 text-lg max-w-4xl mx-auto leading-relaxed">
              Now that you've forged your sovereign Nostr identity, put it to
              use! Your 'True Name' will be carried with you wherever you go in
              the Nostr-verse. Here are the best tools and apps to connect,
              create, and explore the Nostr ecosystem. Then return to the
              Citadel Academy once you have the lay of the land, to learn more
              and cultivate your family's cognitive capital.
            </p>
          </div>

          {/* Identity Display */}
          <div className="bg-white/10 rounded-2xl p-6 mb-8">
            <h3 className="text-white font-bold text-lg mb-4 text-center">
              Your Sovereign Identity
            </h3>
            <div className="flex items-center justify-center space-x-4">
              <div className="bg-white/10 rounded-lg p-4 flex-1 max-w-md">
                <p className="text-purple-200 text-sm mb-2">
                  Your NIP-05 Identity:
                </p>
                <p className="text-yellow-400 font-mono text-lg">
                  {userIdentity}
                </p>
              </div>
              <button
                onClick={copyIdentity}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2"
              >
                {copiedIdentity ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <Copy className="h-5 w-5" />
                )}
                <span>{copiedIdentity ? "Copied!" : "Copy"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Essential Tool - nos2x Extension */}
        <div className="bg-gradient-to-r from-yellow-400/20 to-orange-500/20 rounded-2xl p-8 mb-8 border border-yellow-400/50">
          <div className="flex items-start space-x-6">
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Key className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-yellow-400 font-bold text-xl mb-3">
                Essential: Browser Key Management
              </h3>
              <h4 className="text-white font-bold text-lg mb-2">
                nos2x (Browser Extension)
              </h4>
              <p className="text-yellow-100 mb-4">
                Securely manage your Nostr private key (nsec) in your browser.
                Lets you sign events and log in to Nostr web apps without
                exposing your private key, supporting NIP-07 and recommended by
                the Nostr creator.
              </p>
              <a
                href="https://chrome.google.com/webstore/detail/nos2x/npjnlnbmhklpajfaoolpmpicclnpoiah"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 inline-flex items-center space-x-2"
              >
                <Download className="h-5 w-5" />
                <span>Install nos2x Extension</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Apps Grid by Category */}
        <div className="space-y-8">
          {categories.map((category) => {
            const categoryApps = nostrApps.filter(
              (app) => app.category === category.id,
            );
            if (categoryApps.length === 0) return null;

            return (
              <div
                key={category.id}
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20"
              >
                <div className="flex items-center space-x-3 mb-6">
                  <div
                    className={`w-12 h-12 bg-gradient-to-br ${categoryColors[category.id as keyof typeof categoryColors]} rounded-full flex items-center justify-center text-white`}
                  >
                    {categoryIcons[category.id as keyof typeof categoryIcons]}
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xl">
                      {category.name}
                    </h3>
                    <p className="text-purple-200">{category.description}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryApps.map((app) => (
                    <div
                      key={app.id}
                      className="bg-white/10 rounded-xl p-6 hover:bg-white/15 transition-all duration-300 border border-white/20"
                    >
                      <div className="flex items-start space-x-4 mb-4">
                        <div
                          className={`w-12 h-12 bg-gradient-to-br ${categoryColors[app.category]} rounded-full flex items-center justify-center text-white flex-shrink-0`}
                        >
                          {app.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="text-white font-bold text-lg">
                              {app.name}
                            </h4>
                            {app.platform && (
                              <span className="bg-white/20 text-purple-200 text-xs px-2 py-1 rounded-full">
                                {app.platform}
                              </span>
                            )}
                          </div>
                          <p className="text-purple-200 text-sm">
                            {app.description}
                          </p>
                        </div>
                      </div>

                      <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                      >
                        <span>Open {app.name}</span>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Call to Action */}
        <div className="bg-gradient-to-r from-purple-900/80 to-blue-900/80 backdrop-blur-sm rounded-2xl p-8 mt-8 border border-yellow-400/30">
          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Zap className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-purple-100 text-lg mb-6 max-w-3xl mx-auto">
              Already have a favorite Nostr client? Just add your new{" "}
              <span className="font-mono text-yellow-400">{userIdentity}</span>{" "}
              reusable human-readable ID to your profile (into the NIP-05
              settings for your profile). Set yourself up to start receiving
              'Zapped\' LN bitcoin payments into your new wallet and begin
              engaging financially and socially with your peers!
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="https://citadel.academy"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 shadow-lg"
              >
                <img
                  src="/Citadel Academy Logo.png"
                  alt="Citadel Academy"
                  className="h-5 w-5"
                />
                <span>Return to Citadel Academy</span>
                <ExternalLink className="h-4 w-4" />
              </a>

              <button
                onClick={onBack}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 flex items-center space-x-2"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-purple-200">
            <span className="flex items-center space-x-2">
              <img
                src="/SatNam.Pub logo.png"
                alt="SatNam.Pub"
                className="h-4 w-4 rounded-full"
              />
              <span>Your sovereign identity awaits</span>
            </span>
            <span className="flex items-center space-x-2">
              <Globe className="h-4 w-4" />
              <span>Decentralized and unstoppable</span>
            </span>
            <span className="flex items-center space-x-2">
              <Zap className="h-4 w-4" />
              <span>Bitcoin-native ecosystem</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NostrEcosystem;
