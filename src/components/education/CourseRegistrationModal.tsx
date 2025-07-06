/**
 * Course Registration Modal
 * Handles registration for both Satnam.pub basic courses and Citadel Academy advanced courses
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import {
  X,
  BookOpen,
  GraduationCap,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Clock,
  Users,
  Star,
  Target,
  ArrowRight,
  Info,
  Shield,
  Zap,
  Lock
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface CourseRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCourse?: any;
  userPubkey: string;
  familyId?: string;
  onRegistrationComplete: () => void;
}

interface AvailableCourse {
  id: string;
  title: string;
  description: string;
  category: 'basic' | 'advanced' | 'specialized';
  provider: 'satnam' | 'citadel-academy' | 'external';
  duration: number; // hours
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites: string[];
  badges: string[];
  cost: number; // in satoshis
  enrollmentType: 'immediate' | 'approval-required' | 'external';
  maxStudents?: number;
  currentEnrollment?: number;
  startDate?: number;
  instructor?: string;
  syllabus: string[];
  learningOutcomes: string[];
  certificateType: 'completion' | 'certification' | 'badge';
  externalUrl?: string;
  registrationDeadline?: number;
}

const CourseRegistrationModal: React.FC<CourseRegistrationModalProps> = ({
  isOpen,
  onClose,
  selectedCourse,
  userPubkey,
  familyId,
  onRegistrationComplete
}) => {
  const [availableCourses, setAvailableCourses] = useState<AvailableCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [registrationStep, setRegistrationStep] = useState<'browse' | 'details' | 'confirm' | 'processing'>('browse');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAvailableCourses();
      if (selectedCourse) {
        setSelectedCourseId(selectedCourse.id);
        setRegistrationStep('details');
      }
    }
  }, [isOpen, selectedCourse]);

  const loadAvailableCourses = async () => {
    try {
      setLoading(true);
      // Mock data - would come from API
      const courses: AvailableCourse[] = [
        {
          id: 'bitcoin-101',
          title: 'Bitcoin Fundamentals',
          description: 'Learn the basics of Bitcoin, blockchain technology, and digital money. Perfect for beginners starting their Bitcoin journey.',
          category: 'basic',
          provider: 'satnam',
          duration: 8,
          difficulty: 'beginner',
          prerequisites: [],
          badges: ['bitcoin-initiate'],
          cost: 0,
          enrollmentType: 'immediate',
          syllabus: [
            'What is Bitcoin?',
            'How Bitcoin works',
            'Wallets and addresses',
            'Transactions and blocks',
            'Mining and consensus',
            'Bitcoin security basics'
          ],
          learningOutcomes: [
            'Understand Bitcoin fundamentals',
            'Set up a secure wallet',
            'Make your first transaction',
            'Explain Bitcoin to others'
          ],
          certificateType: 'completion'
        },
        {
          id: 'lightning-201',
          title: 'Lightning Network Mastery',
          description: 'Advanced Lightning Network concepts, channel management, and practical applications for Bitcoin scaling.',
          category: 'advanced',
          provider: 'citadel-academy',
          duration: 12,
          difficulty: 'intermediate',
          prerequisites: ['bitcoin-101'],
          badges: ['lightning-journeyman'],
          cost: 50000, // 50k sats
          enrollmentType: 'approval-required',
          maxStudents: 50,
          currentEnrollment: 23,
          startDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 week from now
          instructor: 'Dr. Lightning Master',
          syllabus: [
            'Lightning Network architecture',
            'Channel opening and management',
            'Payment routing',
            'Liquidity optimization',
            'Advanced security practices',
            'Real-world applications'
          ],
          learningOutcomes: [
            'Set up Lightning nodes',
            'Manage payment channels',
            'Optimize routing',
            'Build Lightning applications'
          ],
          certificateType: 'certification',
          externalUrl: 'https://citadel-academy.org/courses/lightning-201',
          registrationDeadline: Date.now() + 3 * 24 * 60 * 60 * 1000
        },
        {
          id: 'privacy-301',
          title: 'Privacy & Sovereignty',
          description: 'Advanced privacy techniques, coin mixing, and maintaining financial sovereignty in the digital age.',
          category: 'specialized',
          provider: 'citadel-academy',
          duration: 16,
          difficulty: 'advanced',
          prerequisites: ['bitcoin-101', 'lightning-201'],
          badges: ['privacy-guardian'],
          cost: 100000, // 100k sats
          enrollmentType: 'approval-required',
          maxStudents: 25,
          currentEnrollment: 8,
          startDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
          instructor: 'Privacy Expert',
          syllabus: [
            'Privacy fundamentals',
            'Coin mixing techniques',
            'Tor and VPN usage',
            'Hardware security',
            'Social engineering defense',
            'Legal considerations'
          ],
          learningOutcomes: [
            'Implement privacy tools',
            'Protect financial sovereignty',
            'Navigate legal frameworks',
            'Teach privacy to others'
          ],
          certificateType: 'certification',
          externalUrl: 'https://citadel-academy.org/courses/privacy-301'
        }
      ];

      setAvailableCourses(courses);
    } catch (error) {
      setError('Failed to load available courses');
    } finally {
      setLoading(false);
    }
  };

  const handleCourseSelect = (courseId: string) => {
    setSelectedCourseId(courseId);
    setRegistrationStep('details');
  };

  const handleRegistration = async () => {
    try {
      setRegistrationStep('processing');
      const courseToRegister = availableCourses.find(c => c.id === selectedCourseId);
      
      if (!courseToRegister) {
        throw new Error('Course not found');
      }

      // Handle different enrollment types
      if (courseToRegister.provider === 'satnam') {
        // Direct enrollment for Satnam courses
        await registerSatnamCourse(courseToRegister);
      } else {
        // External enrollment for Citadel Academy courses
        await registerExternalCourse(courseToRegister);
      }

      onRegistrationComplete();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Registration failed');
      setRegistrationStep('details');
    }
  };

  const registerSatnamCourse = async (course: AvailableCourse) => {
    // Mock API call for Satnam course registration
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Registered for Satnam course:', course.id);
  };

  const registerExternalCourse = async (course: AvailableCourse) => {
    // Mock API call for external course registration
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Registered for external course:', course.id);
    
    // Open external URL in new tab
    if (course.externalUrl) {
      window.open(course.externalUrl, '_blank');
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'satnam':
        return <BookOpen className="h-5 w-5 text-blue-500" />;
      case 'citadel-academy':
        return <GraduationCap className="h-5 w-5 text-purple-500" />;
      default:
        return <ExternalLink className="h-5 w-5 text-gray-500" />;
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

  const getEnrollmentTypeColor = (type: string) => {
    switch (type) {
      case 'immediate':
        return 'text-green-600 bg-green-50';
      case 'approval-required':
        return 'text-yellow-600 bg-yellow-50';
      case 'external':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return 'Free';
    return `${(cost / 1000).toFixed(1)}k sats`;
  };

  const filteredCourses = availableCourses.filter(course => {
    if (filterCategory !== 'all' && course.category !== filterCategory) return false;
    if (filterProvider !== 'all' && course.provider !== filterProvider) return false;
    if (searchQuery && !course.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const currentSelectedCourse = availableCourses.find(c => c.id === selectedCourseId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Course Registration</h2>
              <p className="text-blue-100">Build your cognitive capital through structured learning</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-blue-200 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {registrationStep === 'browse' && (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <h3 className="text-blue-900 font-medium mb-2">How Course Registration Works</h3>
                    <ul className="text-blue-800 text-sm space-y-1">
                      <li>• <strong>Satnam.pub courses</strong> are free and start immediately</li>
                      <li>• <strong>Citadel Academy courses</strong> require approval and may have fees</li>
                      <li>• All courses contribute to your cognitive capital score</li>
                      <li>• Complete courses to earn badges and certificates</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <label className="text-gray-700 text-sm font-medium">Search</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search courses..."
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="text-gray-700 text-sm font-medium">Category</label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Categories</option>
                    <option value="basic">Basic</option>
                    <option value="advanced">Advanced</option>
                    <option value="specialized">Specialized</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-gray-700 text-sm font-medium">Provider</label>
                  <select
                    value={filterProvider}
                    onChange={(e) => setFilterProvider(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Providers</option>
                    <option value="satnam">Satnam.pub</option>
                    <option value="citadel-academy">Citadel Academy</option>
                  </select>
                </div>
                
                <div className="flex items-end">
                  <div className="w-full text-center text-sm text-gray-600">
                    {filteredCourses.length} courses available
                  </div>
                </div>
              </div>

              {/* Course Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                {filteredCourses.map((course) => (
                  <div
                    key={course.id}
                    onClick={() => handleCourseSelect(course.id)}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all duration-300 cursor-pointer"
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
                    <p className="text-gray-600 text-sm mb-3">{course.description}</p>
                    
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Duration</span>
                        <span className="text-gray-900">{course.duration} hours</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Cost</span>
                        <span className="text-gray-900 font-medium">{formatCost(course.cost)}</span>
                      </div>
                      
                      {course.maxStudents && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Enrollment</span>
                          <span className="text-gray-900">{course.currentEnrollment}/{course.maxStudents}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-1 text-xs rounded-full ${getEnrollmentTypeColor(course.enrollmentType)}`}>
                        {course.enrollmentType === 'immediate' ? 'Start Now' : 
                         course.enrollmentType === 'approval-required' ? 'Apply' : 'External'}
                      </span>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {registrationStep === 'details' && currentSelectedCourse && (
            <div className="space-y-6">
              {/* Course Details */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{currentSelectedCourse.title}</h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        {getProviderIcon(currentSelectedCourse.provider)}
                        <span>{currentSelectedCourse.provider === 'satnam' ? 'Satnam.pub' : 'Citadel Academy'}</span>
                      </div>
                      <span className={`px-2 py-1 rounded-full border ${getDifficultyColor(currentSelectedCourse.difficulty)}`}>
                        {currentSelectedCourse.difficulty}
                      </span>
                      <span className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>{currentSelectedCourse.duration} hours</span>
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">{formatCost(currentSelectedCourse.cost)}</div>
                    <div className="text-sm text-gray-600">
                      {currentSelectedCourse.enrollmentType === 'immediate' ? 'Start immediately' : 
                       currentSelectedCourse.enrollmentType === 'approval-required' ? 'Approval required' : 'External course'}
                    </div>
                  </div>
                </div>

                <p className="text-gray-700 mb-6">{currentSelectedCourse.description}</p>

                {/* Prerequisites */}
                {currentSelectedCourse.prerequisites.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">Prerequisites</h4>
                    <div className="flex flex-wrap gap-2">
                      {currentSelectedCourse.prerequisites.map((prereq: string) => (
                        <span key={prereq} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                          {prereq}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Syllabus */}
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">What You'll Learn</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h5 className="font-medium text-gray-900 mb-2">Syllabus</h5>
                      <ul className="space-y-1">
                        {currentSelectedCourse.syllabus.map((item: string, index: number) => (
                          <li key={index} className="flex items-start space-x-2 text-sm text-gray-600">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium text-gray-900 mb-2">Learning Outcomes</h5>
                      <ul className="space-y-1">
                        {currentSelectedCourse.learningOutcomes.map((outcome: string, index: number) => (
                          <li key={index} className="flex items-start space-x-2 text-sm text-gray-600">
                            <Target className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <span>{outcome}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Course Info */}
                <div className="grid md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{currentSelectedCourse.badges.length}</div>
                    <div className="text-sm text-gray-600">Badges Available</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{currentSelectedCourse.certificateType}</div>
                    <div className="text-sm text-gray-600">Certificate Type</div>
                  </div>
                  {currentSelectedCourse.instructor && (
                    <div className="text-center">
                      <div className="text-lg font-semibold text-gray-900">{currentSelectedCourse.instructor}</div>
                      <div className="text-sm text-gray-600">Instructor</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-4">
                <button
                  onClick={() => setRegistrationStep('browse')}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back to Courses
                </button>
                <button
                  onClick={() => setRegistrationStep('confirm')}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {currentSelectedCourse.provider === 'satnam' ? 'Enroll Now' : 'Apply for Enrollment'}
                </button>
              </div>
            </div>
          )}

          {registrationStep === 'confirm' && currentSelectedCourse && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Enrollment</h3>
                <p className="text-gray-600">You're about to enroll in <strong>{currentSelectedCourse.title}</strong></p>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Course</span>
                    <span className="font-medium">{currentSelectedCourse.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Provider</span>
                    <span className="font-medium">{currentSelectedCourse.provider === 'satnam' ? 'Satnam.pub' : 'Citadel Academy'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Duration</span>
                    <span className="font-medium">{currentSelectedCourse.duration} hours</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cost</span>
                    <span className="font-medium">{formatCost(currentSelectedCourse.cost)}</span>
                  </div>
                  {currentSelectedCourse.startDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Start Date</span>
                      <span className="font-medium">
                        {new Date(currentSelectedCourse.startDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {currentSelectedCourse.provider === 'citadel-academy' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h4 className="text-yellow-900 font-medium mb-1">External Course Notice</h4>
                      <p className="text-yellow-800 text-sm">
                        This course is hosted on Citadel Academy. You'll be redirected to their platform for enrollment and learning.
                        Your progress will be tracked back to your Satnam.pub cognitive capital dashboard.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex space-x-4">
                <button
                  onClick={() => setRegistrationStep('details')}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleRegistration}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Confirm Enrollment
                </button>
              </div>
            </div>
          )}

          {registrationStep === 'processing' && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Processing Enrollment</h3>
              <p className="text-gray-600">Please wait while we process your course registration...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h4 className="text-red-900 font-medium mb-1">Registration Error</h4>
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CourseRegistrationModal; 