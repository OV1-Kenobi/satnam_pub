/**
 * Educational Dashboard
 * Main interface for cognitive capital accounting and educational tracking
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import {
  BookOpen,
  GraduationCap,
  TrendingUp,
  Award,
  Clock,
  Target,
  Users,
  Star,
  Plus,
  Search,
  Filter,
  Calendar,
  BarChart3,
  Trophy,
  Brain,
  Zap,
  ArrowRight,
  Info,
  Shield,
  Lock,
  Eye,
  EyeOff,
  X,
  AlertCircle
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import CourseRegistrationModal from './CourseRegistrationModal';
import ProgressModal from './ProgressModal';

interface EducationalDashboardProps {
  userPubkey: string;
  familyId?: string;
  onClose: () => void;
}

interface Course {
  id: string;
  title: string;
  description: string;
  category: 'basic' | 'advanced' | 'specialized';
  provider: 'satnam' | 'citadel-academy';
  duration: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  progress: number;
  status: 'not-started' | 'in-progress' | 'completed';
  enrollmentDate?: number;
  completionDate?: number;
  badges: string[];
  certificates: string[];
}

interface LearningPathway {
  id: string;
  title: string;
  description: string;
  courses: string[];
  progress: number;
  status: 'not-started' | 'in-progress' | 'completed';
  badges: string[];
  estimatedDuration: number;
}

interface CognitiveCapitalMetrics {
  totalCourses: number;
  completedCourses: number;
  totalTimeSpent: number;
  averageQuizScore: number;
  badgesEarned: number;
  certificatesEarned: number;
  cognitiveCapitalScore: number;
  learningStreak: number;
  weeklyProgress: number;
  monthlyProgress: number;
}

const EducationalDashboard: React.FC<EducationalDashboardProps> = ({
  userPubkey,
  familyId,
  onClose
}) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [pathways, setPathways] = useState<LearningPathway[]>([]);
  const [metrics, setMetrics] = useState<CognitiveCapitalMetrics | null>(null);
  const [view, setView] = useState<'overview' | 'courses' | 'pathways' | 'badges' | 'certificates'>('overview');
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrivateData, setShowPrivateData] = useState(false);

  useEffect(() => {
    loadEducationalData();
  }, []);

  const loadEducationalData = async () => {
    try {
      setLoading(true);
      // Mock data - would come from API
      const mockCourses: Course[] = [
        {
          id: 'bitcoin-101',
          title: 'Bitcoin Fundamentals',
          description: 'Learn the basics of Bitcoin, blockchain technology, and digital money.',
          category: 'basic',
          provider: 'satnam',
          duration: 8,
          difficulty: 'beginner',
          progress: 75,
          status: 'in-progress',
          enrollmentDate: Date.now() - 14 * 24 * 60 * 60 * 1000,
          badges: ['bitcoin-initiate'],
          certificates: []
        },
        {
          id: 'lightning-201',
          title: 'Lightning Network Mastery',
          description: 'Advanced Lightning Network concepts and practical applications.',
          category: 'advanced',
          provider: 'citadel-academy',
          duration: 12,
          difficulty: 'intermediate',
          progress: 25,
          status: 'in-progress',
          enrollmentDate: Date.now() - 7 * 24 * 60 * 60 * 1000,
          badges: [],
          certificates: []
        },
        {
          id: 'privacy-301',
          title: 'Privacy & Sovereignty',
          description: 'Advanced privacy techniques and maintaining financial sovereignty.',
          category: 'specialized',
          provider: 'citadel-academy',
          duration: 16,
          difficulty: 'advanced',
          progress: 0,
          status: 'not-started',
          badges: [],
          certificates: []
        }
      ];

      const mockPathways: LearningPathway[] = [
        {
          id: 'bitcoin-journey',
          title: 'Bitcoin Journey',
          description: 'Complete path from Bitcoin basics to advanced concepts',
          courses: ['bitcoin-101', 'lightning-201', 'privacy-301'],
          progress: 50,
          status: 'in-progress',
          badges: ['bitcoin-initiate'],
          estimatedDuration: 36
        },
        {
          id: 'privacy-mastery',
          title: 'Privacy Mastery',
          description: 'Master privacy and sovereignty in the digital age',
          courses: ['privacy-301'],
          progress: 0,
          status: 'not-started',
          badges: [],
          estimatedDuration: 16
        }
      ];

      const mockMetrics: CognitiveCapitalMetrics = {
        totalCourses: 3,
        completedCourses: 0,
        totalTimeSpent: 660, // 11 hours
        averageQuizScore: 85,
        badgesEarned: 1,
        certificatesEarned: 0,
        cognitiveCapitalScore: 750,
        learningStreak: 5,
        weeklyProgress: 15,
        monthlyProgress: 45
      };

      setCourses(mockCourses);
      setPathways(mockPathways);
      setMetrics(mockMetrics);
    } catch (error) {
      setError('Failed to load educational data');
    } finally {
      setLoading(false);
    }
  };

  const handleCourseRegistration = () => {
    setShowRegistrationModal(false);
    loadEducationalData(); // Refresh data
  };

  const handleCourseSelect = (course: Course) => {
    setSelectedCourse(course);
    setShowProgressModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'in-progress':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'not-started':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'intermediate':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'advanced':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'satnam':
        return <BookOpen className="h-5 w-5 text-blue-500" />;
      case 'citadel-academy':
        return <GraduationCap className="h-5 w-5 text-purple-500" />;
      default:
        return <BookOpen className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'text-green-600';
    if (progress >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredCourses = courses.filter(course => {
    if (filterCategory !== 'all' && course.category !== filterCategory) return false;
    if (filterStatus !== 'all' && course.status !== filterStatus) return false;
    if (searchQuery && !course.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your cognitive capital dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">Cognitive Capital Accounting</h1>
                <p className="text-purple-100">Track your educational journey and build sovereign knowledge</p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-purple-200 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between p-4">
              <div className="flex space-x-1">
                <button
                  onClick={() => setView('overview')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    view === 'overview' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setView('courses')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    view === 'courses' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Courses
                </button>
                <button
                  onClick={() => setView('pathways')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    view === 'pathways' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Learning Pathways
                </button>
                <button
                  onClick={() => setView('badges')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    view === 'badges' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Badges
                </button>
                <button
                  onClick={() => setView('certificates')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    view === 'certificates' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Certificates
                </button>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowPrivateData(!showPrivateData)}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {showPrivateData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span>{showPrivateData ? 'Hide' : 'Show'} Private Data</span>
                </button>
                
                <button
                  onClick={() => setShowRegistrationModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Register for Course</span>
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(95vh-200px)]">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h4 className="text-red-900 font-medium mb-1">Error Loading Data</h4>
                    <p className="text-red-800 text-sm">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {view === 'overview' && metrics && (
              <div className="space-y-6">
                {/* Welcome Section */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                      <Brain className="h-8 w-8 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Your Cognitive Capital Dashboard</h2>
                      <p className="text-gray-700 mb-4">
                        This is where you track your educational journey, build sovereign knowledge, and accumulate cognitive capital.
                        Every course completed, badge earned, and skill mastered contributes to your personal and family's intellectual wealth.
                      </p>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <div className="flex items-center space-x-1">
                          <Shield className="h-4 w-4" />
                          <span>Privacy-first learning</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Lock className="h-4 w-4" />
                          <span>Self-sovereign credentials</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Zap className="h-4 w-4" />
                          <span>Bitcoin-native rewards</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid md:grid-cols-4 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-blue-600 text-sm font-medium">Cognitive Capital Score</p>
                        <p className="text-3xl font-bold text-blue-900">{metrics.cognitiveCapitalScore}</p>
                      </div>
                      <Brain className="h-8 w-8 text-blue-600" />
                    </div>
                    <div className="mt-2 text-sm text-blue-700">
                      +{metrics.weeklyProgress} this week
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-green-600 text-sm font-medium">Learning Streak</p>
                        <p className="text-3xl font-bold text-green-900">{metrics.learningStreak} days</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-green-600" />
                    </div>
                    <div className="mt-2 text-sm text-green-700">
                      Keep it going!
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-purple-600 text-sm font-medium">Time Invested</p>
                        <p className="text-3xl font-bold text-purple-900">{formatTime(metrics.totalTimeSpent)}</p>
                      </div>
                      <Clock className="h-8 w-8 text-purple-600" />
                    </div>
                    <div className="mt-2 text-sm text-purple-700">
                      Knowledge building
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-6 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-yellow-600 text-sm font-medium">Badges Earned</p>
                        <p className="text-3xl font-bold text-yellow-900">{metrics.badgesEarned}</p>
                      </div>
                      <Trophy className="h-8 w-8 text-yellow-600" />
                    </div>
                    <div className="mt-2 text-sm text-yellow-700">
                      Achievements unlocked
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                    <div className="space-y-3">
                      <button
                        onClick={() => setShowRegistrationModal(true)}
                        className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <Plus className="h-5 w-5 text-blue-600" />
                          <span className="font-medium">Register for New Course</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </button>
                      
                      <button
                        onClick={() => setView('courses')}
                        className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <BookOpen className="h-5 w-5 text-green-600" />
                          <span className="font-medium">Continue Learning</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </button>
                      
                      <button
                        onClick={() => setView('pathways')}
                        className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <Target className="h-5 w-5 text-purple-600" />
                          <span className="font-medium">Explore Learning Pathways</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </button>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
                    <div className="space-y-3">
                      {courses.filter(c => c.status === 'in-progress').slice(0, 3).map((course) => (
                        <div key={course.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            {getProviderIcon(course.provider)}
                            <div>
                              <p className="font-medium text-gray-900">{course.title}</p>
                              <p className="text-sm text-gray-600">{course.progress}% complete</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCourseSelect(course)}
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                          >
                            Continue
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {view === 'courses' && (
              <div className="space-y-6">
                {/* Filters */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search courses..."
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      <option value="all">All Categories</option>
                      <option value="basic">Basic</option>
                      <option value="advanced">Advanced</option>
                      <option value="specialized">Specialized</option>
                    </select>
                    
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      <option value="all">All Status</option>
                      <option value="not-started">Not Started</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  
                  <button
                    onClick={() => setShowRegistrationModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Course</span>
                  </button>
                </div>

                {/* Course Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCourses.map((course) => (
                    <div
                      key={course.id}
                      className="border border-gray-200 rounded-lg p-6 hover:border-blue-300 hover:shadow-md transition-all duration-300 cursor-pointer"
                      onClick={() => handleCourseSelect(course)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          {getProviderIcon(course.provider)}
                          <span className="text-sm font-medium text-gray-600">
                            {course.provider === 'satnam' ? 'Satnam.pub' : 'Citadel Academy'}
                          </span>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full border ${getDifficultyColor(course.difficulty)}`}>
                          {course.difficulty}
                        </span>
                      </div>
                      
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{course.title}</h3>
                      <p className="text-gray-600 text-sm mb-4">{course.description}</p>
                      
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">Progress</span>
                            <span className={`font-medium ${getProgressColor(course.progress)}`}>
                              {course.progress}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${course.progress}%` }}
                            ></div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Duration</span>
                          <span className="text-gray-900">{course.duration} hours</span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-1 text-xs rounded-full border ${getStatusColor(course.status)}`}>
                            {course.status.replace('-', ' ')}
                          </span>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'pathways' && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <h3 className="text-blue-900 font-medium mb-2">Learning Pathways</h3>
                      <p className="text-blue-800 text-sm">
                        Learning pathways are curated sequences of courses designed to help you achieve specific goals.
                        Complete pathways to earn special badges and unlock advanced content.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {pathways.map((pathway) => (
                    <div key={pathway.id} className="border border-gray-200 rounded-lg p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 mb-2">{pathway.title}</h3>
                          <p className="text-gray-600 mb-3">{pathway.description}</p>
                        </div>
                        <span className={`px-3 py-1 text-sm rounded-full border ${getStatusColor(pathway.status)}`}>
                          {pathway.status.replace('-', ' ')}
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">Progress</span>
                            <span className="font-medium">{pathway.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${pathway.progress}%` }}
                            ></div>
                          </div>
                        </div>
                        
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Estimated Duration</span>
                          <span className="text-gray-900">{pathway.estimatedDuration} hours</span>
                        </div>
                        
                        <div>
                          <span className="text-sm text-gray-600">Courses in Pathway:</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {pathway.courses.map((courseId) => {
                              const course = courses.find(c => c.id === courseId);
                              return (
                                <span
                                  key={courseId}
                                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                                >
                                  {course?.title || courseId}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        
                        {pathway.badges.length > 0 && (
                          <div>
                            <span className="text-sm text-gray-600">Badges:</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {pathway.badges.map((badge) => (
                                <span
                                  key={badge}
                                  className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs flex items-center space-x-1"
                                >
                                  <Trophy className="h-3 w-3" />
                                  <span>{badge}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'badges' && (
              <div className="space-y-6">
                <div className="text-center">
                  <Trophy className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Badges</h2>
                  <p className="text-gray-600">Achievements that mark your learning milestones</p>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  {courses.flatMap(c => c.badges).map((badge, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-6 text-center">
                      <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Trophy className="h-10 w-10 text-yellow-600" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{badge}</h3>
                      <p className="text-gray-600 text-sm">Achievement unlocked</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'certificates' && (
              <div className="space-y-6">
                <div className="text-center">
                  <GraduationCap className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Certificates</h2>
                  <p className="text-gray-600">Formal recognition of your completed courses</p>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  {courses.flatMap(c => c.certificates).length > 0 ? (
                    courses.flatMap(c => c.certificates).map((cert, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-6 text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <GraduationCap className="h-10 w-10 text-green-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{cert}</h3>
                        <p className="text-gray-600 text-sm">Certificate earned</p>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 text-center py-12">
                      <GraduationCap className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 mb-2">No certificates earned yet</p>
                      <p className="text-sm text-gray-500">Complete courses to earn certificates</p>
                      <button
                        onClick={() => setShowRegistrationModal(true)}
                        className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Start Learning
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showRegistrationModal && (
        <CourseRegistrationModal
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          userPubkey={userPubkey}
          familyId={familyId}
          onRegistrationComplete={handleCourseRegistration}
        />
      )}

      {showProgressModal && (
        <ProgressModal
          isOpen={showProgressModal}
          onClose={() => setShowProgressModal(false)}
          userPubkey={userPubkey}
          familyId={familyId}
          selectedCourseId={selectedCourse?.id}
        />
      )}
    </>
  );
};

export default EducationalDashboard; 