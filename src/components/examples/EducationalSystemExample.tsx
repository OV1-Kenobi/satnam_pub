/**
 * Educational System Example Component
 * Demonstrates the complete cognitive capital accounting system
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import {
  Brain,
  BookOpen,
  GraduationCap,
  Trophy,
  Target,
  TrendingUp,
  Users,
  Star,
  ArrowRight,
  Info,
  Shield,
  Lock,
  Zap,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import React, { useState } from 'react';
import EducationalDashboard from '../education/EducationalDashboard';
import CourseRegistrationModal from '../education/CourseRegistrationModal';
import ProgressModal from '../education/ProgressModal';

interface EducationalSystemExampleProps {
  userPubkey: string;
  familyId?: string;
}

const EducationalSystemExample: React.FC<EducationalSystemExampleProps> = ({
  userPubkey,
  familyId
}) => {
  const [showEducationalDashboard, setShowEducationalDashboard] = useState(false);
  const [showCourseRegistration, setShowCourseRegistration] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  const features = [
    {
      id: 'cognitive-capital',
      title: 'Cognitive Capital Accounting',
      description: 'Track and accumulate intellectual wealth through structured learning',
      icon: Brain,
      color: 'blue',
      benefits: [
        'Privacy-first learning tracking',
        'Self-sovereign credentials',
        'Bitcoin-native rewards',
        'Family knowledge accumulation'
      ]
    },
    {
      id: 'course-management',
      title: 'Course Management',
      description: 'Register for Satnam.pub and Citadel Academy courses',
      icon: BookOpen,
      color: 'green',
      benefits: [
        'Free Satnam.pub basic courses',
        'Advanced Citadel Academy courses',
        'Progress tracking and analytics',
        'Badge and certificate earning'
      ]
    },
    {
      id: 'progress-tracking',
      title: 'Progress Tracking',
      description: 'Monitor learning progress with detailed analytics',
      icon: TrendingUp,
      color: 'purple',
      benefits: [
        'Module-by-module progress',
        'Quiz score tracking',
        'Time investment analytics',
        'Learning pathway completion'
      ]
    },
    {
      id: 'badge-system',
      title: 'Badge System',
      description: 'Earn verifiable achievements and credentials',
      icon: Trophy,
      color: 'yellow',
      benefits: [
        'NIP-58 compliant badges',
        'WoT mentor verification',
        'Non-transferable achievements',
        'Privacy-preserving credentials'
      ]
    },
    {
      id: 'learning-pathways',
      title: 'Learning Pathways',
      description: 'Structured educational journeys for specific goals',
      icon: Target,
      color: 'orange',
      benefits: [
        'Curated course sequences',
        'Difficulty progression',
        'Special pathway badges',
        'Family learning coordination'
      ]
    },
    {
      id: 'family-integration',
      title: 'Family Integration',
      description: 'Coordinate learning across family members',
      icon: Users,
      color: 'indigo',
      benefits: [
        'Family learning goals',
        'Shared cognitive capital',
        'Guardian oversight',
        'Collective achievements'
      ]
    }
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100';
      case 'green':
        return 'bg-green-50 border-green-200 text-green-900 hover:bg-green-100';
      case 'purple':
        return 'bg-purple-50 border-purple-200 text-purple-900 hover:bg-purple-100';
      case 'yellow':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900 hover:bg-yellow-100';
      case 'orange':
        return 'bg-orange-50 border-orange-200 text-orange-900 hover:bg-orange-100';
      case 'indigo':
        return 'bg-indigo-50 border-indigo-200 text-indigo-900 hover:bg-indigo-100';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-gray-100';
    }
  };

  const getIconColor = (color: string) => {
    switch (color) {
      case 'blue':
        return 'text-blue-600';
      case 'green':
        return 'text-green-600';
      case 'purple':
        return 'text-purple-600';
      case 'yellow':
        return 'text-yellow-600';
      case 'orange':
        return 'text-orange-600';
      case 'indigo':
        return 'text-indigo-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Brain className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Cognitive Capital Accounting System
        </h1>
        <p className="text-xl text-gray-600 mb-6 max-w-3xl mx-auto">
          Build sovereign knowledge and accumulate intellectual wealth through structured learning.
          Track your educational journey with privacy-first, Bitcoin-native credentials.
        </p>
        
        {/* Key Principles */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <div className="flex items-center space-x-2 px-3 py-2 bg-blue-100 text-blue-800 rounded-full">
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium">Privacy-First</span>
          </div>
          <div className="flex items-center space-x-2 px-3 py-2 bg-green-100 text-green-800 rounded-full">
            <Lock className="h-4 w-4" />
            <span className="text-sm font-medium">Self-Sovereign</span>
          </div>
          <div className="flex items-center space-x-2 px-3 py-2 bg-orange-100 text-orange-800 rounded-full">
            <Zap className="h-4 w-4" />
            <span className="text-sm font-medium">Bitcoin-Native</span>
          </div>
          <div className="flex items-center space-x-2 px-3 py-2 bg-purple-100 text-purple-800 rounded-full">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">Family-Focused</span>
          </div>
        </div>

        {/* Primary Action Button */}
        <button
          onClick={() => setShowEducationalDashboard(true)}
          className="flex items-center space-x-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl mx-auto"
        >
          <Brain className="h-6 w-6" />
          <span>Open Cognitive Capital Dashboard</span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      {/* Feature Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.id}
              className={`border-2 rounded-xl p-6 transition-all duration-300 cursor-pointer ${getColorClasses(feature.color)}`}
              onClick={() => setSelectedFeature(feature.id)}
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className={`p-2 rounded-lg ${getColorClasses(feature.color).replace('hover:bg-', 'bg-')}`}>
                  <Icon className={`h-6 w-6 ${getIconColor(feature.color)}`} />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
              </div>
              <p className="text-sm mb-4 opacity-80">{feature.description}</p>
              <ul className="space-y-2">
                {feature.benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start space-x-2 text-sm">
                    <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Quick Actions</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <button
            onClick={() => setShowCourseRegistration(true)}
            className="flex flex-col items-center space-y-3 p-6 border-2 border-green-200 rounded-xl hover:border-green-300 hover:bg-green-50 transition-all duration-300"
          >
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Register for Course</h3>
            <p className="text-sm text-gray-600 text-center">
              Browse and enroll in Satnam.pub or Citadel Academy courses
            </p>
          </button>

          <button
            onClick={() => setShowProgressModal(true)}
            className="flex flex-col items-center space-y-3 p-6 border-2 border-purple-200 rounded-xl hover:border-purple-300 hover:bg-purple-50 transition-all duration-300"
          >
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">View Progress</h3>
            <p className="text-sm text-gray-600 text-center">
              Track your learning progress and achievements
            </p>
          </button>

          <button
            onClick={() => setShowEducationalDashboard(true)}
            className="flex flex-col items-center space-y-3 p-6 border-2 border-blue-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all duration-300"
          >
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <Brain className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Full Dashboard</h3>
            <p className="text-sm text-gray-600 text-center">
              Access complete cognitive capital accounting
            </p>
          </button>
        </div>
      </div>

      {/* System Overview */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-8 border border-blue-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">System Overview</h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                  1
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">Register for Courses</h4>
                  <p className="text-sm text-gray-600">Choose from Satnam.pub basic courses or Citadel Academy advanced courses</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                  2
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">Track Progress</h4>
                  <p className="text-sm text-gray-600">Monitor module completion, quiz scores, and time investment</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                  3
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">Earn Credentials</h4>
                  <p className="text-sm text-gray-600">Receive badges, certificates, and build cognitive capital score</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                  4
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">Family Integration</h4>
                  <p className="text-sm text-gray-600">Share knowledge and coordinate learning across family members</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Features</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm text-gray-700">Privacy-first design with no external logging</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm text-gray-700">Self-sovereign credentials using Nostr</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm text-gray-700">Bitcoin-native rewards and incentives</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm text-gray-700">Family federation support</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm text-gray-700">WoT mentor verification system</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm text-gray-700">Learning pathway coordination</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Integration Instructions */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mt-8">
        <div className="flex items-start space-x-3">
          <Info className="h-6 w-6 text-yellow-600 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-yellow-900 mb-2">Integration Instructions</h3>
            <p className="text-yellow-800 mb-4">
              The Cognitive Capital Accounting system is now integrated into your financial dashboards.
              Access it via the "Cognitive Capital Accounting" button in the Quick Actions section.
            </p>
            <div className="space-y-2 text-sm text-yellow-800">
              <p><strong>Individual Dashboard:</strong> Personal learning tracking and course management</p>
              <p><strong>Family Dashboard:</strong> Family-wide educational coordination and progress</p>
              <p><strong>API Integration:</strong> Educational data is stored in Supabase with privacy-first design</p>
              <p><strong>Database:</strong> Migration 007_educational_system.sql creates all necessary tables</p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showEducationalDashboard && (
        <EducationalDashboard
          userPubkey={userPubkey}
          familyId={familyId}
          onClose={() => setShowEducationalDashboard(false)}
        />
      )}

      {showCourseRegistration && (
        <CourseRegistrationModal
          isOpen={showCourseRegistration}
          onClose={() => setShowCourseRegistration(false)}
          userPubkey={userPubkey}
          familyId={familyId}
          onRegistrationComplete={() => setShowCourseRegistration(false)}
        />
      )}

      {showProgressModal && (
        <ProgressModal
          isOpen={showProgressModal}
          onClose={() => setShowProgressModal(false)}
          userPubkey={userPubkey}
          familyId={familyId}
        />
      )}
    </div>
  );
};

export default EducationalSystemExample; 