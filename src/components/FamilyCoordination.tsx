import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    Bitcoin,
    Calendar,
    CheckCircle,
    Clock,
    Crown,
    Download,
    ExternalLink,
    Eye,
    Home,
    Network,
    Plus,
    Server,
    Settings,
    Shield,
    Sparkles,
    Target,
    TrendingUp,
    Users,
    Wifi
} from "lucide-react";
import React, { useState } from "react";

interface FamilyCoordinationProps {
  onBack: () => void;
}

interface CoordinationTask {
  id: string;
  title: string;
  description: string;
  assignee: string;
  dueDate: Date;
  status: "pending" | "in-progress" | "completed" | "overdue";
  priority: "low" | "medium" | "high" | "critical";
  category:
    | "security"
    | "education"
    | "treasury"
    | "infrastructure"
    | "governance";
}

interface FamilyMeeting {
  id: string;
  title: string;
  date: Date;
  duration: number;
  attendees: string[];
  agenda: string[];
  status: "scheduled" | "in-progress" | "completed";
}

interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  votes: { member: string; vote: "yes" | "no" | "abstain" }[];
  status: "active" | "passed" | "rejected" | "pending";
  deadline: Date;
}

const FamilyCoordination: React.FC<FamilyCoordinationProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<
    "overview" | "tasks" | "meetings" | "governance" | "infrastructure"
  >("overview");
  const [familyName] = useState("Nakamoto");

  const coordinationTasks: CoordinationTask[] = [
    {
      id: "1",
      title: "Update Family Emergency Plan",
      description: "Review and update our Bitcoin recovery procedures",
      assignee: "Satoshi",
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      status: "in-progress",
      priority: "high",
      category: "security",
    },
    {
      id: "2",
      title: "Complete Lightning Education Module",
      description: "All family members complete Lightning Network basics",
      assignee: "All",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "pending",
      priority: "medium",
      category: "education",
    },
    {
      id: "3",
      title: "Monthly Treasury Review",
      description: "Analyze family Bitcoin holdings and allocation",
      assignee: "Hal",
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      status: "pending",
      priority: "high",
      category: "treasury",
    },
  ];

  const upcomingMeetings: FamilyMeeting[] = [
    {
      id: "1",
      title: "Weekly Family Bitcoin Sync",
      date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      duration: 60,
      attendees: ["Satoshi", "Hal", "Alice", "Bob"],
      agenda: ["Treasury Update", "Education Progress", "Security Review"],
      status: "scheduled",
    },
    {
      id: "2",
      title: "Q4 Sovereignty Planning",
      date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      duration: 120,
      attendees: ["Satoshi", "Hal"],
      agenda: [
        "Long-term Goals",
        "Infrastructure Upgrades",
        "Education Roadmap",
      ],
      status: "scheduled",
    },
  ];

  const activeProposals: GovernanceProposal[] = [
    {
      id: "1",
      title: "Increase Monthly DCA Amount",
      description:
        "Proposal to increase our family DCA from $500 to $750 per month",
      proposer: "Satoshi",
      votes: [
        { member: "Satoshi", vote: "yes" },
        { member: "Hal", vote: "yes" },
      ],
      status: "active",
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
    {
      id: "2",
      title: "Setup Family Lightning Node",
      description: "Establish our own Lightning node for enhanced sovereignty",
      proposer: "Hal",
      votes: [{ member: "Hal", vote: "yes" }],
      status: "active",
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "passed":
        return "text-green-400";
      case "in-progress":
      case "active":
        return "text-blue-400";
      case "pending":
      case "scheduled":
        return "text-yellow-400";
      case "overdue":
      case "rejected":
        return "text-red-400";
      default:
        return "text-purple-200";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-green-500";
      default:
        return "bg-purple-500";
    }
  };

  const formatTimeUntil = (date: Date) => {
    const days = Math.ceil(
      (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days < 0) return `${Math.abs(days)} days overdue`;
    return `${days} days`;
  };

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
                  Advanced Family Coordination
                </h1>
                <p className="text-purple-200">
                  Orchestrate your family's Bitcoin sovereignty journey
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="bg-white/10 rounded-lg p-3">
                <img
                  src="/Rebuilding_Camelot_logo__transparency_v3.png"
                  alt="Rebuilding Camelot"
                  className="h-8 w-8"
                />
              </div>
              <button className="p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300">
                <Settings className="h-6 w-6 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 mb-8 border border-white/20">
          <div className="flex space-x-2">
            {[
              {
                id: "overview",
                label: "Overview",
                icon: <Home className="h-4 w-4" />,
              },
              {
                id: "tasks",
                label: "Tasks & Goals",
                icon: <Target className="h-4 w-4" />,
              },
              {
                id: "meetings",
                label: "Family Meetings",
                icon: <Calendar className="h-4 w-4" />,
              },
              {
                id: "governance",
                label: "Governance",
                icon: <Crown className="h-4 w-4" />,
              },
              {
                id: "infrastructure",
                label: "Infrastructure",
                icon: <Server className="h-4 w-4" />,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-semibold transition-all duration-300 ${
                  activeTab === tab.id
                    ? "bg-purple-700 text-white"
                    : "text-purple-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Family Coordination Stats */}
            <div className="grid md:grid-cols-4 gap-6">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Target className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">
                  Active Goals
                </h3>
                <p className="text-3xl font-bold text-blue-400">12</p>
                <p className="text-purple-200 text-sm">3 high priority</p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">Completed</h3>
                <p className="text-3xl font-bold text-green-400">28</p>
                <p className="text-purple-200 text-sm">this quarter</p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">Meetings</h3>
                <p className="text-3xl font-bold text-yellow-400">2</p>
                <p className="text-purple-200 text-sm">this week</p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">
                  Coordination Score
                </h3>
                <p className="text-3xl font-bold text-purple-400">94%</p>
                <p className="text-purple-200 text-sm">family alignment</p>
              </div>
            </div>

            {/* Quick Actions Dashboard */}
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Urgent Tasks */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                    <AlertTriangle className="h-5 w-5 text-orange-400" />
                    <span>Urgent Tasks</span>
                  </h2>
                  <button className="text-purple-200 hover:text-white transition-colors duration-200">
                    <Eye className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {coordinationTasks
                    .filter(
                      (task) =>
                        task.priority === "high" ||
                        task.priority === "critical",
                    )
                    .map((task) => (
                      <div key={task.id} className="bg-white/10 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-white font-semibold">
                            {task.title}
                          </h3>
                          <div
                            className={`w-3 h-3 rounded-full ${getPriorityColor(task.priority)}`}
                          />
                        </div>
                        <p className="text-purple-200 text-sm mb-3">
                          {task.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-purple-300 text-sm">
                            Assigned to: {task.assignee}
                          </span>
                          <span
                            className={`text-sm font-semibold ${getStatusColor(task.status)}`}
                          >
                            {formatTimeUntil(task.dueDate)}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Upcoming Events */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                    <Calendar className="h-5 w-5 text-blue-400" />
                    <span>Upcoming Events</span>
                  </h2>
                  <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2">
                    <Plus className="h-4 w-4" />
                    <span>Schedule</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {upcomingMeetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className="bg-white/10 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-white font-semibold">
                          {meeting.title}
                        </h3>
                        <span className="text-purple-300 text-sm">
                          {meeting.duration} min
                        </span>
                      </div>
                      <p className="text-purple-200 text-sm mb-3">
                        {meeting.date.toLocaleDateString()} at{" "}
                        {meeting.date.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Users className="h-4 w-4 text-purple-300" />
                          <span className="text-purple-300 text-sm">
                            {meeting.attendees.length} attendees
                          </span>
                        </div>
                        <button className="text-blue-400 hover:text-blue-300 transition-colors duration-200">
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Family Sovereignty Metrics */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center space-x-2">
                <Sparkles className="h-6 w-6 text-yellow-400" />
                <span>Family Sovereignty Dashboard</span>
              </h2>

              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <img
                      src="/Citadel Academy Logo.png"
                      alt="Citadel Academy"
                      className="h-10 w-10"
                    />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">
                    Security Posture
                  </h3>
                  <div className="w-full bg-white/20 rounded-full h-3 mb-2">
                    <div
                      className="bg-gradient-to-r from-orange-400 to-red-500 h-3 rounded-full"
                      style={{ width: "92%" }}
                    />
                  </div>
                  <p className="text-orange-400 font-semibold">92% Secure</p>
                  <p className="text-purple-200 text-sm">
                    Multi-sig, cold storage, recovery plans
                  </p>
                </div>

                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <img
                      src="/LN Bitcoin icon.png"
                      alt="Lightning Bitcoin"
                      className="h-10 w-10"
                    />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">
                    Financial Sovereignty
                  </h3>
                  <div className="w-full bg-white/20 rounded-full h-3 mb-2">
                    <div
                      className="bg-gradient-to-r from-yellow-400 to-orange-500 h-3 rounded-full"
                      style={{ width: "87%" }}
                    />
                  </div>
                  <p className="text-yellow-400 font-semibold">
                    87% Independent
                  </p>
                  <p className="text-purple-200 text-sm">
                    Bitcoin allocation, Lightning setup
                  </p>
                </div>

                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <img
                      src="/Rebuilding_Camelot_logo__transparency_v3.png"
                      alt="Rebuilding Camelot"
                      className="h-10 w-10"
                    />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">
                    Family Coordination
                  </h3>
                  <div className="w-full bg-white/20 rounded-full h-3 mb-2">
                    <div
                      className="bg-gradient-to-r from-purple-400 to-blue-500 h-3 rounded-full"
                      style={{ width: "94%" }}
                    />
                  </div>
                  <p className="text-purple-400 font-semibold">94% Aligned</p>
                  <p className="text-purple-200 text-sm">
                    Communication, governance, goals
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === "tasks" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">
                Family Tasks & Goals
              </h2>
              <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2">
                <Plus className="h-5 w-5" />
                <span>Create Task</span>
              </button>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {["pending", "in-progress", "completed"].map((status) => (
                <div
                  key={status}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20"
                >
                  <h3 className="text-white font-bold text-lg mb-4 capitalize">
                    {status.replace("-", " ")}
                  </h3>
                  <div className="space-y-4">
                    {coordinationTasks
                      .filter((task) => task.status === status)
                      .map((task) => (
                        <div
                          key={task.id}
                          className="bg-white/10 rounded-lg p-4"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-white font-semibold">
                              {task.title}
                            </h4>
                            <div
                              className={`w-3 h-3 rounded-full ${getPriorityColor(task.priority)}`}
                            />
                          </div>
                          <p className="text-purple-200 text-sm mb-3">
                            {task.description}
                          </p>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-purple-300">
                              {task.assignee}
                            </span>
                            <span className={getStatusColor(task.status)}>
                              {formatTimeUntil(task.dueDate)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meetings Tab */}
        {activeTab === "meetings" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Family Meetings</h2>
              <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2">
                <Plus className="h-5 w-5" />
                <span>Schedule Meeting</span>
              </button>
            </div>

            <div className="space-y-6">
              {upcomingMeetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-white font-bold text-xl mb-2">
                        {meeting.title}
                      </h3>
                      <div className="flex items-center space-x-4 text-purple-200">
                        <span className="flex items-center space-x-2">
                          <Calendar className="h-4 w-4" />
                          <span>{meeting.date.toLocaleDateString()}</span>
                        </span>
                        <span className="flex items-center space-x-2">
                          <Clock className="h-4 w-4" />
                          <span>{meeting.duration} minutes</span>
                        </span>
                        <span className="flex items-center space-x-2">
                          <Users className="h-4 w-4" />
                          <span>{meeting.attendees.length} attendees</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300">
                        Join
                      </button>
                      <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300">
                        Edit
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-white font-semibold mb-3">Agenda</h4>
                      <ul className="space-y-2">
                        {meeting.agenda.map((item, index) => (
                          <li
                            key={index}
                            className="text-purple-200 flex items-center space-x-2"
                          >
                            <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-white font-semibold mb-3">
                        Attendees
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {meeting.attendees.map((attendee, index) => (
                          <div
                            key={index}
                            className="bg-white/10 rounded-full px-3 py-1"
                          >
                            <span className="text-purple-200 text-sm">
                              {attendee}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Governance Tab */}
        {activeTab === "governance" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">
                Family Governance
              </h2>
              <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2">
                <Plus className="h-5 w-5" />
                <span>New Proposal</span>
              </button>
            </div>

            <div className="space-y-6">
              {activeProposals.map((proposal) => (
                <div
                  key={proposal.id}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-white font-bold text-xl mb-2">
                        {proposal.title}
                      </h3>
                      <p className="text-purple-200 mb-3">
                        {proposal.description}
                      </p>
                      <div className="flex items-center space-x-4 text-sm text-purple-300">
                        <span>Proposed by: {proposal.proposer}</span>
                        <span>
                          Deadline: {proposal.deadline.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(proposal.status)}`}
                    >
                      {proposal.status.toUpperCase()}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-white font-semibold mb-3">
                        Current Votes
                      </h4>
                      <div className="space-y-2">
                        {proposal.votes.map((vote, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between bg-white/10 rounded-lg p-3"
                          >
                            <span className="text-purple-200">
                              {vote.member}
                            </span>
                            <span
                              className={`font-semibold ${
                                vote.vote === "yes"
                                  ? "text-green-400"
                                  : vote.vote === "no"
                                    ? "text-red-400"
                                    : "text-yellow-400"
                              }`}
                            >
                              {vote.vote.toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-white font-semibold mb-3">
                        Cast Your Vote
                      </h4>
                      <div className="space-y-3">
                        <button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300">
                          Vote Yes
                        </button>
                        <button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300">
                          Vote No
                        </button>
                        <button className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300">
                          Abstain
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Infrastructure Tab */}
        {activeTab === "infrastructure" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">
              Family Infrastructure
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Bitcoin Infrastructure */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <h3 className="text-white font-bold text-xl mb-6 flex items-center space-x-2">
                  <Bitcoin className="h-6 w-6 text-orange-400" />
                  <span>Bitcoin Infrastructure</span>
                </h3>

                <div className="space-y-4">
                  <div className="bg-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-semibold">
                        Full Node
                      </span>
                      <div className="flex items-center space-x-2 text-green-400">
                        <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                        <span className="text-sm">Online</span>
                      </div>
                    </div>
                    <p className="text-purple-200 text-sm">
                      Bitcoin Core v24.0.1 - Fully synced
                    </p>
                  </div>

                  <div className="bg-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-semibold">
                        Lightning Node
                      </span>
                      <div className="flex items-center space-x-2 text-yellow-400">
                        <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
                        <span className="text-sm">Syncing</span>
                      </div>
                    </div>
                    <p className="text-purple-200 text-sm">
                      LND v0.16.0 - 12 channels, 2.5M sats capacity
                    </p>
                  </div>

                  <div className="bg-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-semibold">
                        Hardware Wallets
                      </span>
                      <div className="flex items-center space-x-2 text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Secured</span>
                      </div>
                    </div>
                    <p className="text-purple-200 text-sm">
                      3 Coldcard devices, 2-of-3 multisig
                    </p>
                  </div>
                </div>
              </div>

              {/* Communication Infrastructure */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <h3 className="text-white font-bold text-xl mb-6 flex items-center space-x-2">
                  <Network className="h-6 w-6 text-blue-400" />
                  <span>Communication Infrastructure</span>
                </h3>

                <div className="space-y-4">
                  <div className="bg-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-semibold">
                        Nostr Relay
                      </span>
                      <div className="flex items-center space-x-2 text-green-400">
                        <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                        <span className="text-sm">Active</span>
                      </div>
                    </div>
                    <p className="text-purple-200 text-sm">
                      Private family relay - 4 connected clients
                    </p>
                  </div>

                  <div className="bg-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-semibold">
                        Mesh Network
                      </span>
                      <div className="flex items-center space-x-2 text-blue-400">
                        <Wifi className="h-4 w-4" />
                        <span className="text-sm">Connected</span>
                      </div>
                    </div>
                    <p className="text-purple-200 text-sm">
                      Local mesh for emergency communication
                    </p>
                  </div>

                  <div className="bg-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-semibold">
                        Backup Systems
                      </span>
                      <div className="flex items-center space-x-2 text-green-400">
                        <Shield className="h-4 w-4" />
                        <span className="text-sm">Protected</span>
                      </div>
                    </div>
                    <p className="text-purple-200 text-sm">
                      Encrypted backups, multiple locations
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Infrastructure Actions */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <h3 className="text-white font-bold text-xl mb-6">
                Infrastructure Management
              </h3>

              <div className="grid md:grid-cols-3 gap-4">
                <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2">
                  <Activity className="h-5 w-5" />
                  <span>System Status</span>
                </button>

                <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Configuration</span>
                </button>

                <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2">
                  <Download className="h-5 w-5" />
                  <span>Backup Now</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12">
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-purple-200">
            <span className="flex items-center space-x-2">
              <img
                src="/Rebuilding_Camelot_logo__transparency_v3.png"
                alt="Rebuilding Camelot"
                className="h-4 w-4"
              />
              <span>Advanced family coordination</span>
            </span>
            <span className="flex items-center space-x-2">
              <img
                src="/Citadel Academy Logo.png"
                alt="Citadel Academy"
                className="h-4 w-4"
              />
              <span>Sovereign governance</span>
            </span>
            <span className="flex items-center space-x-2">
              <Bitcoin className="h-4 w-4" />
              <span>Bitcoin-first infrastructure</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FamilyCoordination;
