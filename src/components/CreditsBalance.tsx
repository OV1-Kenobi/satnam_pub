/**
 * Course Credits Balance Component for Financial Dashboards
 * 
 * Displays user's EDUCATIONAL COURSE CREDITS balance with referral tracking
 * These are credits for unlocking educational content, NOT monetary credits
 * Designed to integrate into Individual and Family Financial dashboards
 */

import { Award, Gift, TrendingUp, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

interface CreditsBalanceProps {
  variant?: 'individual' | 'family'
  className?: string
}

interface CourseCreditsData {
  totalCredits: number
  pendingCredits: number
  referralsCompleted: number
  referralsPending: number
  recentActivity: {
    type: 'earned' | 'pending' | 'spent'
    amount: number
    description: string
    timestamp: string
  }[]
}

export function CreditsBalance({ 
  variant = 'individual',
  className = ""
}: CreditsBalanceProps) {
  const [creditsData, setCreditsData] = useState<CourseCreditsData>({
    totalCredits: 0,
    pendingCredits: 0,
    referralsCompleted: 0,
    referralsPending: 0,
    recentActivity: []
  })
  const [loading, setLoading] = useState(true)
  const [showReferralModal, setShowReferralModal] = useState(false)

  // Fetch course credits data
  useEffect(() => {
    const fetchCourseCredits = async () => {
      try {
        const response = await fetch('/api/authenticated/user-credits', {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
            'Content-Type': 'application/json'
            // PRIVACY: Using secure Bearer token authentication
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          setCreditsData(data)
        }
      } catch (error) {
        console.error('Failed to fetch course credits:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchCourseCredits()
    // Refresh every 30 seconds
    const interval = setInterval(fetchCourseCredits, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className={`bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-xl p-6 border border-yellow-500/20 animate-pulse ${className}`}>
        <div className="h-6 bg-white/10 rounded mb-4"></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 bg-white/10 rounded"></div>
          <div className="h-16 bg-white/10 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-xl p-6 border border-yellow-500/20 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
          <Award className="h-5 w-5 text-yellow-400" />
          <span>Course Credits</span>
        </h3>
        
        <button
          onClick={() => setShowReferralModal(true)}
          className="text-sm text-yellow-400 hover:text-yellow-300 transition-colors flex items-center space-x-1"
        >
          <Users className="h-4 w-4" />
          <span>Referrals</span>
        </button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center p-4 bg-white/5 rounded-lg">
          <div className="text-3xl font-bold text-yellow-400 mb-1">
            {creditsData.totalCredits}
          </div>
          <div className="text-sm text-yellow-300">Available Course Credits</div>
        </div>
        
        <div className="text-center p-4 bg-white/5 rounded-lg">
          <div className="text-3xl font-bold text-orange-400 mb-1">
            {creditsData.pendingCredits}
          </div>
          <div className="text-sm text-orange-300">Pending Course Credits</div>
        </div>
      </div>

      {/* Referral Summary */}
      <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg mb-4">
        <div className="flex items-center space-x-2">
          <Gift className="h-4 w-4 text-green-400" />
          <span className="text-green-300 text-sm">Educational Referral Rewards</span>
        </div>
        <div className="flex space-x-4 text-sm">
          <span className="text-green-400">
            {creditsData.referralsCompleted} ✓
          </span>
          <span className="text-yellow-400">
            {creditsData.referralsPending} ⏳
          </span>
        </div>
      </div>

      {/* Recent Activity Preview */}
      {creditsData.recentActivity.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-white mb-2 flex items-center space-x-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <span>Recent Activity</span>
          </h4>
          <div className="space-y-2 max-h-24 overflow-y-auto">
            {creditsData.recentActivity.slice(0, 2).map((activity, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-2 rounded text-xs bg-white/5"
              >
                <div className="flex items-center space-x-2">
                  {activity.type === 'earned' && <Gift className="h-3 w-3 text-green-400" />}
                  {activity.type === 'pending' && <Award className="h-3 w-3 text-yellow-400" />}
                  {activity.type === 'spent' && <TrendingUp className="h-3 w-3 text-blue-400" />}
                  <span className="text-white truncate max-w-32">{activity.description}</span>
                </div>
                <span className={`font-medium ${
                  activity.type === 'earned' ? 'text-green-400' :
                  activity.type === 'pending' ? 'text-yellow-400' :
                  'text-blue-400'
                }`}>
                  {activity.type === 'spent' ? '-' : '+'}{activity.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Earn More Credits CTA */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <button
          onClick={() => setShowReferralModal(true)}
          className="w-full bg-gradient-to-r from-green-500/20 to-emerald-500/20 hover:from-green-500/30 hover:to-emerald-500/30 border border-green-500/30 text-green-300 font-medium py-2 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
        >
          <Gift className="h-4 w-4" />
          <span>Invite Friends & Earn Course Credits</span>
        </button>
      </div>

      {/* Note: ReferralModal would be implemented separately and conditionally rendered */}
    </div>
  )
}