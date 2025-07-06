/**
 * Progress Tracking Modal
 * Shows detailed course progress, quiz scores, and learning achievements
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import {
  X,
  TrendingUp,
  Award,
  BookOpen,
  Clock,
  Target,
  CheckCircle,
  AlertCircle,
  Calendar,
  BarChart3,
  Trophy,
  Star,
  ArrowRight,
  Info,
  Zap,
  Users,
  Brain,
  GraduationCap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface ProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPubkey: string;
  familyId?: string;
  selectedCourseId?: string;
}

interface CourseProgress {
  courseId: string;
  courseTitle: string;
  provider: 'satnam' | 'citadel-academy';
  enrollmentDate: number;
  completionDate?: number;
  progress: number; // 0-100
  totalModules: number;
  completedModules: number;
  totalQuizzes: number;
  completedQuizzes: number;
  averageQuizScore: number;
  timeSpent: number; // in minutes
  badges: string[];
  certificates: string[];
  status: 'in-progress' | 'completed' | 'paused';
  lastActivity: number;
  nextDeadline?: number;
  modules: ModuleProgress[];
  quizzes: QuizResult[];
}

interface ModuleProgress {
  id: string;
  title: string;
  status: 'not-started' | 'in-progress' | 'completed';
  progress: number;
  timeSpent: number;
  completedAt?: number;
  score?: number;
}

interface QuizResult {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  completedAt: number;
  timeSpent: number;
  questions: number;
  correctAnswers: number;
}

interface LearningPathway {
  id: string;
  title: string;
  description: string;
  courses: string[];
  progress: number;
  status: 'not-started' | 'in-progress' | 'completed';
  badges: string[];
}

const ProgressModal: React.FC<ProgressModalProps> = ({
  isOpen,
  onClose,
  userPubkey,
  familyId,
  selectedCourseId
}) => {
  const [courseProgress, setCourseProgress] = useState<CourseProgress[]>([]);
  const [learningPathways, setLearningPathways] = useState<LearningPathway[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseProgress | null>(null);
  const [view, setView] = useState<'overview' | 'course-detail' | 'pathways' | 'achievements'>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadProgressData();
      if (selectedCourseId) {
        setView('course-detail');
      }
    }
  }, [isOpen, selectedCourseId]);

  const loadProgressData = async () => {
    try {
      setLoading(true);
      // Mock data - would come from API
      const progress: CourseProgress[] = [
        {
          courseId: 'bitcoin-101',
          courseTitle: 'Bitcoin Fundamentals',
          provider: 'satnam',
          enrollmentDate: Date.now() - 14 * 24 * 60 * 60 * 1000, // 2 weeks ago
          progress: 75,
          totalModules: 6,
          completedModules: 4,
          totalQuizzes: 4,
          completedQuizzes: 3,
          averageQuizScore: 87,
          timeSpent: 480, // 8 hours
          badges: ['bitcoin-initiate'],
          certificates: [],
          status: 'in-progress',
          lastActivity: Date.now() - 2 * 24 * 60 * 60 * 1000,
          nextDeadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
          modules: [
            {
              id: 'module-1',
              title: 'What is Bitcoin?',
              status: 'completed',
              progress: 100,
              timeSpent: 60,
              completedAt: Date.now() - 12 * 24 * 60 * 60 * 1000,
              score: 95
            },
            {
              id: 'module-2',
              title: 'How Bitcoin Works',
              status: 'completed',
              progress: 100,
              timeSpent: 90,
              completedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
              score: 88
            },
            {
              id: 'module-3',
              title: 'Wallets and Addresses',
              status: 'completed',
              progress: 100,
              timeSpent: 120,
              completedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
              score: 92
            },
            {
              id: 'module-4',
              title: 'Transactions and Blocks',
              status: 'completed',
              progress: 100,
              timeSpent: 150,
              completedAt: Date.now() - 6 * 24 * 60 * 60 * 1000,
              score: 85
            },
            {
              id: 'module-5',
              title: 'Mining and Consensus',
              status: 'in-progress',
              progress: 60,
              timeSpent: 45,
              score: undefined
            },
            {
              id: 'module-6',
              title: 'Bitcoin Security Basics',
              status: 'not-started',
              progress: 0,
              timeSpent: 0
            }
          ],
          quizzes: [
            {
              id: 'quiz-1',
              title: 'Bitcoin Basics Quiz',
              score: 95,
              maxScore: 100,
              completedAt: Date.now() - 11 * 24 * 60 * 60 * 1000,
              timeSpent: 15,
              questions: 10,
              correctAnswers: 9
            },
            {
              id: 'quiz-2',
              title: 'Bitcoin Mechanics Quiz',
              score: 88,
              maxScore: 100,
              completedAt: Date.now() - 9 * 24 * 60 * 60 * 1000,
              timeSpent: 20,
              questions: 12,
              correctAnswers: 10
            },
            {
              id: 'quiz-3',
              title: 'Wallet Security Quiz',
              score: 78,
              maxScore: 100,
              completedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
              timeSpent: 18,
              questions: 15,
              correctAnswers: 12
            }
          ]
        },
        {
          courseId: 'lightning-201',
          courseTitle: 'Lightning Network Mastery',
          provider: 'citadel-academy',
          enrollmentDate: Date.now() - 7 * 24 * 60 * 60 * 1000,
          progress: 25,
          totalModules: 8,
          completedModules: 2,
          totalQuizzes: 6,
          completedQuizzes: 1,
          averageQuizScore: 82,
          timeSpent: 180,
          badges: [],
          certificates: [],
          status: 'in-progress',
          lastActivity: Date.now() - 1 * 24 * 60 * 60 * 1000,
          modules: [
            {
              id: 'ln-module-1',
              title: 'Lightning Network Architecture',
              status: 'completed',
              progress: 100,
              timeSpent: 120,
              completedAt: Date.now() - 6 * 24 * 60 * 60 * 1000,
              score: 90
            },
            {
              id: 'ln-module-2',
              title: 'Channel Opening and Management',
              status: 'completed',
              progress: 100,
              timeSpent: 90,
              completedAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
              score: 85
            },
            {
              id: 'ln-module-3',
              title: 'Payment Routing',
              status: 'in-progress',
              progress: 30,
              timeSpent: 45,
              score: undefined
            }
          ],
          quizzes: [
            {
              id: 'ln-quiz-1',
              title: 'Lightning Architecture Quiz',
              score: 82,
              maxScore: 100,
              completedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
              timeSpent: 25,
              questions: 15,
              correctAnswers: 12
            }
          ]
        }
      ];

      const pathways: LearningPathway[] = [
        {
          id: 'bitcoin-journey',
          title: 'Bitcoin Journey',
          description: 'Complete path from Bitcoin basics to advanced concepts',
          courses: ['bitcoin-101', 'lightning-201', 'privacy-301'],
          progress: 50,
          status: 'in-progress',
          badges: ['bitcoin-initiate']
        },
        {
          id: 'privacy-mastery',
          title: 'Privacy Mastery',
          description: 'Master privacy and sovereignty in the digital age',
          courses: ['privacy-301'],
          progress: 0,
          status: 'not-started',
          badges: []
        }
      ];

      setCourseProgress(progress);
      setLearningPathways(pathways);
      
      if (selectedCourseId) {
        const course = progress.find(c => c.courseId === selectedCourseId);
        setSelectedCourse(course || null);
      }
    } catch (error) {
      setError('Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'in-progress':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'paused':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
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

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-yellow-600';
    if (score >= 70) return 'text-orange-600';
    return 'text-red-600';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-blue-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Learning Progress</h2>
              <p className="text-green-100">Track your cognitive capital development</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-green-200 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="border-b border-gray-200">
          <div className="flex space-x-1 p-4">
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
              onClick={() => setView('course-detail')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                view === 'course-detail' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Course Details
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
              onClick={() => setView('achievements')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                view === 'achievements' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Achievements
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading your progress...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h4 className="text-red-900 font-medium mb-1">Error Loading Progress</h4>
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && (
            <>
              {view === 'overview' && (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid md:grid-cols-4 gap-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-600 text-sm font-medium">Total Courses</p>
                          <p className="text-2xl font-bold text-blue-900">{courseProgress.length}</p>
                        </div>
                        <BookOpen className="h-8 w-8 text-blue-600" />
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-600 text-sm font-medium">Avg Progress</p>
                          <p className="text-2xl font-bold text-green-900">
                            {Math.round(courseProgress.reduce((acc, c) => acc + c.progress, 0) / courseProgress.length)}%
                          </p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-green-600" />
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-purple-600 text-sm font-medium">Time Spent</p>
                          <p className="text-2xl font-bold text-purple-900">
                            {formatTime(courseProgress.reduce((acc, c) => acc + c.timeSpent, 0))}
                          </p>
                        </div>
                        <Clock className="h-8 w-8 text-purple-600" />
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-6 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-yellow-600 text-sm font-medium">Avg Quiz Score</p>
                          <p className="text-2xl font-bold text-yellow-900">
                            {Math.round(courseProgress.reduce((acc, c) => acc + c.averageQuizScore, 0) / courseProgress.length)}%
                          </p>
                        </div>
                        <Target className="h-8 w-8 text-yellow-600" />
                      </div>
                    </div>
                  </div>

                  {/* Course Progress Cards */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Courses</h3>
                    <div className="space-y-4">
                      {courseProgress.map((course) => (
                        <div
                          key={course.courseId}
                          onClick={() => {
                            setSelectedCourse(course);
                            setView('course-detail');
                          }}
                          className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all duration-300 cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              {getProviderIcon(course.provider)}
                              <div>
                                <h4 className="font-semibold text-gray-900">{course.courseTitle}</h4>
                                <p className="text-sm text-gray-600">
                                  {course.provider === 'satnam' ? 'Satnam.pub' : 'Citadel Academy'}
                                </p>
                              </div>
                            </div>
                            <span className={`px-3 py-1 text-sm rounded-full border ${getStatusColor(course.status)}`}>
                              {course.status.replace('-', ' ')}
                            </span>
                          </div>
                          
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
                            
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-gray-600">Modules</span>
                                <p className="font-medium">{course.completedModules}/{course.totalModules}</p>
                              </div>
                              <div>
                                <span className="text-gray-600">Quizzes</span>
                                <p className="font-medium">{course.completedQuizzes}/{course.totalQuizzes}</p>
                              </div>
                              <div>
                                <span className="text-gray-600">Time</span>
                                <p className="font-medium">{formatTime(course.timeSpent)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {view === 'course-detail' && selectedCourse && (
                <div className="space-y-6">
                  {/* Course Header */}
                  <div className="border border-gray-200 rounded-lg p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">{selectedCourse.courseTitle}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <div className="flex items-center space-x-1">
                            {getProviderIcon(selectedCourse.provider)}
                            <span>{selectedCourse.provider === 'satnam' ? 'Satnam.pub' : 'Citadel Academy'}</span>
                          </div>
                          <span className={`px-2 py-1 rounded-full border ${getStatusColor(selectedCourse.status)}`}>
                            {selectedCourse.status.replace('-', ' ')}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-blue-600">{selectedCourse.progress}%</div>
                        <div className="text-sm text-gray-600">Complete</div>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">{selectedCourse.completedModules}/{selectedCourse.totalModules}</div>
                        <div className="text-sm text-gray-600">Modules</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">{selectedCourse.completedQuizzes}/{selectedCourse.totalQuizzes}</div>
                        <div className="text-sm text-gray-600">Quizzes</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">{formatTime(selectedCourse.timeSpent)}</div>
                        <div className="text-sm text-gray-600">Time Spent</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${getScoreColor(selectedCourse.averageQuizScore)}`}>
                          {selectedCourse.averageQuizScore}%
                        </div>
                        <div className="text-sm text-gray-600">Avg Score</div>
                      </div>
                    </div>
                  </div>

                  {/* Modules Progress */}
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Module Progress</h4>
                    <div className="space-y-3">
                      {selectedCourse.modules.map((module) => (
                        <div key={module.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium text-gray-900">{module.title}</h5>
                            <span className={`px-2 py-1 text-xs rounded-full border ${getStatusColor(module.status)}`}>
                              {module.status.replace('-', ' ')}
                            </span>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Progress</span>
                              <span className="font-medium">{module.progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${module.progress}%` }}
                              ></div>
                            </div>
                            
                            <div className="flex justify-between text-sm text-gray-600">
                              <span>Time: {formatTime(module.timeSpent)}</span>
                              {module.score && (
                                <span className={`font-medium ${getScoreColor(module.score)}`}>
                                  Score: {module.score}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quiz Results */}
                  {selectedCourse.quizzes.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">Quiz Results</h4>
                      <div className="space-y-3">
                        {selectedCourse.quizzes.map((quiz) => (
                          <div key={quiz.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-medium text-gray-900">{quiz.title}</h5>
                              <span className={`px-2 py-1 text-xs rounded-full font-medium ${getScoreColor(quiz.score)}`}>
                                {quiz.score}/{quiz.maxScore}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                              <div>
                                <span>Questions: {quiz.questions}</span>
                              </div>
                              <div>
                                <span>Correct: {quiz.correctAnswers}</span>
                              </div>
                              <div>
                                <span>Time: {formatTime(quiz.timeSpent)}</span>
                              </div>
                            </div>
                            
                            <div className="mt-2 text-xs text-gray-500">
                              Completed: {new Date(quiz.completedAt).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-center">
                    <button
                      onClick={() => setView('overview')}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Back to Overview
                    </button>
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
                    {learningPathways.map((pathway) => (
                      <div key={pathway.id} className="border border-gray-200 rounded-lg p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="text-xl font-bold text-gray-900 mb-2">{pathway.title}</h4>
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
                          
                          <div>
                            <span className="text-sm text-gray-600">Courses in Pathway:</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {pathway.courses.map((courseId) => {
                                const course = courseProgress.find(c => c.courseId === courseId);
                                return (
                                  <span
                                    key={courseId}
                                    className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                                  >
                                    {course?.courseTitle || courseId}
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

              {view === 'achievements' && (
                <div className="space-y-6">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <Trophy className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div>
                        <h3 className="text-yellow-900 font-medium mb-2">Your Achievements</h3>
                        <p className="text-yellow-800 text-sm">
                          Track your badges, certificates, and learning milestones. These achievements contribute to your cognitive capital score.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Badges */}
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Badges Earned</h4>
                    <div className="grid md:grid-cols-3 gap-4">
                      {courseProgress.flatMap(c => c.badges).map((badge, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4 text-center">
                          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Trophy className="h-8 w-8 text-yellow-600" />
                          </div>
                          <h5 className="font-medium text-gray-900 mb-1">{badge}</h5>
                          <p className="text-sm text-gray-600">Achievement unlocked</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Certificates */}
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Certificates</h4>
                    <div className="grid md:grid-cols-3 gap-4">
                      {courseProgress.flatMap(c => c.certificates).length > 0 ? (
                        courseProgress.flatMap(c => c.certificates).map((cert, index) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-4 text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                              <GraduationCap className="h-8 w-8 text-green-600" />
                            </div>
                            <h5 className="font-medium text-gray-900 mb-1">{cert}</h5>
                            <p className="text-sm text-gray-600">Certificate earned</p>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-3 text-center py-8">
                          <GraduationCap className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600">No certificates earned yet</p>
                          <p className="text-sm text-gray-500">Complete courses to earn certificates</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgressModal; 