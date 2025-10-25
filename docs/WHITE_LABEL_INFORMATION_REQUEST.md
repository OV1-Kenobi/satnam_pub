# White-Label Information Request
**Self-Sovereign Identity & Payment System - Client Onboarding**

**Date:** [Insert Date]  
**To:** [Client Name]  
**From:** [Your Name/Company]  
**Re:** Information Request for White-Label Customization

---

## Introduction

Thank you for your interest in deploying a customized self-sovereign identity and payment system for your [family/business/community]. This document outlines the information we need to complete your white-label customization and deployment.

**What is White-Label Customization?**

We will take our proven reference implementation (Satnam.pub) and customize it with your branding, domain, and feature preferences. The result is a fully functional, privacy-first identity and payment platform that looks and operates as your own product.

**Why This Process?**

By collecting comprehensive information upfront, we can:
- Complete your deployment in 1-2 weeks (vs. 4-6 weeks with back-and-forth)
- Minimize miscommunication and rework
- Provide accurate timeline and cost estimates
- Ensure all your requirements are met the first time

---

## Overview of the Process

### Phase 1: Information Gathering (This Document)
**Timeline:** 1-3 days  
**Your Role:** Complete the attached questionnaire  
**Our Role:** Review and clarify any questions

### Phase 2: Infrastructure Setup
**Timeline:** 1-2 days  
**Your Role:** Provide access credentials (securely)  
**Our Role:** Configure Netlify, Supabase, Lightning backend

### Phase 3: Customization & Deployment
**Timeline:** 4-10 hours (based on complexity)  
**Your Role:** Provide logo files and branding assets  
**Our Role:** Customize codebase, deploy to staging

### Phase 4: Testing & Review
**Timeline:** 1-2 days  
**Your Role:** Test staging environment, provide feedback  
**Our Role:** Fix issues, prepare for production

### Phase 5: Production Launch
**Timeline:** 1 day  
**Your Role:** Approve production deployment  
**Our Role:** Deploy to production, verify functionality

### Phase 6: Training & Handoff
**Timeline:** 1-2 hours  
**Your Role:** Learn admin functions  
**Our Role:** Provide documentation and ongoing support plan

**Total Timeline:** 1-2 weeks from information submission to production launch

---

## Required Information

The attached **White-Label Client Questionnaire** (`docs/WHITE_LABEL_CLIENT_QUESTIONNAIRE.md`) collects all necessary information in a structured format. Below is an overview of what we need and why.

### 1. Branding Requirements

**What We Need:**
- App name (full and short versions)
- App description
- Support email address
- Logo files (main logo, icons, favicon)
- Color scheme (optional)

**Why We Need It:**
- **App Name:** Appears in browser tabs, mobile app stores, user interfaces
- **Support Email:** Displayed in error messages and help documentation
- **Logo Files:** Used throughout the application and in PWA (Progressive Web App) manifests
- **Color Scheme:** Ensures the app matches your brand identity

**Reference:** White-Label Customization Checklist, Phase 2 (Branding Changes)

---

### 2. Domain Configuration

**What We Need:**
- Primary domain (where the app will be hosted)
- NIP-05 identity domain (for username@domain.com identities)
- Lightning address domain (for username@domain.com payments)
- DNS access credentials (provided securely)

**Why We Need It:**
- **Primary Domain:** Users access your app at this URL (e.g., app.yourdomain.com)
- **NIP-05 Domain:** Creates human-readable identities (e.g., alice@yourdomain.com)
- **Lightning Domain:** Enables Lightning payments to usernames (e.g., pay alice@yourdomain.com)
- **DNS Access:** Required to configure SSL certificates and routing

**Example Configuration:**
- Primary: `app.familyvault.com`
- NIP-05: `familyvault.com` (creates identities like `alice@familyvault.com`)
- Lightning: `familyvault.com` (same domain, creates `alice@familyvault.com` payment addresses)

**Reference:** White-Label Customization Checklist, Phase 2.3 (Domain Configuration)

---

### 3. Infrastructure Accounts

**What We Need:**
- Netlify account (or permission to create one for you)
- Supabase account (or permission to create one for you)
- GitHub account (optional, if you want source code access)
- Lightning backend choice (LNbits, Phoenixd, or NWC)

**Why We Need It:**
- **Netlify:** Hosts your frontend (static site) and serverless API functions
- **Supabase:** Hosts your database, authentication, and file storage
- **GitHub:** Provides version control and deployment automation
- **Lightning Backend:** Enables Bitcoin Lightning Network payments

**Hosting Costs (Estimated):**
- Netlify: $0-19/month (free tier sufficient for most use cases)
- Supabase: $0-25/month (free tier sufficient for <100 users)
- Lightning Backend: $0-30/month (depends on self-hosted vs. managed)

**Reference:** White-Label Customization Checklist, Phase 3 (Infrastructure Setup)

---

### 4. Feature Selection

**What We Need:**
- Which identity verification methods you want (NIP-05, PKARR, SimpleProof, NFC Name Tags)
- Which authentication methods you want (NIP-07, Amber, WebAuthn, NFC MFA)
- Which messaging features you want (multimedia, group chat)
- Which payment features you want (LNbits, Phoenixd, NWC, Boltcard NFC, Payment Automation)
- Which governance features you want (FROST signing, guardian approval, role hierarchy)

**Why We Need It:**
- **Feature Flags:** We enable only the features you need, reducing complexity and cost
- **Infrastructure Planning:** Some features require additional services (e.g., Boltcard requires LNbits)
- **User Experience:** We configure the UI to match your use case (family vs. business vs. peer group)

**How to Choose:**
- Review the **Pattern Language** document (`docs/PATTERN_LANGUAGE.md`)
- See detailed explanations of each feature
- Review use case examples (Family, Business, Peer Group)
- Select features that match your goals

**Reference:** Pattern Language, Feature Modules section

---

### 5. Payment Configuration (If Applicable)

**What We Need:**
- Lightning backend preference (LNbits, Phoenixd, or NWC)
- LN Proxy Node preference (for privacy and programmable payments)
- Boltcard NFC requirements (quantity, spending limits, use cases)
- Payment automation needs (subscriptions, allowances, payroll)

**Why We Need It:**
- **Backend Choice:** Determines setup complexity and monthly costs
  - LNbits: Easiest, custodial, $5-30/month
  - Phoenixd: Advanced, self-sovereign, $10-20/month
  - NWC: Use existing wallet, $0/month
- **LN Proxy:** Adds privacy and programmability, $5-10/month
- **Boltcard:** Physical tap-to-pay cards, $5-15 per card
- **Automation:** Requires additional configuration for scheduled payments

**Reference:** Pattern Language, Payments & Lightning section

---

### 6. Governance Model (If Applicable)

**What We Need:**
- Role hierarchy (which roles you'll use: private, offspring, adult, steward, guardian)
- FROST signing configuration (e.g., 2-of-3 guardians must approve)
- Guardian approval workflows (what requires approval and thresholds)
- Number of users per role

**Why We Need It:**
- **Role Hierarchy:** Determines permission levels and UI customization
- **FROST Signing:** Configures multi-signature thresholds for family/business governance
- **Approval Workflows:** Sets up automated approval processes for payments and actions

**Example (Family Use Case):**
- 2 Guardians (parents) - full control, 2-of-3 approval for large payments
- 3 Offspring (children) - limited spending, require parent approval over $20
- FROST threshold: 2-of-2 parents must approve payments over $100

**Reference:** Pattern Language, Family Federation & Trust section

---

### 7. Privacy & Trust Preferences

**What We Need:**
- Nostr relay preferences (public relays vs. self-hosted)
- Multi-layered verification preferences (which methods to enable)
- NIP-85 trust score preferences (if applicable)

**Why We Need It:**
- **Relay Choice:** Self-hosted relays provide more privacy but cost $5-10/month
- **Verification Methods:** More methods = more resilience but more complexity
- **Trust Scores:** Useful for anti-spam and reputation tracking in communities

**Reference:** Pattern Language, Privacy & Security section

---

### 8. Use Case-Specific Information

**Family Use Case:**
- Number of parents/guardians
- Number and ages of children
- Allowance configuration (weekly amount, spending restrictions)
- Primary goals (financial education, secure communications, shared wallet)

**Business Use Case:**
- Business type and number of employees
- Payroll configuration (frequency, number of employees)
- Expense approval workflow (thresholds, number of approvers)
- Primary goals (secure communications, payroll automation, access control)

**Peer Group Use Case:**
- Group type and number of members
- Primary goals (censorship resistance, anonymous messaging, peer payments)

**Why We Need It:**
- **Customization:** We tailor the UI and workflows to your specific use case
- **Feature Prioritization:** We enable features most relevant to your goals
- **User Onboarding:** We create user guides specific to your use case

**Reference:** Pattern Language, Use Case Examples section

---

### 9. Timeline & Budget

**What We Need:**
- Desired deployment date
- Budget approval for estimated costs
- Availability for kickoff call and testing

**Why We Need It:**
- **Timeline:** Helps us schedule resources and set realistic expectations
- **Budget:** Ensures we're aligned on costs before starting work
- **Availability:** Ensures we can complete testing and handoff efficiently

**Estimated Costs:**
- **Setup Fee:** $500-2000 (one-time, based on complexity)
- **Monthly Hosting:** $0-60/month (based on infrastructure choices)
- **Hardware (if applicable):** $0-100 (NFC tags, Boltcards, hardware keys)

**Reference:** White-Label Customization Checklist, Phase 4 (Testing & Verification)

---

### 10. Asset Delivery

**What We Need:**
- Logo files (PNG format, various sizes)
- Brand guidelines (if available)
- Access credentials (provided securely)

**Why We Need It:**
- **Logo Files:** Required for branding throughout the application
- **Brand Guidelines:** Ensures we match your existing brand identity
- **Access Credentials:** Required to configure infrastructure on your behalf

**Secure Delivery Methods:**
- Encrypted email (PGP)
- Password manager share (1Password, Bitwarden)
- Secure file share (Tresorit, ProtonDrive)
- In-person or video call

**Reference:** White-Label Client Questionnaire, Section 11 (Asset Delivery Checklist)

---

## Security & Privacy Assurances

### How We Handle Your Information

**Data Security:**
- All credentials are transmitted via encrypted channels only
- We use password managers (1Password, Bitwarden) for credential storage
- Access credentials are deleted after deployment is complete
- We never store credentials in plain text or unencrypted files

**Privacy Commitments:**
- We do not share your information with third parties
- We do not use your data for any purpose other than your deployment
- We do not retain access to your infrastructure after handoff (unless you request ongoing support)
- All communication is confidential and covered by our service agreement

**Zero-Knowledge Architecture:**
- Your deployed system uses zero-knowledge security (we cannot see user data)
- Private keys are encrypted with user passwords (not accessible to us or you as admin)
- Database uses Row-Level Security (users can only see their own data)
- All messaging is end-to-end encrypted (we cannot read messages)

**Compliance:**
- GDPR-compliant (no personal data stored without encryption)
- SOC 2 Type II infrastructure (Netlify, Supabase)
- Open-source codebase (you can audit all code)

---

## What Happens After You Provide Information

### Step 1: Review & Confirmation (1-2 business days)
- We review your completed questionnaire
- We clarify any questions or ambiguities
- We provide a formal quote with itemized costs
- We provide a detailed timeline with milestones

### Step 2: Kickoff Call (Optional, 30 minutes)
- We walk through your selections together
- We answer any technical questions
- We finalize implementation details
- We establish communication preferences

### Step 3: Asset Collection (1-3 days)
- You provide logo files via secure method
- You provide access credentials via secure method
- We verify all information is complete
- We create a project tracking board (optional)

### Step 4: Implementation (4-10 hours)
- We fork the reference codebase
- We apply your branding (app name, logos, colors)
- We configure your domains
- We set up infrastructure (Netlify, Supabase, Lightning)
- We enable your selected features
- We deploy to staging environment

### Step 5: Staging Review (1-2 days)
- We provide you with staging URL
- You test all features and workflows
- You provide feedback on any issues
- We fix issues and re-deploy to staging
- You approve for production deployment

### Step 6: Production Deployment (1 day)
- We deploy to your production domain
- We verify all features work correctly
- We run security and performance checks
- We provide you with admin access
- We verify SSL certificates and DNS

### Step 7: Training & Handoff (1-2 hours)
- We train you on admin functions (user management, feature flags, monitoring)
- We provide documentation (admin guide, user guide, troubleshooting)
- We establish ongoing support plan (if desired)
- We transfer all access credentials to you
- We delete our copies of credentials

---

## Timeline Expectations

### Fast Track (1 week)
**Requirements:**
- All information provided within 24 hours
- Minimal customization (default theme, standard features)
- Client available for rapid testing and approval

**Timeline:**
- Day 1: Information submission
- Day 2-3: Infrastructure setup and customization
- Day 4-5: Staging testing and fixes
- Day 6: Production deployment
- Day 7: Training and handoff

### Standard Track (2 weeks)
**Requirements:**
- All information provided within 3 days
- Moderate customization (custom colors, selected features)
- Client available for testing within 48 hours

**Timeline:**
- Week 1: Information gathering, infrastructure setup, customization
- Week 2: Staging testing, fixes, production deployment, training

### Extended Track (3-4 weeks)
**Requirements:**
- Complex customization (custom features, integrations)
- Multiple rounds of testing and feedback
- Coordination with multiple stakeholders

**Timeline:**
- Week 1: Information gathering and clarification
- Week 2: Infrastructure setup and customization
- Week 3: Staging testing and iterative fixes
- Week 4: Production deployment and training

---

## Frequently Asked Questions

### Q: Do I need technical knowledge to complete the questionnaire?
**A:** No. The questionnaire is designed for non-technical users. We explain all concepts in plain language and provide examples. If you're unsure about any question, you can skip it and we'll discuss it during the kickoff call.

### Q: What if I don't have logo files ready?
**A:** We can proceed with placeholder logos and update them later. Alternatively, we can provide logo design services for an additional fee ($200-500 depending on complexity).

### Q: Can I change features after deployment?
**A:** Yes. Most features are controlled by feature flags and can be enabled/disabled without code changes. Some features (like FROST signing) require database migrations and may incur additional setup fees.

### Q: What if I don't have a domain yet?
**A:** We can help you select and purchase a domain. Domain costs are typically $10-15/year and are billed separately.

### Q: Do I need to create Netlify and Supabase accounts?
**A:** No. We can create accounts for you, or you can create them yourself. If we create them, we'll transfer ownership to you after deployment.

### Q: How much technical maintenance will I need to do?
**A:** Minimal. The system is designed to be low-maintenance. We provide documentation for common admin tasks (adding users, changing feature flags, monitoring). For ongoing technical support, we offer monthly retainer plans ($100-500/month depending on SLA).

### Q: What if something breaks after deployment?
**A:** We provide 30 days of free bug fixes after deployment. After that, we offer support plans or pay-as-you-go troubleshooting ($100-150/hour).

### Q: Can I see the source code?
**A:** Yes. The codebase is based on an open-source reference implementation. We can provide you with a private GitHub repository containing your customized code.

### Q: Is my data secure?
**A:** Yes. The system uses zero-knowledge architecture, end-to-end encryption, and industry-standard security practices. See "Security & Privacy Assurances" section above for details.

### Q: Can I migrate to a different provider later?
**A:** Yes. You own your data and can export it at any time. The system uses standard protocols (Nostr, Lightning Network) that are interoperable with other implementations.

---

## Next Steps

### 1. Review Reference Documents
- **Pattern Language** (`docs/PATTERN_LANGUAGE.md`) - Understand available features
- **White-Label Customization Checklist** (`docs/WHITE_LABEL_CUSTOMIZATION_CHECKLIST.md`) - See technical implementation details (optional)

### 2. Complete the Questionnaire
- Download: `docs/WHITE_LABEL_CLIENT_QUESTIONNAIRE.md`
- Fill out all applicable sections
- Gather logo files and prepare for secure delivery
- Identify secure method for credential sharing

### 3. Submit Your Information
- Email completed questionnaire to: [Your Email]
- Subject line: "White-Label Questionnaire - [Your Name/Organization]"
- Attach or link to logo files (if ready)
- Indicate preferred secure method for credentials

### 4. Schedule Kickoff Call (Optional)
- Email us with your availability
- We'll send a calendar invite
- Call duration: 30 minutes
- Agenda: Review questionnaire, clarify questions, finalize timeline

---

## Contact Information

**Primary Contact:**  
[Your Name]  
[Your Title]  
[Your Company]

**Email:** [Your Email]  
**Phone:** [Your Phone]  
**Office Hours:** [Your Hours]

**For Technical Questions:**  
[Technical Contact Email]

**For Billing Questions:**  
[Billing Contact Email]

**Emergency Contact (Production Issues):**  
[Emergency Phone/Email]

---

## Appendix: Document References

### Required Reading
1. **White-Label Client Questionnaire** (`docs/WHITE_LABEL_CLIENT_QUESTIONNAIRE.md`)
   - Complete this document and return to us
   - Estimated time: 30-45 minutes

### Recommended Reading
2. **Pattern Language** (`docs/PATTERN_LANGUAGE.md`)
   - Explains all available features and capabilities
   - Helps you make informed feature selections
   - Estimated time: 15-20 minutes

3. **White-Label Reusability Assessment** (`docs/WHITE_LABEL_REUSABILITY_ASSESSMENT.md`)
   - Technical overview of the platform architecture
   - Explains facilitators and barriers for customization
   - Estimated time: 10 minutes

### Optional Reading (Technical)
4. **White-Label Customization Checklist** (`docs/WHITE_LABEL_CUSTOMIZATION_CHECKLIST.md`)
   - Step-by-step technical implementation guide
   - Useful if you want to understand the process
   - Estimated time: 20 minutes

5. **Environment Variables Documentation** (`docs/ENVIRONMENT_VARIABLES.md`)
   - Explains all configuration options
   - Useful for understanding infrastructure setup
   - Estimated time: 10 minutes

---

**Thank you for your interest in our self-sovereign identity and payment system!**

We look forward to working with you to deploy a privacy-first, censorship-resistant platform for your [family/business/community].

Please don't hesitate to reach out with any questions. We're here to help make this process as smooth and efficient as possible.

---

**[Your Name/Company]**  
**[Date]**


