import {
  ArrowLeft,
  Award,
  Bitcoin,
  BookOpen,
  Crown,
  Download,
  ExternalLink,
  Flame,
  Home,
  Key,
  Library,
  MessageCircle,
  Network,
  Play,
  ShoppingCart,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserCheck,
  Users,
  Zap
} from "lucide-react";
import React, { useState } from "react";

interface Lesson {
  id: string;
  title: string;
  duration: number;
  completed: boolean;
  locked: boolean;
  description: string;
  prerequisites: string[];
  type: "video" | "interactive" | "quiz" | "practice";
}

interface LessonCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  progress: number;
  lessons: Lesson[];
  description: string;
}

interface FamilyMember {
  id: string;
  name: string;
  avatar: string;
  progress: number;
  streak: number;
  badges: number;
}

interface EducationPlatformProps {
  onBack: () => void;
}

const EducationPlatform: React.FC<EducationPlatformProps> = ({ onBack }) => {
  const [currentView, setCurrentView] = useState<
    "dashboard" | "lesson" | "category"
  >("dashboard");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [learningStreak] = useState(7);
  const [familyScore] = useState(73);

  const familyMembers: FamilyMember[] = [
    {
      id: "1",
      name: "David",
      avatar: "D",
      progress: 85,
      streak: 12,
      badges: 8,
    },
    { id: "2", name: "Sarah", avatar: "S", progress: 78, streak: 9, badges: 6 },
    { id: "3", name: "Emma", avatar: "E", progress: 45, streak: 3, badges: 3 },
    { id: "4", name: "Luke", avatar: "L", progress: 23, streak: 1, badges: 1 },
  ];

  const categories: LessonCategory[] = [
    {
      id: "basics",
      title: "Bitcoin Basics",
      icon: (
        <img src="/LN-Bitcoin-icon.png" alt="Bitcoin" className="h-8 w-8" />
      ),
      color: "from-orange-400 to-orange-600",
      progress: 90,
      description: "Foundation concepts of digital money",
      lessons: [
        {
          id: "what-is-bitcoin",
          title: "What is Bitcoin?",
          duration: 25,
          completed: true,
          locked: false,
          description: "Understanding the fundamentals of Bitcoin",
          prerequisites: [],
          type: "video",
        },
        {
          id: "why-bitcoin-matters",
          title: "Why Bitcoin Matters",
          duration: 30,
          completed: true,
          locked: false,
          description: "The importance of sound money",
          prerequisites: ["what-is-bitcoin"],
          type: "video",
        },
        {
          id: "bitcoin-vs-fiat",
          title: "Bitcoin vs Fiat Money",
          duration: 20,
          completed: false,
          locked: false,
          description: "Comparing Bitcoin to traditional currency",
          prerequisites: ["why-bitcoin-matters"],
          type: "interactive",
        },
      ],
    },
    {
      id: "lightning",
      title: "Lightning Network",
      icon: <Zap className="h-8 w-8" />,
      color: "from-yellow-400 to-yellow-600",
      progress: 65,
      description: "Layer 2 scaling for instant payments",
      lessons: [
        {
          id: "lightning-intro",
          title: "Lightning Network Introduction",
          duration: 35,
          completed: true,
          locked: false,
          description: "Understanding Bitcoin's payment layer",
          prerequisites: ["bitcoin-vs-fiat"],
          type: "video",
        },
        {
          id: "lightning-channels",
          title: "Payment Channels",
          duration: 40,
          completed: false,
          locked: false,
          description: "How Lightning channels work",
          prerequisites: ["lightning-intro"],
          type: "interactive",
        },
      ],
    },
    {
      id: "custody",
      title: "Self Custody",
      icon: <Key className="h-8 w-8" />,
      color: "from-blue-400 to-blue-600",
      progress: 45,
      description: "Key management and security",
      lessons: [
        {
          id: "private-keys",
          title: "Understanding Private Keys",
          duration: 30,
          completed: true,
          locked: false,
          description: "The foundation of Bitcoin ownership",
          prerequisites: ["lightning-intro"],
          type: "video",
        },
        {
          id: "seed-phrases",
          title: "Seed Phrases & Recovery",
          duration: 25,
          completed: false,
          locked: false,
          description: "Backing up your Bitcoin",
          prerequisites: ["private-keys"],
          type: "practice",
        },
      ],
    },
    {
      id: "treasury",
      title: "Family Treasury",
      icon: <Users className="h-8 w-8" />,
      color: "from-purple-400 to-purple-600",
      progress: 30,
      description: "Multi-sig and family coordination",
      lessons: [
        {
          id: "multisig-basics",
          title: "Multi-Signature Basics",
          duration: 45,
          completed: false,
          locked: true,
          description: "Shared control of family funds",
          prerequisites: ["seed-phrases"],
          type: "video",
        },
      ],
    },
    {
      id: "privacy",
      title: "Privacy & Sovereignty",
      icon: (
        <img
          src="/Citadel-Academy-Logo.png"
          alt="Citadel Academy"
          className="h-8 w-8"
        />
      ),
      color: "from-green-400 to-green-600",
      progress: 15,
      description: "Advanced privacy techniques",
      lessons: [
        {
          id: "privacy-basics",
          title: "Bitcoin Privacy Fundamentals",
          duration: 35,
          completed: false,
          locked: true,
          description: "Protecting your financial privacy",
          prerequisites: ["multisig-basics"],
          type: "video",
        },
      ],
    },
    {
      id: "citadels",
      title: "Building Citadels",
      icon: <Home className="h-8 w-8" />,
      color: "from-red-400 to-red-600",
      progress: 0,
      description: "Community and infrastructure",
      lessons: [
        {
          id: "citadel-concept",
          title: "The Citadel Concept",
          duration: 40,
          completed: false,
          locked: true,
          description: "Building sovereign communities",
          prerequisites: ["privacy-basics"],
          type: "video",
        },
      ],
    },
  ];

  const achievements = [
    {
      id: "first-lesson",
      title: "First Steps",
      description: "Complete your first lesson",
      icon: <Play className="h-5 w-5" />,
    },
    {
      id: "week-streak",
      title: "Dedicated Learner",
      description: "7-day learning streak",
      icon: <Flame className="h-5 w-5" />,
    },
    {
      id: "category-master",
      title: "Category Master",
      description: "Complete an entire category",
      icon: <Trophy className="h-5 w-5" />,
    },
    {
      id: "family-leader",
      title: "Family Leader",
      description: "Highest family progress",
      icon: <Crown className="h-5 w-5" />,
    },
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
                  Bitcoin Mastery Path
                </h1>
                <p className="text-purple-200">
                  Your family's journey to Bitcoin sovereignty
                </p>
              </div>
            </div>

            {/* Citadel Academy Integration */}
            <a
              href="https://citadel.academy"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 shadow-lg"
            >
              <img
                src="/Citadel-Academy-Logo.png"
                alt="Citadel Academy"
                className="h-5 w-5"
              />
              <span>Enter Citadel Academy</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {/* Learning Streak */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Flame className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">
              Learning Streak
            </h3>
            <p className="text-3xl font-bold text-orange-400">
              {learningStreak}
            </p>
            <p className="text-purple-200 text-sm">days</p>
          </div>

          {/* Family Score */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Family Score</h3>
            <p className="text-3xl font-bold text-purple-400">{familyScore}%</p>
            <p className="text-purple-200 text-sm">collective knowledge</p>
          </div>

          {/* Achievements */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Achievements</h3>
            <p className="text-3xl font-bold text-yellow-400">12</p>
            <p className="text-purple-200 text-sm">badges earned</p>
          </div>

          {/* Next Milestone */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Target className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Next Goal</h3>
            <p className="text-white font-semibold">Family Graduation</p>
            <p className="text-purple-200 text-sm">7% to go</p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Learning Path */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-6">Skill Tree</h2>

              <div className="grid md:grid-cols-2 gap-6">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="bg-white/10 rounded-xl p-6 hover:bg-white/15 transition-all duration-300 cursor-pointer border border-white/20"
                    onClick={() => {
                      setSelectedCategory(category.id);
                      setCurrentView("category");
                    }}
                  >
                    <div className="flex items-center space-x-4 mb-4">
                      <div
                        className={`w-12 h-12 bg-gradient-to-br ${category.color} rounded-full flex items-center justify-center text-white`}
                      >
                        {category.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-white font-bold text-lg">
                          {category.title}
                        </h3>
                        <p className="text-purple-200 text-sm">
                          {category.description}
                        </p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between text-sm text-purple-100 mb-2">
                        <span>Progress</span>
                        <span>{category.progress}%</span>
                      </div>
                      <div className="w-full bg-white/20 rounded-full h-2">
                        <div
                          className={`bg-gradient-to-r ${category.color} h-2 rounded-full transition-all duration-300`}
                          style={{ width: `${category.progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-purple-200 text-sm">
                        {category.lessons.length} lessons
                      </span>
                      <div className="flex items-center space-x-1">
                        {category.lessons.slice(0, 3).map((lesson, index) => (
                          <div
                            key={index}
                            className={`w-3 h-3 rounded-full ${lesson.completed
                                ? "bg-green-400"
                                : lesson.locked
                                  ? "bg-gray-500"
                                  : "bg-yellow-400"
                              }`}
                          />
                        ))}
                        {category.lessons.length > 3 && (
                          <span className="text-purple-200 text-xs">
                            +{category.lessons.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Citadel Academy Integration Panel */}
            <div className="bg-gradient-to-r from-purple-900/80 to-blue-900/80 backdrop-blur-sm rounded-2xl p-8 border border-yellow-400/30">
              <div className="text-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <img
                    src="/Citadel-Academy-Logo.png"
                    alt="Citadel Academy"
                    className="h-10 w-10"
                  />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Ready for Advanced Learning?
                </h2>
                <p className="text-purple-100 text-lg">
                  "Number-go-up and responsibility-go-up technology requires
                  your knowledge to go up!"
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white/10 rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <BookOpen className="h-6 w-6 text-yellow-400" />
                    <h3 className="text-white font-bold">Advanced Courses</h3>
                  </div>
                  <p className="text-purple-200 text-sm mb-3">
                    My First Bitcoin Diploma, coding bootcamps, home mining
                  </p>
                  <div className="flex items-center space-x-2 text-yellow-400">
                    <Star className="h-4 w-4" />
                    <span className="text-sm">Beginner to Expert</span>
                  </div>
                </div>

                <div className="bg-white/10 rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <UserCheck className="h-6 w-6 text-blue-400" />
                    <h3 className="text-white font-bold">Mentor Marketplace</h3>
                  </div>
                  <p className="text-purple-200 text-sm mb-3">
                    1:1 guidance from Bitcoin experts
                  </p>
                  <div className="flex items-center space-x-2 text-blue-400">
                    <MessageCircle className="h-4 w-4" />
                    <span className="text-sm">Free & Paid Options</span>
                  </div>
                </div>

                <div className="bg-white/10 rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <ShoppingCart className="h-6 w-6 text-green-400" />
                    <h3 className="text-white font-bold">Academy Store</h3>
                  </div>
                  <p className="text-purple-200 text-sm mb-3">
                    Bitcoin books, hardware, educational materials
                  </p>
                  <div className="flex items-center space-x-2 text-green-400">
                    <Library className="h-4 w-4" />
                    <span className="text-sm">Sovereign Library</span>
                  </div>
                </div>

                <div className="bg-white/10 rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <Users className="h-6 w-6 text-purple-400" />
                    <h3 className="text-white font-bold">Study Groups</h3>
                  </div>
                  <p className="text-purple-200 text-sm mb-3">
                    Collaborative learning with other families
                  </p>
                  <div className="flex items-center space-x-2 text-purple-400">
                    <Network className="h-4 w-4" />
                    <span className="text-sm">Community Learning</span>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-purple-100 mb-4 italic">
                  "Sovereignty is a journey that begins at home, in YOUR castle
                  - unlock your full potential for self-rule in the Citadel
                  Academy"
                </p>
                <a
                  href="https://citadel.academy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 transform hover:scale-105 inline-flex items-center space-x-2 shadow-lg"
                >
                  <img
                    src="/Citadel-Academy-Logo.png"
                    alt="Citadel Academy"
                    className="h-5 w-5"
                  />
                  <span>Enter Citadel Academy - Full LMS Platform</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Family Leaderboard */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <h3 className="text-white font-bold text-lg mb-4 flex items-center space-x-2">
                <Trophy className="h-5 w-5 text-yellow-400" />
                <span>Family Leaderboard</span>
              </h3>

              <div className="space-y-3">
                {familyMembers.map((member, index) => (
                  <div
                    key={member.id}
                    className="flex items-center space-x-3 bg-white/10 rounded-lg p-3"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${index === 0
                          ? "bg-yellow-500"
                          : index === 1
                            ? "bg-gray-400"
                            : index === 2
                              ? "bg-orange-600"
                              : "bg-purple-500"
                        }`}
                    >
                      {index < 3 ? index + 1 : member.avatar}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold">{member.name}</p>
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-white/20 rounded-full h-1">
                          <div
                            className="bg-gradient-to-r from-yellow-400 to-orange-500 h-1 rounded-full"
                            style={{ width: `${member.progress}%` }}
                          />
                        </div>
                        <span className="text-purple-200 text-xs">
                          {member.progress}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center space-x-1 text-orange-400">
                        <Flame className="h-3 w-3" />
                        <span className="text-xs">{member.streak}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-yellow-400">
                        <Award className="h-3 w-3" />
                        <span className="text-xs">{member.badges}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Achievements */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <h3 className="text-white font-bold text-lg mb-4 flex items-center space-x-2">
                <Sparkles className="h-5 w-5 text-yellow-400" />
                <span>Recent Achievements</span>
              </h3>

              <div className="space-y-3">
                {achievements.slice(0, 3).map((achievement) => (
                  <div
                    key={achievement.id}
                    className="flex items-center space-x-3 bg-white/10 rounded-lg p-3"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white">
                      {achievement.icon}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">
                        {achievement.title}
                      </p>
                      <p className="text-purple-200 text-xs">
                        {achievement.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <h3 className="text-white font-bold text-lg mb-4">
                Quick Actions
              </h3>

              <div className="space-y-3">
                <button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2">
                  <Play className="h-4 w-4" />
                  <span>Continue Learning</span>
                </button>

                <button className="w-full bg-white/20 hover:bg-white/30 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2">
                  <MessageCircle className="h-4 w-4" />
                  <span>Family Discussion</span>
                </button>

                <button className="w-full bg-white/20 hover:bg-white/30 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2">
                  <Download className="h-4 w-4" />
                  <span>Download Progress</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-purple-200">
            <span className="flex items-center space-x-2">
              <img
                src="/Citadel-Academy-Logo.png"
                alt="Citadel Academy"
                className="h-4 w-4"
              />
              <span>Knowledge is sovereignty</span>
            </span>
            <span className="flex items-center space-x-2">
              <Bitcoin className="h-4 w-4" />
              <span>Bitcoin-only education</span>
            </span>
            <span className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Family-first learning</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EducationPlatform;
