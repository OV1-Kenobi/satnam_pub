import { ArrowRight, BookOpen, CheckCircle, Crown, FileText, GraduationCap, Lightbulb, Sparkles } from 'lucide-react';
import React from 'react';
import { Helmet } from 'react-helmet-async';

interface FamilyFoundryLandingPageProps {
  onClaimName: () => void;
  onSignIn: () => void;
  onStartFoundry?: () => void;
}

const FamilyFoundryLandingPage: React.FC<FamilyFoundryLandingPageProps> = ({
  onClaimName,
  onSignIn,
  onStartFoundry
}) => {
  return (
    <>
      {/* SEO Meta Tags - Optimized for Family Foundry */}
      <Helmet>
        <title>Family Foundry - Build Your Dynastic Sovereignty | Satnam.pub</title>
        <meta
          name="description"
          content="Run the Family Like a Business - But Govern It Like a Kingdom. Create your family federation with charter, RBAC, and multigenerational wealth stewardship on Satnam.pub."
        />
        <meta property="og:title" content="Family Foundry - Build Your Dynastic Sovereignty | Satnam.pub" />
        <meta
          property="og:description"
          content="Run the Family Like a Business - But Govern It Like a Kingdom. Create your family federation with charter, RBAC, and multigenerational wealth stewardship."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${typeof window !== 'undefined' ? window.location.origin : 'https://www.satnam.pub'}/family-foundry`} />
        <meta property="og:image" content={`${typeof window !== 'undefined' ? window.location.origin : 'https://www.satnam.pub'}/family-foundry-og.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Family Foundry - Build Your Dynastic Sovereignty" />
        <meta
          name="twitter:description"
          content="Run the Family Like a Business - But Govern It Like a Kingdom. Create your family federation on Satnam.pub."
        />
        <meta name="twitter:image" content={`${typeof window !== 'undefined' ? window.location.origin : 'https://www.satnam.pub'}/family-foundry-og.jpg`} />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-purple-800 relative">
        {/* Background Image - Citadel Valley */}
        <div
          className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-20 pointer-events-none"
          style={{ backgroundImage: 'url(/BitcoinCitadelValley.jpg)' }}
        />

        {/* Hero Section */}
        <div className="relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
            <div className="text-center">
              {/* Satnam Logo as Seal */}
              <div className="inline-flex items-center justify-center mb-6">
                <img
                  src="/SatNam.Pub-large-transparency-logo.png"
                  alt="Satnam.pub - Family Foundry Seal"
                  className="w-40 h-40 md:w-48 md:h-48 drop-shadow-2xl"
                />
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
                  Run The Family Like A Public Business
                </span>
                <br />
                <span className="text-purple-600" style={{ textShadow: '0 0 20px rgba(255, 255, 255, 0.8), 0 0 30px rgba(255, 255, 255, 0.6)' }}>
                  Govern It Like A Private Kingdom
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-purple-100 mb-8 max-w-3xl mx-auto">
                Build your family federation with structure, sovereignty, and sacred stewardship for multigenerational wealth.
              </p>

              {/* Primary CTA */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button
                  onClick={onClaimName}
                  className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 flex items-center space-x-2 shadow-xl hover:shadow-2xl transform hover:scale-105"
                >
                  <Sparkles className="h-5 w-5" />
                  <span>Claim Your Name</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  onClick={onSignIn}
                  className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold py-4 px-8 rounded-lg transition-all duration-300 border border-white/20"
                >
                  Sign In
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Four Faces of the Tetrahedron */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">Dynastic Family Rule Requires Good Rules AND Rulers</h2>
            <p className="text-xl text-purple-200 mb-2">
              Four interconnected faces of the Dynastic Governance Tetrahedron
            </p>
            <p className="text-lg text-purple-300 italic">
              Each face shares an edge and vertex with the other three—creating a stable, self-supporting structure
            </p>
          </div>

          {/* Tetrahedron Image */}
          <div className="flex justify-center mb-12">
            <img
              src="/Tetrahedron-of-Control-satnam.png"
              alt="Dynastic Governance Tetrahedron - Four interconnected faces of family rule"
              className="max-w-md w-full rounded-xl shadow-2xl border border-white/20"
            />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Face 1: Business Structure */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20 hover:bg-white/15 transition-all duration-300">
              <div className="flex justify-center mb-6">
                <img
                  src="/SatNam.Pub-large-transparency-logo.png"
                  alt="Satnam Seal"
                  className="w-16 h-16 object-contain"
                />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Run the Family as a Business</h3>
              <ul className="space-y-3 text-purple-100">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Clear roles & documented systems</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Transparent ledgers & annual reviews</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Formalized succession planning</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Legacy planning beyond founders</span>
                </li>
              </ul>
            </div>

            {/* Face 2: Kingdom Governance */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20 hover:bg-white/15 transition-all duration-300">
              <div className="flex justify-center mb-6">
                <img
                  src="/Dynastic-App.png"
                  alt="Dynastic Kingdom"
                  className="w-16 h-16 object-contain"
                />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Govern It Like a Kingdom</h3>
              <ul className="space-y-3 text-purple-100">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Meetings open with blessing & ceremony</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Roles inherited with ritual & reverence</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Elders consulted with honor</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Sacred stewardship of resources</span>
                </li>
              </ul>
            </div>

            {/* Face 3: Stewardship */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20 hover:bg-white/15 transition-all duration-300">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-purple-900 rounded-full flex items-center justify-center shadow-lg p-0.5">
                  <img
                    src="/LN-Bitcoin-icon.png"
                    alt="Lightning Bitcoin"
                    className="w-20 h-20 object-contain"
                  />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Wealth Stewardship Is The Goal</h3>
              <ul className="space-y-3 text-purple-100">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-orange-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Wealth is not the goal—stewardship is</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-orange-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Meaningful continuity over mere accumulation</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-orange-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Family constitutions & trust structures</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-orange-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Decisions serve the lineage, not lifestyle</span>
                </li>
              </ul>
            </div>

            {/* Pillar 4: Cognitive Capital Cultivation */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20 hover:bg-white/15 transition-all duration-300">
              <div className="flex justify-center mb-6">
                <img
                  src="/Citadel-Academy-Logo.png"
                  alt="Citadel Academy"
                  className="h-20 w-auto object-contain"
                />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Cognitive Capital Cultivation</h3>
              <ul className="space-y-3 text-purple-100">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-indigo-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Family Knowledge Vault creation & protection</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-indigo-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Training Good Stewards of wealth</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-indigo-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Business playbooks & governance coaching</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-indigo-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Succession training & replacement preparation</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Our Name is Not Our Own Image */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex justify-center">
            <img
              src="/Our-Name-is-not-our-own.jpg"
              alt="Our Name is Not Our Own"
              className="w-full max-w-4xl rounded-2xl shadow-2xl border border-white/20"
            />
          </div>
        </div>

        {/* Multigenerational Wealth Codes Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="bg-gradient-to-br from-purple-800/50 to-blue-800/50 backdrop-blur-sm rounded-2xl p-12 border border-white/20">
            <div className="text-center mb-12">
              <BookOpen className="h-12 w-12 text-orange-400 mx-auto mb-4" />
              <h2 className="text-4xl font-bold text-white mb-4">The Multigenerational Wealth Codes</h2>
              <p className="text-xl text-purple-200">
                Ancient wisdom for modern family sovereignty
              </p>
            </div>

            {/* Code #018 - EXPANDED */}
            <div className="mb-12 bg-white/5 rounded-xl p-8 border border-white/10">
              <h3 className="text-3xl font-bold text-orange-400 mb-6">Code #018: Business + Kingdom</h3>
              <div className="prose prose-invert max-w-none">
                <p className="text-purple-100 leading-relaxed mb-4 text-lg">
                  Most wealthy families eventually lose the plot because they try to make the family purely emotional, or purely corporate. <strong className="text-white">Both are wrong.</strong>
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  The purely emotional family operates on feelings, nostalgia, and unspoken expectations. There are no clear roles, no documented processes, no accountability structures. Decisions are made based on who speaks loudest or who guilt-trips most effectively. Money flows based on sentiment rather than strategy. This creates resentment, confusion, and eventually—collapse.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  The purely corporate family treats relationships like transactions. Everything is measured, optimized, and monetized. Family dinners feel like board meetings. Children are raised like employees. Love is conditional on performance metrics. This creates emotional distance, rebellion, and a legacy that feels hollow—even when the balance sheet looks impressive.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  <strong className="text-white">A successful legacy must be operationally efficient AND spiritually anchored.</strong> Without structure, familiarity turns into dysfunction, and money becomes the battleground. Without soul, the family becomes cold, performative, and extractive.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  This is why the greatest families in history—from the Medici to the Rothschilds, from ancient dynasties to modern family offices—understood that you must <strong className="text-white">run the family like a business, but govern it like a kingdom.</strong>
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  The business side provides: clear roles, documented systems, transparent ledgers, annual reviews, formalized succession planning, and legacy planning that extends beyond the founders. This is the operational backbone that prevents chaos.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  The kingdom side provides: meetings that open with blessing and ceremony, roles inherited with ritual and reverence, elders consulted with honor, and sacred stewardship of resources. This is the spiritual anchor that prevents soullessness.
                </p>

                <p className="text-purple-100 leading-relaxed text-lg">
                  <strong className="text-white">When both live in balance</strong>, you create a lineage that knows its mission, a treasury that funds generational vision, and a culture of reverence—not just ROI. You create a family that can weather storms, navigate transitions, and build something that lasts beyond your lifetime.
                </p>
              </div>
            </div>

            {/* Code #021 - EXPANDED */}
            <div className="mb-12 bg-white/5 rounded-xl p-8 border border-white/10">
              <h3 className="text-3xl font-bold text-orange-400 mb-6">Code #021: Structure Belongs in the Home</h3>
              <div className="prose prose-invert max-w-none">
                <p className="text-purple-100 leading-relaxed mb-4 text-lg">
                  <strong className="text-white">Children raised in chaos become adults who resist governance.</strong> The home is the first kingdom. There is no dynasty without order, and there is no order without structure that starts inside the home.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  Many modern parents fear structure. They worry it will stifle creativity, damage self-esteem, or create resentment. So they opt for permissiveness disguised as "freedom." They let children interrupt adult conversations. They negotiate with toddlers. They avoid consequences because they want to be liked. They create homes where chaos is normalized and boundaries are optional.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  The result? Children who grow up unable to self-regulate, unable to delay gratification, unable to respect authority, and unable to lead themselves—let alone lead others. These children become adults who resist any form of governance because they never learned to govern themselves.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  <strong className="text-white">Children are shaped by what happens repeatedly</strong>—not by what you say occasionally. They learn from patterns, not promises. They internalize what is consistently enforced, not what is occasionally mentioned.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  Does "no" mean no? Or does it mean "maybe if you whine enough"? Are interruptions corrected immediately, or tolerated until frustration boils over? Are parents in alignment on rules and consequences, or do children learn to play one against the other? Do mornings have rhythm and routine, or is every day a chaotic scramble? Do consequences follow through consistently, or are they threatened but rarely enforced?
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  Structure in the home doesn't mean military rigidity. It means predictable rhythms, clear expectations, consistent consequences, and aligned leadership. It means children know what to expect, what is expected of them, and what happens when expectations aren't met.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  <strong className="text-white">Govern the home. Govern early. Govern quietly—but without apology.</strong> Start when they're young, before bad habits calcify. Govern with calm consistency, not emotional outbursts. Govern without needing to justify every decision to a five-year-old.
                </p>

                <p className="text-purple-100 leading-relaxed text-lg">
                  Children raised in structure don't become robotic. They become <strong className="text-white">sovereign</strong>. They learn self-discipline, delayed gratification, respect for authority, and the capacity to lead. They become adults who can govern themselves, their families, and their wealth—because they learned governance at home.
                </p>
              </div>
            </div>

            {/* Code #006 - EXPANDED */}
            <div className="bg-white/5 rounded-xl p-8 border border-white/10">
              <h3 className="text-3xl font-bold text-orange-400 mb-6">Code #006: Wealth Is Not the Goal. Stewardship Is.</h3>
              <div className="prose prose-invert max-w-none">
                <p className="text-purple-100 leading-relaxed mb-4 text-lg">
                  <strong className="text-white">Most stop at acquisition. Dynasties begin at administration.</strong> Wealth can be made in one generation, but it is rarely kept without structure, philosophy, and ritual.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  The first generation builds. They hustle, sacrifice, take risks, and accumulate. They focus on making money—and they're often very good at it. But making money and keeping money are two entirely different skill sets.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  The second generation inherits. They didn't build it, so they don't have the same relationship with it. They may respect it, or they may resent it. They may preserve it, or they may squander it. Without intentional stewardship training, they often do both—preserving some while squandering the rest.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  The third generation destroys. This is the infamous "shirtsleeves to shirtsleeves in three generations" pattern. By the third generation, the wealth is gone—not because they're stupid, but because <strong className="text-white">no one taught them stewardship.</strong>
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  Families who last more than three generations understand something fundamental: <strong className="text-white">wealth is not the finish line. It is the foundation.</strong> The goal is not to accumulate as much as possible. The goal is to create a system that preserves, grows, and deploys wealth in alignment with family values—across generations.
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  These families focus on <strong className="text-white">how wealth is held, where it flows, who has access, what it's aligned to, and why.</strong> They create:
                </p>

                <ul className="list-disc list-inside text-purple-100 leading-relaxed mb-4 space-y-2 ml-4">
                  <li><strong className="text-white">Trusts</strong> that protect assets from creditors, lawsuits, and poor decisions</li>
                  <li><strong className="text-white">Family constitutions</strong> that codify values, governance structures, and decision-making processes</li>
                  <li><strong className="text-white">Education programs</strong> that train each generation in financial literacy, business acumen, and stewardship principles</li>
                  <li><strong className="text-white">Governance councils</strong> that make major decisions collectively, not individually</li>
                  <li><strong className="text-white">Rituals and ceremonies</strong> that reinforce family identity and values</li>
                </ul>

                <p className="text-purple-100 leading-relaxed mb-4">
                  They ensure every major financial decision echoes back to <strong className="text-white">legacy—not lifestyle.</strong> They don't ask, "Can we afford this?" They ask, "Does this serve the lineage?"
                </p>

                <p className="text-purple-100 leading-relaxed mb-4">
                  They understand that wealth without stewardship becomes a curse. It creates entitlement, destroys work ethic, and breeds resentment. But wealth WITH stewardship becomes a tool for multigenerational impact.
                </p>

                <p className="text-purple-100 leading-relaxed text-lg">
                  The goal is not more. <strong className="text-white">The goal is meaningful continuity.</strong> Stewardship is the difference between inheritance and chaos. And the true aristocracy understands: <strong className="text-white">Wealth is not the finish line. It is the foundation.</strong>
                </p>
              </div>
            </div>

            <div className="text-center mt-8">
              <p className="text-sm text-purple-300 italic mb-2">
                — Teachings by Namaste` Moore
              </p>
              <a
                href="https://linktr.ee/iamnamastemoore"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-400 hover:text-orange-300 transition-colors duration-200 text-sm font-semibold"
              >
                Learn more from Namaste` Moore →
              </a>
            </div>
          </div>
        </div>

        {/* Cognitive Capital Cultivation Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="bg-gradient-to-br from-indigo-800/50 to-violet-800/50 backdrop-blur-sm rounded-2xl p-12 border border-white/20">
            <div className="text-center mb-12">
              <div className="flex items-center justify-center mb-4">
                <img
                  src="/Citadel-Academy-Logo.png"
                  alt="Citadel Academy"
                  className="h-28 w-auto object-contain"
                />
              </div>
              <h2 className="text-4xl font-bold text-white mb-4">Cognitive Capital Cultivation</h2>
              <p className="text-xl text-purple-200">
                The Fourth Pillar: Preserving and Transferring Family Knowledge
              </p>
            </div>

            <div className="prose prose-invert max-w-none">
              <p className="text-purple-100 leading-relaxed mb-6 text-lg">
                <strong className="text-white">Wealth without wisdom is temporary. Knowledge without transfer is lost.</strong> The fourth pillar of the Dynastic Governance Tetrahedron is Cognitive Capital Cultivation—the systematic creation, protection, and transfer of family knowledge across generations.
              </p>

              <div className="grid md:grid-cols-3 gap-8 mb-8">
                {/* Knowledge Vault */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <FileText className="h-10 w-10 text-indigo-400 mb-4" />
                  <h3 className="text-xl font-bold text-white mb-3">Family Knowledge Vault</h3>
                  <p className="text-purple-200 leading-relaxed">
                    A secure, encrypted repository of family wisdom: business playbooks, governance documents, financial strategies, lessons learned, and institutional knowledge that would otherwise be lost with each generation.
                  </p>
                </div>

                {/* Steward Training */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <GraduationCap className="h-10 w-10 text-indigo-400 mb-4" />
                  <h3 className="text-xl font-bold text-white mb-3">Steward Training</h3>
                  <p className="text-purple-200 leading-relaxed">
                    Systematic education programs that train Good Stewards of wealth, Business Managers who can steer the ship, and Family Governors who coach members and create governance playbooks.
                  </p>
                </div>

                {/* Succession Preparation */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <Lightbulb className="h-10 w-10 text-indigo-400 mb-4" />
                  <h3 className="text-xl font-bold text-white mb-3">Succession Preparation</h3>
                  <p className="text-purple-200 leading-relaxed">
                    Active mentorship where current leaders train their own replacements, ensuring smooth transitions and preventing the knowledge loss that destroys most family enterprises by the third generation.
                  </p>
                </div>
              </div>

              <p className="text-purple-100 leading-relaxed mb-4">
                <strong className="text-white">The Family Knowledge Vault protects against four types of attacks:</strong>
              </p>

              <ul className="list-disc list-inside text-purple-100 leading-relaxed mb-6 space-y-2 ml-4">
                <li><strong className="text-white">Time:</strong> Memories fade, details are forgotten, context is lost. The vault preserves institutional knowledge that would otherwise disappear.</li>
                <li><strong className="text-white">Physical:</strong> Documents burn, hard drives fail, servers crash. Encrypted, distributed storage ensures knowledge survives disasters.</li>
                <li><strong className="text-white">Internal:</strong> Family disputes, power struggles, and generational conflicts can destroy knowledge. The vault maintains neutral, accessible records.</li>
                <li><strong className="text-white">External:</strong> Lawsuits, regulatory changes, and competitive threats require documented decision-making rationale and historical context.</li>
              </ul>

              <p className="text-purple-100 leading-relaxed mb-4">
                This isn't just about storing documents. It's about <strong className="text-white">creating a living system</strong> where knowledge flows from generation to generation, where lessons learned are captured and applied, where wisdom compounds like interest.
              </p>

              <p className="text-purple-100 leading-relaxed text-lg">
                <strong className="text-white">Cognitive Capital Cultivation ensures that each generation stands on the shoulders of giants</strong>—not starting from scratch, but building on the accumulated wisdom of those who came before. This is how dynasties last. This is how families win across centuries, not just decades.
              </p>
            </div>
          </div>
        </div>

        {/* How Family Foundry Works */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">How Family Foundry Works</h2>
            <p className="text-xl text-purple-200">
              A guided journey to establish your family federation
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                1
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Define Your Charter</h3>
              <p className="text-purple-200">
                Establish your family name, motto, mission statement, and core values
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                2
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Configure RBAC</h3>
              <p className="text-purple-200">
                Set up role-based access control with rights, responsibilities, and rewards
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                3
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Invite Members</h3>
              <p className="text-purple-200">
                Add trusted family members and peers using their Nostr public keys
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                4
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Launch Federation</h3>
              <p className="text-purple-200">
                Activate your family federation with secure governance and treasury
              </p>
            </div>
          </div>
        </div>

        {/* Final CTA Section */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Build Your Dynasty?
          </h2>
          <p className="text-xl text-purple-200 mb-8">
            Join families who are creating multigenerational wealth with structure, sovereignty, and sacred stewardship.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={onClaimName}
              className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 flex items-center space-x-2 shadow-xl hover:shadow-2xl transform hover:scale-105"
            >
              <Sparkles className="h-5 w-5" />
              <span>Claim Your Name</span>
              <ArrowRight className="h-5 w-5" />
            </button>
            {onStartFoundry && (
              <button
                onClick={onStartFoundry}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 flex items-center space-x-2 shadow-xl hover:shadow-2xl transform hover:scale-105"
              >
                <Crown className="h-5 w-5" />
                <span>Start Your Foundry</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={onSignIn}
              className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold py-4 px-8 rounded-lg transition-all duration-300 border border-white/20"
            >
              Already Have an Account? Sign In
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default FamilyFoundryLandingPage;

