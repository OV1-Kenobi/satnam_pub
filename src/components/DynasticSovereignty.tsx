import {
  Crown,
  Shield,
  Sword,
  Heart,
  Brain,
  Zap,
  Users,
  Key,
  Hammer,
  Wrench,
  Eye,
  ArrowLeft,
  ArrowRight,
  Star,
  CheckCircle,
  Bitcoin
} from 'lucide-react';
import React, { useState } from 'react';

interface DynasticSovereigntyProps {
  onBack: () => void;
  onStartFoundry: () => void;
  onAuthRequired: () => void;
}

const DynasticSovereignty: React.FC<DynasticSovereigntyProps> = ({ onBack, onStartFoundry, onAuthRequired }) => {
  const [activeStep, setActiveStep] = useState(1);

  const steps = [
    {
      id: 1,
      title: "Chart Your Family's Future",
      subtitle: "Establish Your Values, Vision, and Mission",
      content: (
        <div className="space-y-6">
          <div className="bg-blue-500/20 rounded-xl p-4 border border-blue-400/30 mb-6">
            <p className="text-black text-base font-bold">
              🎯 <strong>Your Family's Values:</strong> These examples show the foundation of Truth, Honor, Justice, Work, and Service. 
              You will define what values guide your family's decisions and actions.
            </p>
          </div>
          <div className="bg-purple-100/25 backdrop-blur-sm rounded-2xl p-6 border border-white/30 shadow-lg">
            <h3 className="text-2xl font-bold text-black mb-4 flex items-center space-x-2 font-medieval">
              <Bitcoin className="h-7 w-7 text-yellow-600" />
              <span>Example Values</span>
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-purple-800 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-black text-lg">Truth</h4>
                    <p className="text-black text-base font-bold">Regarding who we are, who we know, who knows us, and knows we know what we know, are capable of, and we have done</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-purple-800 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-black text-lg">Honor</h4>
                    <p className="text-black text-base font-bold">For ourselves, our elders, our spouses, our boundaries, and our peers</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-purple-800 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-black text-lg">Justice</h4>
                    <p className="text-black text-base font-bold">Equal opportunities, fair evaluations, and equitable distributions based off value delivered</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-purple-800 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-black text-lg">Work</h4>
                    <p className="text-black text-base font-bold">Real value provided through energy, compute power, mental/physical labor, and creative gifts</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-purple-800 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-black text-lg">Service</h4>
                    <p className="text-black text-base font-bold">Service to our families and our fellow peers, to the land, and to the Creator of it All</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "Roles, Responsibilities, Rights & Rewards",
      subtitle: "Found Your Family Federation Structures",
      content: (
        <div className="space-y-6">
          <div className="bg-green-500/20 rounded-xl p-4 border border-green-400/30 mb-6">
            <p className="text-black text-base font-bold">
              ⚔️ <strong>Your Family's Round Table:</strong> These example roles show how to structure your family's governance. 
              You will define who does what, who decides what, and how your family operates as a sovereign unit.
            </p>
          </div>
          <div className="bg-purple-100/25 backdrop-blur-sm rounded-2xl p-6 border border-white/30 shadow-lg">
            <h3 className="text-2xl font-bold text-black mb-4 font-medieval">Example Round Table Roles</h3>
            <p className="text-black mb-6 text-lg font-bold">
              These roles demonstrate how to establish rights, responsibilities, and rewards for each position in your family's hierarchy.
            </p>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-purple-800/30 rounded-xl p-4 border border-purple-500/30">
                <div className="flex items-center space-x-3 mb-3">
                  <Crown className="h-6 w-6 text-yellow-400" />
                  <h4 className="font-bold text-black text-lg">Arthur</h4>
                </div>
                <p className="text-black text-base font-bold mb-2">The intellectual leader who leads with his/her mind, vision, and creativity</p>
                <p className="text-black text-sm font-bold">Responsible for crafting the family's navigational plan, curating intellectual capital, and avoiding potential disasters</p>
              </div>

              <div className="bg-pink-800/30 rounded-xl p-4 border border-pink-500/30">
                <div className="flex items-center space-x-3 mb-3">
                  <Heart className="h-6 w-6 text-pink-400" />
                  <h4 className="font-bold text-black text-lg">Guinevere</h4>
                </div>
                <p className="text-black text-base font-bold mb-2">The emotional leader who leads with her/his heart</p>
                <p className="text-black text-sm font-bold">Responsible for the bonds that bind the family together through compassion and future generation considerations</p>
              </div>

              <div className="bg-blue-800/30 rounded-xl p-4 border border-blue-500/30">
                <div className="flex items-center space-x-3 mb-3">
                  <Sword className="h-6 w-6 text-blue-400" />
                  <h4 className="font-bold text-black text-lg">Lancelot</h4>
                </div>
                <p className="text-black text-base font-bold mb-2">The 1st Knight, who gets done what needs to be done, the chief operational officer</p>
                <p className="text-black text-sm font-bold">Responsible for putting the navigational plan into action, delegating tasks and communicating plans</p>
              </div>

              <div className="bg-green-800/30 rounded-xl p-4 border border-green-500/30">
                <div className="flex items-center space-x-3 mb-3">
                  <Shield className="h-6 w-6 text-green-400" />
                  <h4 className="font-bold text-black text-lg">Galahad</h4>
                </div>
                <p className="text-black text-base font-bold mb-2">The spiritual counselor keeping the family on track</p>
                <p className="text-black text-sm font-bold">Responsible for long-term physical, emotional, environmental, social, and spiritual impacts</p>
              </div>

              <div className="bg-purple-800/30 rounded-xl p-4 border border-purple-500/30">
                <div className="flex items-center space-x-3 mb-3">
                  <Zap className="h-6 w-6 text-purple-400" />
                  <h4 className="font-bold text-black text-lg">Merlin</h4>
                </div>
                <p className="text-black text-base font-bold mb-2">The financial Wizard and wealth cultivation expert</p>
                <p className="text-black text-sm font-bold">Responsible for remaining cognizant of risks, rewards, and responsibilities of treasury management</p>
              </div>

              <div className="bg-yellow-800/30 rounded-xl p-4 border border-yellow-500/30">
                <div className="flex items-center space-x-3 mb-3">
                  <Key className="h-6 w-6 text-yellow-400" />
                  <h4 className="font-bold text-black text-lg">Aunt Alice</h4>
                </div>
                <p className="text-black text-base font-bold mb-2">The family Treasurer keeping the keys safe</p>
                <p className="text-black text-sm font-bold">Responsible for creating, rotating, sharing, and protecting keys to accounts and wallets</p>
              </div>

              <div className="bg-orange-800/30 rounded-xl p-4 border border-orange-500/30">
                <div className="flex items-center space-x-3 mb-3">
                  <Hammer className="h-6 w-6 text-orange-400" />
                  <h4 className="font-bold text-black text-lg">Uncle Bob</h4>
                </div>
                <p className="text-black text-base font-bold mb-2">The builder of castles, vaults, and infrastructure</p>
                <p className="text-black text-sm font-bold">Responsible for curating, creating, and maintaining the physical infrastructure the family relies upon</p>
              </div>

              <div className="bg-indigo-800/30 rounded-xl p-4 border border-indigo-500/30">
                <div className="flex items-center space-x-3 mb-3">
                  <Wrench className="h-6 w-6 text-indigo-400" />
                  <h4 className="font-bold text-black text-lg">Uncle Adam</h4>
                </div>
                <p className="text-black text-base font-bold mb-2">The tech expert setting up servers and networks</p>
                <p className="text-black text-sm font-bold">Responsible for Lightning Network, payment channels, and defending against digital attacks</p>
              </div>

              <div className="bg-red-800/30 rounded-xl p-4 border border-red-500/30">
                <div className="flex items-center space-x-3 mb-3">
                  <Eye className="h-6 w-6 text-red-400" />
                  <h4 className="font-bold text-black text-lg">Grandpa Satoshi</h4>
                </div>
                <p className="text-black text-base font-bold mb-2">The legacy protector tasked with ensuring leaderships' fulfillment of their roles</p>
                <p className="text-black text-sm font-bold">Responsible for ensuring everyone fulfills their roles, meets their responsibilities, and reaps rewards accordingly</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: "Form Family Alliances",
      subtitle: "Build Your Family's Foundation",
      content: (
        <div className="space-y-6">
          <div className="bg-purple-500/20 rounded-xl p-4 border border-purple-400/30 mb-6">
            <p className="text-black text-base font-bold">
              🤝 <strong>Your Family's Alliances:</strong> These examples show how to build strategic partnerships. 
              You will identify which families share your values and how to create mutual prosperity through collaboration.
            </p>
          </div>
          <div className="bg-purple-100/25 backdrop-blur-sm rounded-2xl p-6 border border-white/30 shadow-lg">
            <h3 className="text-2xl font-bold text-black mb-4 flex items-center space-x-2 font-medieval">
              <Users className="h-7 w-7 text-blue-600" />
              <span>Example Alliance Framework</span>
            </h3>
            <p className="text-black mb-6 text-lg font-bold">
              These examples demonstrate how to invite trusted peers who share your values, vision, and mission. 
              You will create your own alliance criteria and partnership structures.
            </p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-blue-800/30 rounded-xl p-6 border border-blue-500/30">
                <h4 className="font-bold text-black mb-3 text-lg">Example: Value Alignment</h4>
                <p className="text-black text-base font-bold mb-4">
                  Ensure all members share the core values of Truth, Honor, Justice, Work, and Service.
                </p>
                <ul className="space-y-2 text-black text-base font-bold">
                  <li>• Shared commitment to family sovereignty</li>
                  <li>• Alignment with Bitcoin principles</li>
                  <li>• Respect for individual autonomy</li>
                  <li>• Commitment to multigenerational thinking</li>
                </ul>
              </div>

              <div className="bg-green-800/30 rounded-xl p-6 border border-green-500/30">
                <h4 className="font-bold text-black mb-3 text-lg">Example: Vision Alignment</h4>
                <p className="text-black text-base font-bold mb-4">
                  Ensure all members understand and commit to the family's long-term vision and direction.
                </p>
                <ul className="space-y-2 text-black text-base font-bold">
                  <li>• Building enduring family wealth</li>
                  <li>• Preserving cognitive capital</li>
                  <li>• Maintaining financial sovereignty</li>
                  <li>• Serving future generations</li>
                </ul>
              </div>

              <div className="bg-purple-800/30 rounded-xl p-6 border border-purple-500/30">
                <h4 className="font-bold text-black mb-3 text-lg">Example: Mission Alignment</h4>
                <p className="text-black text-base font-bold mb-4">
                  Ensure all members understand their role in achieving the family's mission and purpose.
                </p>
                <ul className="space-y-2 text-black text-base font-bold">
                  <li>• Active participation in family governance</li>
                  <li>• Commitment to role responsibilities</li>
                  <li>• Continuous learning and growth</li>
                  <li>• Protection of family interests</li>
                </ul>
              </div>

              <div className="bg-yellow-800/30 rounded-xl p-6 border border-yellow-500/30">
                <h4 className="font-bold text-black mb-3 text-lg">Example: Family Council Formation</h4>
                <p className="text-black text-base font-bold mb-4">
                  Establish the governance structure for collaborative decision-making and family leadership.
                </p>
                <ul className="space-y-2 text-black text-base font-bold">
                  <li>• Regular family council meetings</li>
                  <li>• Consensus-based decision making</li>
                  <li>• Role-based voting rights</li>
                  <li>• Conflict resolution procedures</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-700"
      style={{
        backgroundImage: 'url(/citadel-fortress-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center 20%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Overlay for better text readability */}
      <div 
        className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-purple-800/30 to-purple-700/40"
        style={{ zIndex: 0 }}
      />
      <div className="relative z-10 w-full">
      {/* Header */}
      <div className="bg-purple-800/40 backdrop-blur-sm border-b border-white/30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="text-white hover:text-purple-200 transition-colors duration-200"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-4xl font-bold text-white font-medieval">Dynastic Sovereignty</h1>
                <p className="text-purple-200 text-lg font-bold">Family Federation Founders - Craft Your Dynasty's Foundation</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                    step.id <= activeStep
                      ? "bg-yellow-500 text-white"
                      : "bg-white/20 text-purple-200"
                  }`}
                >
                  {step.id < activeStep ? <CheckCircle className="h-6 w-6" /> : step.id}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-1 w-8 mx-2 transition-all duration-300 ${
                      step.id < activeStep ? "bg-yellow-500" : "bg-white/20"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-purple-100/20 backdrop-blur-sm rounded-2xl p-8 border border-white/30 shadow-lg">
          <div className="text-center mb-8">
            <div className="bg-purple-800/40 backdrop-blur-sm rounded-xl p-6 border border-white/30 shadow-lg mb-4">
              <h2 className="text-3xl font-bold text-black mb-2 font-medieval">{steps[activeStep - 1].title}</h2>
              <p className="text-black text-lg font-bold">{steps[activeStep - 1].subtitle}</p>
              {activeStep === 1 && (
                <div className="mt-4 p-4 bg-yellow-500/20 rounded-lg border border-yellow-400/30">
                  <p className="text-black text-base font-bold">
                    💎 <strong>Family Federation Founders:</strong> These are examples to inspire your own family's charter. 
                    You will craft your unique values, vision, mission, and roles that reflect your family's sovereign path.
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {steps[activeStep - 1].content}

          {/* Navigation */}
          <div className="flex justify-end items-center mt-8 pt-6 border-t border-white/20">

            {activeStep === steps.length ? (
              <div className="w-full flex justify-center mt-8">
                <button
                  onClick={onAuthRequired}
                  className="flex items-center space-x-3 px-12 py-4 rounded-xl font-bold transition-all duration-300 bg-purple-800 hover:bg-purple-900 text-black transform hover:scale-105 shadow-lg hover:shadow-xl text-xl"
                >
                  <Crown className="h-6 w-6 text-yellow-400" />
                  <span>Found Your Family's Dynasty</span>
                  <ArrowRight className="h-6 w-6" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setActiveStep(activeStep + 1)}
                className="flex items-center space-x-2 px-6 py-3 rounded-lg font-bold transition-all duration-300 bg-purple-700 hover:bg-purple-800 text-white"
              >
                <span>Next</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default DynasticSovereignty; 