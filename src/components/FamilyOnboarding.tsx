import {
  ArrowLeft,
  ArrowRight,
  Award,
  Bitcoin,
  BookOpen,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Gift,
  Heart,
  Key,
  Lightbulb,
  Lock,
  Play,
  QrCode,
  Sparkles,
  Star,
  Target,
  Zap
} from "lucide-react";
import React, { useState } from "react";

interface OnboardingProps {
  familyName: string;
  onComplete: () => void;
  onBack?: () => void;
}

interface LearningModule {
  id: string;
  title: string;
  duration: number;
  description: string;
  completed: boolean;
  icon: React.ReactNode;
}

const FamilyOnboarding: React.FC<OnboardingProps> = ({
  familyName,
  onComplete,
  onBack,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [showTraditional, setShowTraditional] = useState(true);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [isCreatingIdentity, setIsCreatingIdentity] = useState(false);
  const [identityProgress, setIdentityProgress] = useState(0);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [celebrationActive, setCelebrationActive] = useState(false);

  const learningModules: LearningModule[] = [
    {
      id: "bitcoin-basics",
      title: "What is Bitcoin?",
      duration: 30,
      description:
        "Understanding digital money and why it matters for your family",
      completed: false,
      icon: (
        <img src="/LN-Bitcoin-icon.png" alt="Bitcoin" className="h-6 w-6" />
      ),
    },
    {
      id: "lightning-network",
      title: "Lightning Network Basics",
      duration: 20,
      description: "Instant Bitcoin payments for everyday use",
      completed: false,
      icon: <Zap className="h-6 w-6" />,
    },
    {
      id: "family-treasury",
      title: "Family Treasury Management",
      duration: 25,
      description: "Managing your family's Bitcoin wealth together",
      completed: false,
      icon: (
        <img
          src="/Rebuilding_Camelot_logo__transparency_v3.png"
          alt="Rebuilding Camelot"
          className="h-6 w-6"
        />
      ),
    },
    {
      id: "security-practices",
      title: "Security Best Practices",
      duration: 35,
      description: "Keeping your family's Bitcoin safe and secure",
      completed: false,
      icon: (
        <img
          src="/Citadel-Academy-Logo.png"
          alt="Citadel Academy"
          className="h-6 w-6"
        />
      ),
    },
  ];

  // Simulate identity creation
  const createIdentity = async () => {
    setIsCreatingIdentity(true);
    setIdentityProgress(0);

    for (let i = 0; i <= 100; i += 2) {
      setIdentityProgress(i);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    setIsCreatingIdentity(false);
  };

  // Simulate payment reception
  const simulatePayment = () => {
    setTimeout(() => {
      setPaymentReceived(true);
      setCelebrationActive(true);
      setTimeout(() => setCelebrationActive(false), 3000);
    }, 2000);
  };

  const nextStep = () => {
    if (currentStep === 2) {
      createIdentity();
    }
    if (currentStep === 3) {
      simulatePayment();
    }
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else if (onBack) {
      onBack();
    }
  };

  const toggleModule = (moduleId: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId],
    );
  };

  const steps = [
    "Welcome",
    "Understanding Identity",
    "Learning Path",
    "Create Identity",
    "First Transaction",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Progress Header */}
        <div className="text-center mb-8 pt-8">
          <div className="flex justify-center items-center mb-6">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${index <= currentStep
                    ? "bg-yellow-400 text-purple-900"
                    : "bg-white/20 text-white"
                    }`}
                >
                  {index < currentStep ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-1 w-16 mx-4 transition-all duration-300 ${index < currentStep ? "bg-yellow-400" : "bg-white/20"
                      }`}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-purple-100">
            Step {currentStep + 1} of {steps.length}: {steps[currentStep]}
          </p>
        </div>

        {/* Step Content */}
        <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20 min-h-[600px] flex flex-col justify-between">
          {/* Welcome Screen */}
          {currentStep === 0 && (
            <div className="text-center space-y-8">
              <div className="relative">
                <div className="w-32 h-32 mx-auto mb-6 flex items-center justify-center transform rotate-3 shadow-2xl">
                  <img
                    src="/SatNam-logo.png"
                    alt="SatNam.Pub"
                    className="h-32 w-32 rounded-2xl"
                  />
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                    <Bitcoin className="h-4 w-4 text-white" />
                  </div>
                </div>
              </div>

              <div>
                <h1 className="text-5xl font-bold text-white mb-4">
                  Welcome to the{" "}
                  <span className="text-yellow-400">{familyName}</span> Citadel
                </h1>
                <p className="text-2xl text-purple-100 mb-8 max-w-4xl mx-auto leading-relaxed">
                  Your family's journey to identity, credential, and financial
                  sovereignty starts here
                </p>
              </div>

              <div className="bg-white/10 rounded-2xl p-8 max-w-3xl mx-auto">
                <div className="grid md:grid-cols-3 gap-6 text-center">
                  <div className="space-y-3">
                    <img
                      src="/SatNam-logo.png"
                      alt="SatNam.Pub"
                      className="h-16 w-16 mx-auto rounded-full"
                    />
                    <h3 className="text-white font-bold">Digital Identity</h3>
                    <p className="text-purple-200 text-sm">
                      Own your online presence
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto">
                      <Bitcoin className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-white font-bold">Financial Freedom</h3>
                    <p className="text-purple-200 text-sm">
                      Control your family's wealth
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center mx-auto">
                      <Heart className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-white font-bold">Family Unity</h3>
                    <p className="text-purple-200 text-sm">
                      Build generational wealth
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-purple-900/50 rounded-2xl p-6 max-w-2xl mx-auto">
                <p className="text-purple-100 text-lg">
                  <span className="font-bold text-yellow-400">
                    No technical experience required.{" "}
                  </span>
                  We'll guide you through every step with care and patience.
                </p>
              </div>
            </div>
          )}

          {/* Understanding Identity */}
          {currentStep === 1 && (
            <div className="space-y-8">
              <div className="text-center mb-8">
                <img
                  src="/Rebuilding_Camelot_logo__transparency_v3.png"
                  alt="Rebuilding Camelot"
                  className="h-16 w-16 mx-auto mb-4"
                />
                <h2 className="text-4xl font-bold text-white mb-4">
                  Understanding Your New Identity
                </h2>
                <p className="text-xl text-purple-100">
                  Let's explore the difference between traditional and sovereign
                  identity
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Traditional Identity */}
                <div
                  className={`bg-white/10 rounded-2xl p-6 border-2 transition-all duration-500 cursor-pointer ${showTraditional
                    ? "border-red-400 bg-red-500/10"
                    : "border-white/20"
                    }`}
                  onClick={() => setShowTraditional(true)}
                >
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Lock className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">
                      The Old Way
                    </h3>
                    <p className="text-red-200">Traditional Digital Identity</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center space-x-3 text-red-200">
                      <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                      <span>Banks control your money</span>
                    </div>
                    <div className="flex items-center space-x-3 text-red-200">
                      <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                      <span>Companies harvest your data</span>
                    </div>
                    <div className="flex items-center space-x-3 text-red-200">
                      <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                      <span>Passwords can be stolen</span>
                    </div>
                    <div className="flex items-center space-x-3 text-red-200">
                      <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                      <span>Accounts can be frozen</span>
                    </div>
                    <div className="flex items-center space-x-3 text-red-200">
                      <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                      <span>No real ownership</span>
                    </div>
                  </div>
                </div>

                {/* Sovereign Identity */}
                <div
                  className={`bg-white/10 rounded-2xl p-6 border-2 transition-all duration-500 cursor-pointer ${!showTraditional
                    ? "border-green-400 bg-green-500/10"
                    : "border-white/20"
                    }`}
                  onClick={() => setShowTraditional(false)}
                >
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Key className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">
                      The New Way
                    </h3>
                    <p className="text-green-200">Sovereign Digital Identity</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center space-x-3 text-green-200">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>You control your keys</span>
                    </div>
                    <div className="flex items-center space-x-3 text-green-200">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Complete privacy protection</span>
                    </div>
                    <div className="flex items-center space-x-3 text-green-200">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Cryptographic security</span>
                    </div>
                    <div className="flex items-center space-x-3 text-green-200">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Censorship resistant</span>
                    </div>
                    <div className="flex items-center space-x-3 text-green-200">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>True ownership</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-yellow-400/20 to-orange-500/20 rounded-2xl p-6 border border-yellow-400/50">
                <div className="flex items-start space-x-4">
                  <Lightbulb className="h-8 w-8 text-yellow-400 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-yellow-400 font-bold text-lg mb-2">
                      This is Revolutionary
                    </h3>
                    <p className="text-yellow-100">
                      For the first time in history, your family can have
                      complete control over your digital identity and wealth. No
                      intermediaries, no permissions needed, no one can take it
                      away.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Learning Path */}
          {currentStep === 2 && (
            <div className="space-y-8">
              <div className="text-center mb-8">
                <BookOpen className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-4xl font-bold text-white mb-4">
                  Your Bitcoin Education Path
                </h2>
                <p className="text-xl text-purple-100">
                  Choose the modules that interest you most (you can always come
                  back later)
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {learningModules.map((module) => (
                  <div
                    key={module.id}
                    className={`bg-white/10 rounded-2xl p-6 border-2 cursor-pointer transition-all duration-300 hover:bg-white/15 ${selectedModules.includes(module.id)
                      ? "border-yellow-400 bg-yellow-400/10"
                      : "border-white/20"
                      }`}
                    onClick={() => toggleModule(module.id)}
                  >
                    <div className="flex items-start space-x-4">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${selectedModules.includes(module.id)
                          ? "bg-yellow-400 text-purple-900"
                          : "bg-white/20 text-white"
                          }`}
                      >
                        {module.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-white font-bold text-lg">
                            {module.title}
                          </h3>
                          <div className="flex items-center space-x-2 text-purple-200">
                            <Clock className="h-4 w-4" />
                            <span className="text-sm">
                              {module.duration} min
                            </span>
                          </div>
                        </div>
                        <p className="text-purple-200">{module.description}</p>
                        {selectedModules.includes(module.id) && (
                          <div className="mt-3 flex items-center space-x-2 text-yellow-400">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm font-semibold">
                              Added to your path
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white/10 rounded-2xl p-6 text-center">
                <div className="flex items-center justify-center space-x-4 mb-4">
                  <Target className="h-6 w-6 text-yellow-400" />
                  <h3 className="text-white font-bold text-lg">
                    Recommended Learning Time
                  </h3>
                </div>
                <p className="text-purple-200 mb-4">
                  Selected modules:{" "}
                  {selectedModules.length > 0
                    ? `${learningModules.filter((m) => selectedModules.includes(m.id)).reduce((sum, m) => sum + m.duration, 0)} minutes`
                    : "None selected"}
                </p>
                <div className="flex justify-center space-x-4">
                  <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2">
                    <Play className="h-4 w-4" />
                    <span>Start Learning</span>
                  </button>
                  <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-6 rounded-lg transition-all duration-300">
                    Skip for Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create Identity */}
          {currentStep === 3 && (
            <div className="space-y-8">
              <div className="text-center mb-8">
                <Key className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-4xl font-bold text-white mb-4">
                  Setting Up Your Identity
                </h2>
                <p className="text-xl text-purple-100">
                  We'll create your sovereign digital identity step by step
                </p>
              </div>

              {!isCreatingIdentity && identityProgress === 0 ? (
                <div className="space-y-6">
                  <div className="bg-white/10 rounded-2xl p-8 text-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Sparkles className="h-12 w-12 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">
                      Ready to Create Your Identity?
                    </h3>
                    <p className="text-purple-200 mb-6">
                      We'll generate your cryptographic keys and create your
                      unique identity on the Bitcoin network. This process is
                      completely secure and private.
                    </p>
                    <div className="grid md:grid-cols-3 gap-4 text-sm">
                      <div className="bg-white/10 rounded-lg p-4">
                        <img
                          src="/Citadel-Academy-Logo.png"
                          alt="Citadel Academy"
                          className="h-6 w-6 mx-auto mb-2"
                        />
                        <p className="text-white font-semibold">Secure</p>
                        <p className="text-purple-200">
                          Military-grade encryption
                        </p>
                      </div>
                      <div className="bg-white/10 rounded-lg p-4">
                        <Eye className="h-6 w-6 text-blue-400 mx-auto mb-2" />
                        <p className="text-white font-semibold">Private</p>
                        <p className="text-purple-200">
                          No personal data required
                        </p>
                      </div>
                      <div className="bg-white/10 rounded-lg p-4">
                        <img
                          src="/Rebuilding_Camelot_logo__transparency_v3.png"
                          alt="Rebuilding Camelot"
                          className="h-6 w-6 mx-auto mb-2"
                        />
                        <p className="text-white font-semibold">Family-Ready</p>
                        <p className="text-purple-200">
                          Connect with loved ones
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-900/30 border border-blue-500/50 rounded-2xl p-6">
                    <div className="flex items-start space-x-4">
                      <Lightbulb className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="text-blue-400 font-bold mb-2">
                          What happens next?
                        </h3>
                        <ul className="text-blue-200 space-y-1 text-sm">
                          <li>• Generate your unique cryptographic keys</li>
                          <li>• Create your @satnam.pub identity</li>
                          <li>
                            • Set up your Lightning address for Bitcoin payments
                          </li>
                          <li>
                            • Connect you to the {familyName} family network
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ) : isCreatingIdentity ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-32 h-32 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                    <h3 className="text-2xl font-bold text-white mb-2">
                      Creating Your Identity...
                    </h3>
                    <p className="text-purple-200">
                      This may take a moment while we ensure maximum security
                    </p>
                  </div>

                  <div className="bg-white/10 rounded-2xl p-6">
                    <div className="flex justify-between text-sm text-purple-100 mb-2">
                      <span>Progress</span>
                      <span>{identityProgress}%</span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-4">
                      <div
                        className="bg-gradient-to-r from-yellow-400 to-orange-500 h-4 rounded-full transition-all duration-300"
                        style={{ width: `${identityProgress}%` }}
                      />
                    </div>
                    <div className="mt-4 text-center">
                      <p className="text-white font-semibold">
                        {identityProgress < 30
                          ? "Generating entropy..."
                          : identityProgress < 60
                            ? "Creating keypair..."
                            : identityProgress < 90
                              ? "Securing identity..."
                              : "Finalizing setup..."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle className="h-12 w-12 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">
                      Identity Created Successfully!
                    </h3>
                    <p className="text-green-400 font-semibold">
                      Welcome to digital sovereignty
                    </p>
                  </div>

                  <div className="bg-white/10 rounded-2xl p-6">
                    <h3 className="text-white font-bold mb-4 text-center">
                      Your New Identity
                    </h3>
                    <div className="bg-white/10 rounded-lg p-4 text-center">
                      <p className="text-purple-200 mb-2">
                        Your sovereign identity:
                      </p>
                      <p className="text-yellow-400 font-mono text-lg">
                        member@satnam.pub
                      </p>
                    </div>
                  </div>

                  <div className="bg-green-900/30 border border-green-500/50 rounded-2xl p-6">
                    <div className="flex items-start space-x-4">
                      <Award className="h-6 w-6 text-green-400 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="text-green-400 font-bold mb-2">
                          Congratulations!
                        </h3>
                        <p className="text-green-200">
                          You now have a sovereign digital identity that no one
                          can take away from you. You're officially part of the
                          Bitcoin network and the {familyName} family citadel.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* First Transaction */}
          {currentStep === 4 && (
            <div className="space-y-8">
              <div className="text-center mb-8">
                <div className="relative">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                    <img
                      src="/LN-Bitcoin-icon.png"
                      alt="Lightning Bitcoin"
                      className="h-12 w-12"
                    />
                  </div>
                  {celebrationActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="h-8 w-8 text-yellow-400 animate-ping" />
                    </div>
                  )}
                </div>
                <h2 className="text-4xl font-bold text-white mb-4">
                  Your First Bitcoin Transaction
                </h2>
                <p className="text-xl text-purple-100">
                  Let's test your new Lightning address with a small payment
                </p>
              </div>

              {!paymentReceived ? (
                <div className="space-y-6">
                  <div className="bg-white/10 rounded-2xl p-8 text-center">
                    <h3 className="text-2xl font-bold text-white mb-4">
                      Your Lightning Address
                    </h3>
                    <div className="bg-white/10 rounded-lg p-6 mb-6">
                      <p className="text-purple-200 mb-2">
                        Ready to receive Bitcoin at:
                      </p>
                      <p className="text-yellow-400 font-mono text-xl">
                        member@satnam.pub
                      </p>
                    </div>

                    <div className="bg-white/10 rounded-lg p-8 mb-6">
                      <QrCode className="h-32 w-32 text-white mx-auto mb-4 opacity-50" />
                      <p className="text-purple-200">
                        QR Code for your Lightning address
                      </p>
                    </div>

                    <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
                      <div className="flex items-center justify-center space-x-3 mb-2">
                        <Gift className="h-5 w-5 text-blue-400" />
                        <span className="text-blue-400 font-semibold">
                          Welcome Gift Incoming!
                        </span>
                      </div>
                      <p className="text-blue-200 text-sm">
                        The {familyName} family treasury is sending you 1,000
                        sats as a welcome gift
                      </p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-white/10 rounded-lg p-6">
                      <h4 className="text-white font-bold mb-3">
                        What are sats?
                      </h4>
                      <p className="text-purple-200 text-sm">
                        Satoshis (sats) are the smallest unit of Bitcoin. 100
                        million sats = 1 Bitcoin. Think of sats like cents to a
                        dollar.
                      </p>
                    </div>
                    <div className="bg-white/10 rounded-lg p-6">
                      <h4 className="text-white font-bold mb-3">
                        Lightning Network
                      </h4>
                      <p className="text-purple-200 text-sm">
                        Lightning enables instant, low-cost Bitcoin payments.
                        Perfect for everyday transactions and family transfers.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div
                    className={`text-center transition-all duration-1000 ${celebrationActive ? "animate-bounce" : ""}`}
                  >
                    <div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                      <CheckCircle className="h-16 w-16 text-white" />
                      {celebrationActive && (
                        <>
                          <Star className="absolute -top-4 -left-4 h-8 w-8 text-yellow-400 animate-spin" />
                          <Star className="absolute -top-4 -right-4 h-6 w-6 text-yellow-400 animate-ping" />
                          <Star className="absolute -bottom-4 -left-4 h-6 w-6 text-yellow-400 animate-pulse" />
                          <Star className="absolute -bottom-4 -right-4 h-8 w-8 text-yellow-400 animate-bounce" />
                        </>
                      )}
                    </div>
                    <h3 className="text-3xl font-bold text-white mb-2">
                      Payment Received!
                    </h3>
                    <p className="text-green-400 font-semibold text-xl">
                      +1,000 sats
                    </p>
                  </div>

                  <div className="bg-green-900/30 border border-green-500/50 rounded-2xl p-8 text-center">
                    <h3 className="text-green-400 font-bold text-xl mb-4">
                      🎉 Congratulations! 🎉
                    </h3>
                    <p className="text-green-200 mb-6">
                      You've successfully received your first Bitcoin payment!
                      Your Lightning address is working perfectly, and you're
                      now part of the global Bitcoin network.
                    </p>
                    <div className="bg-white/10 rounded-lg p-4">
                      <p className="text-white font-semibold">
                        Your Balance: 1,000 sats
                      </p>
                      <p className="text-purple-200 text-sm">
                        Ready for your next transaction
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/10 rounded-2xl p-6">
                    <h3 className="text-white font-bold mb-4 text-center">
                      What's Next?
                    </h3>
                    <div className="grid md:grid-cols-3 gap-4 text-center">
                      <div className="space-y-2">
                        <img
                          src="/Rebuilding_Camelot_logo__transparency_v3.png"
                          alt="Rebuilding Camelot"
                          className="h-8 w-8 mx-auto"
                        />
                        <p className="text-white font-semibold">
                          Join Family Financials
                        </p>
                        <p className="text-purple-200 text-sm">
                          Manage your family's Bitcoin together
                        </p>
                      </div>
                      <div className="space-y-2">
                        <BookOpen className="h-8 w-8 text-blue-400 mx-auto" />
                        <p className="text-white font-semibold">
                          Continue Learning
                        </p>
                        <p className="text-purple-200 text-sm">
                          Deepen your Bitcoin knowledge
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Zap className="h-8 w-8 text-orange-400 mx-auto" />
                        <p className="text-white font-semibold">
                          Make Payments
                        </p>
                        <p className="text-purple-200 text-sm">
                          Send Bitcoin to family and friends
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between items-center mt-8">
            <button
              onClick={prevStep}
              className="flex items-center space-x-2 px-6 py-3 rounded-lg font-bold transition-all duration-300 bg-purple-700 hover:bg-purple-800 text-white"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back</span>
            </button>

            {/* Help Button */}
            <div className="flex items-center space-x-4">
              <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2">
                <Heart className="h-5 w-5" />
                <span>Need Help?</span>
              </button>
            </div>

            <button
              onClick={nextStep}
              disabled={currentStep === 3 && isCreatingIdentity}
              className={`flex items-center space-x-2 px-8 py-3 rounded-lg font-bold transition-all duration-300 ${currentStep === 3 && isCreatingIdentity
                ? "bg-white/10 text-purple-300 cursor-not-allowed"
                : "bg-purple-700 hover:bg-purple-800 text-white transform hover:scale-105"
                }`}
            >
              <span>
                {currentStep === 0
                  ? "Get Started"
                  : currentStep === 1
                    ? "This is Revolutionary"
                    : currentStep === 2
                      ? "Continue Setup"
                      : currentStep === 3
                        ? isCreatingIdentity
                          ? "Creating..."
                          : "Test Payment"
                        : "Enter Dashboard"}
              </span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Security Footer */}
        <div className="text-center mt-8">
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-purple-200">
            <span className="flex items-center space-x-2">
              <img
                src="/Citadel-Academy-Logo.png"
                alt="Citadel Academy"
                className="h-4 w-4"
              />
              <span>Your keys, your identity</span>
            </span>
            <span className="flex items-center space-x-2">
              <EyeOff className="h-4 w-4" />
              <span>No email required</span>
            </span>
            <span className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4" />
              <span>Sovereign from day one</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FamilyOnboarding;
