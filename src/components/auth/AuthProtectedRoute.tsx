import { Baby, Crown, Shield, Users } from "lucide-react";
import React, { useState } from "react";
import { FamilyFederationAuthWrapper, useAuth } from "./FamilyFederationAuth";
import NWCOTPSignIn from "./NWCOTPSignIn";

interface AuthProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  allowedRoles?: ('parent' | 'child' | 'guardian')[];
  title?: string;
  description?: string;
}

const AuthProtectedRoute: React.FC<AuthProtectedRouteProps> = ({
  children,
  requireAuth = true,
  allowedRoles = ['parent', 'child', 'guardian'],
  title = "Family Financials",
  description = "Access your family's Bitcoin treasury and Lightning channels",
}) => {
  const { isAuthenticated } = useAuth();
  const [showSignIn, setShowSignIn] = useState(!isAuthenticated);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'parent':
        return <Crown className="h-5 w-5" />;
      case 'guardian':
        return <Shield className="h-5 w-5" />;
      case 'child':
        return <Baby className="h-5 w-5" />;
      default:
        return <Users className="h-5 w-5" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'parent':
        return 'text-yellow-400';
      case 'guardian':
        return 'text-blue-400';
      case 'child':
        return 'text-green-400';
      default:
        return 'text-purple-400';
    }
  };

  const AuthenticationGate = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-purple-900 rounded-2xl p-8 max-w-lg w-full border border-yellow-400/20 text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <Shield className="h-10 w-10 text-white" />
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-4">{title}</h1>
        <p className="text-purple-200 mb-8">{description}</p>

        {/* Family Federation Info */}
        <div className="bg-white/10 rounded-xl p-6 mb-8 border border-white/20">
          <h3 className="text-white font-bold text-lg mb-4 flex items-center justify-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Family Federation Access</span>
          </h3>
          
          <div className="space-y-3">
            <p className="text-purple-200 text-sm">
              This area is protected by Family Federation whitelist. Only authorized family members can access financial data.
            </p>
            
            <div className="flex flex-wrap justify-center gap-2">
              {allowedRoles.map((role) => (
                <div
                  key={role}
                  className={`flex items-center space-x-1 px-3 py-1 rounded-full bg-white/10 border border-white/20 ${getRoleColor(role)}`}
                >
                  {getRoleIcon(role)}
                  <span className="text-sm font-medium capitalize">{role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Authentication Methods */}
        <div className="space-y-4">
          <h4 className="text-white font-semibold">Choose your authentication method:</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-lg p-4 border border-orange-400/30">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <span className="text-white font-medium">NWC</span>
              </div>
              <p className="text-orange-200 text-xs">
                Fast wallet-based authentication
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg p-4 border border-blue-400/30">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <span className="text-white font-medium">OTP</span>
              </div>
              <p className="text-blue-200 text-xs">
                Secure code via Nostr DM
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowSignIn(true)}
          className="w-full mt-8 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center space-x-2"
        >
          <Shield className="h-5 w-5" />
          <span>Access Family Financials</span>
        </button>
      </div>

      {/* Sign In Modal */}
      <NWCOTPSignIn
        isOpen={showSignIn}
        onClose={() => setShowSignIn(false)}
      />
    </div>
  );

  return (
    <FamilyFederationAuthWrapper
      requireAuth={requireAuth}
      allowedRoles={allowedRoles}
      fallback={<AuthenticationGate />}
    >
      {children}
    </FamilyFederationAuthWrapper>
  );
};

export default AuthProtectedRoute;