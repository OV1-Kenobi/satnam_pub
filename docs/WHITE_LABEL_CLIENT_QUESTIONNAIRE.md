# White-Label Client Questionnaire
**Self-Sovereign Identity & Payment System - Customization Intake Form**

**Version:** 1.0  
**Date:** 2025-10-25  
**Purpose:** Gather all necessary information to customize and deploy your self-sovereign identity and payment system

---

## Instructions

Please complete all sections that apply to your use case. This questionnaire is designed to collect everything we need in one submission to minimize back-and-forth and expedite your deployment.

**Estimated Time to Complete:** 30-45 minutes  
**What You'll Need:** Logo files, domain access, infrastructure account details (or willingness to create them)

**Reference Documents:**
- **Pattern Language** (`docs/PATTERN_LANGUAGE.md`) - Explains all available features and capabilities
- **White-Label Customization Checklist** (`docs/WHITE_LABEL_CUSTOMIZATION_CHECKLIST.md`) - Technical implementation guide (for your reference)

---

## Section 1: Client Information

### 1.1 Basic Information

**Client Name/Organization:**  
_________________________________________

**Primary Contact Name:**  
_________________________________________

**Primary Contact Email:**  
_________________________________________

**Primary Contact Phone:**  
_________________________________________

**Use Case Type:** (Check one)
- [ ] Family/Household
- [ ] Small Business
- [ ] Peer Group/Community
- [ ] Other: _________________________________________

**Number of Expected Users:**
- [ ] 1-5 users
- [ ] 6-20 users
- [ ] 21-50 users
- [ ] 51-100 users
- [ ] 100+ users

---

## Section 2: Branding Requirements

### 2.1 Application Identity

**App Name (Full):**  
_________________________________________  
*Example: "FamilyVault", "SecureBiz Identity", "PeerCircle"*

**App Name (Short, max 12 characters):**  
_________________________________________  
*Example: "FamilyVault" → "FamVault"*

**App Description (1-2 sentences):**  
_________________________________________  
_________________________________________

**Support Email Address:**  
_________________________________________  
*This will be displayed in error messages and help documentation*

### 2.2 Logo Assets

**Do you have logo files ready?**
- [ ] Yes, I will provide logo files (see Asset Delivery Checklist below)
- [ ] No, please use placeholder logos (we'll update later)
- [ ] No, I need design assistance (additional cost)

**If providing logos, confirm you will supply:**
- [ ] Main logo (PNG, transparent background, min 512x512px)
- [ ] Square icon (PNG, transparent background, 512x512px for PWA)
- [ ] Small icon (PNG, transparent background, 192x192px for PWA)
- [ ] Favicon (PNG or ICO, 64x64px)

### 2.3 Color Scheme

**Do you want custom colors?**
- [ ] Yes, use my brand colors (provide hex codes below)
- [ ] No, use default theme
- [ ] Undecided, I'll choose later

**If custom colors, provide hex codes:**

**Primary Color:** #___________ (main brand color)  
**Secondary Color:** #___________ (accent color)  
**Background Color:** #___________ (light/dark preference)

---

## Section 3: Domain Configuration

### 3.1 Primary Domain

**Primary Domain (where your app will be hosted):**  
_________________________________________  
*Example: app.yourdomain.com or yourdomain.com*

**Do you own this domain?**
- [ ] Yes, I own it and have DNS access
- [ ] No, I need to purchase it
- [ ] I need help selecting a domain

### 3.2 NIP-05 Identity Domain

**NIP-05 Domain (for username@domain.com identities):**  
_________________________________________  
*Can be the same as primary domain or different (e.g., id.yourdomain.com)*

**Allowed NIP-05 Domains (comma-separated if multiple):**  
_________________________________________  
*Example: yourdomain.com, legacy.yourdomain.com*

### 3.3 Lightning Address Domain

**Lightning Address Domain (for username@domain.com payments):**  
_________________________________________  
*Can be the same as NIP-05 domain or different (e.g., pay.yourdomain.com)*

**Preferred Lightning Address Format:**
- [ ] Same as NIP-05 (username@yourdomain.com)
- [ ] Separate subdomain (username@pay.yourdomain.com)
- [ ] Custom: _________________________________________

---

## Section 4: Infrastructure Setup

### 4.1 Netlify (Frontend Hosting)

**Do you have a Netlify account?**
- [ ] Yes, I have an account (provide email below)
- [ ] No, please create one for me
- [ ] I want you to host it on your Netlify account

**If yes, Netlify account email:**  
_________________________________________

**Netlify Plan:**
- [ ] Free tier (100GB bandwidth/month) - Recommended for <1000 users
- [ ] Pro tier ($19/month, 1TB bandwidth) - Recommended for >1000 users

### 4.2 Supabase (Database)

**Do you have a Supabase account?**
- [ ] Yes, I have an account (provide email below)
- [ ] No, please create one for me
- [ ] I want you to host it on your Supabase account

**If yes, Supabase account email:**  
_________________________________________

**Supabase Plan:**
- [ ] Free tier (500MB database, 1GB storage) - Recommended for <100 users
- [ ] Pro tier ($25/month, 8GB database, 100GB storage) - Recommended for >100 users

### 4.3 Version Control (GitHub)

**Do you want access to the source code repository?**
- [ ] Yes, create a private GitHub repo I can access (provide GitHub username below)
- [ ] No, you maintain the code and I just use the deployed app
- [ ] I'm not sure yet

**If yes, GitHub username:**  
_________________________________________

---

## Section 5: Feature Selection

*Reference: See `docs/PATTERN_LANGUAGE.md` for detailed feature explanations*

### 5.1 Identity & Verification

**Which identity verification methods do you want?** (Check all that apply)

**Basic (Always Included):**
- [x] NIP-05 Identity (username@domain.com)
- [x] Kind:0 Nostr Event (profile metadata)

**Advanced (Optional):**
- [ ] PKARR Attestation (censorship-resistant, BitTorrent DHT)
- [ ] SimpleProof Timestamping (Bitcoin blockchain proof-of-existence)
- [ ] Multi-Layered Verification (all methods cross-referenced for maximum resilience)
- [ ] Iroh Document Sync (peer-to-peer identity replication)
- [ ] Physical NFC Name Tags (NTAG424 DNA chips for offline verification)

**If NFC Name Tags selected:**
- **Quantity needed:** _______ tags
- **Budget for NFC hardware:** $_______ (tags cost $3-8 each)

### 5.2 Authentication Methods

**Which authentication methods do you want?** (Check all that apply)

**Basic (Always Included):**
- [x] NIP-05 + Password (traditional username/password)

**Advanced (Optional):**
- [ ] NIP-07 Browser Extension (Alby, nos2x - easiest for desktop users)
- [ ] Amber Mobile Signer (Android NIP-55/NIP-46 - best for mobile)
- [ ] WebAuthn/FIDO2 (YubiKey, Titan, Feitian - enterprise security)
- [ ] NFC Physical MFA (tap NFC tag to sign in)

**If WebAuthn selected:**
- **Will you provide hardware keys to users?** Yes [ ] No [ ]
- **Quantity needed:** _______ keys

**If NFC MFA selected:**
- **Same tags as Name Tags above?** Yes [ ] No [ ]
- **Separate MFA tags needed:** _______ tags

### 5.3 Messaging & Communications

**Which messaging features do you want?** (Check all that apply)

**Basic (Always Included):**
- [x] NIP-17 Private DMs (gift-wrapped encrypted messaging)
- [x] NIP-59 Sealed Sender (anonymous message routing)

**Advanced (Optional):**
- [ ] Multimedia Messaging (file attachments, voice notes, videos)
- [ ] Group Messaging (encrypted group chats)

**If Multimedia Messaging selected:**
- **Blossom Server Preference:**
  - [ ] Use public Blossom server (nostr.build - free)
  - [ ] Self-host Blossom server (requires VPS - $5-10/month)

---

## Section 6: Payment Configuration

### 6.1 Lightning Backend Selection

**Which Lightning backend do you prefer?** (Check one)

- [ ] **LNbits** (Custodial, easiest setup, recommended for beginners)
  - [ ] Self-hosted on VPS ($5-10/month)
  - [ ] Voltage.cloud hosted ($10-30/month)
  - [ ] I need help deciding

- [ ] **Phoenixd** (Self-hosted, full sovereignty, recommended for advanced users)
  - Requires VPS ($10-20/month)

- [ ] **NWC (Nostr Wallet Connect)** (Use existing wallet, no new setup)
  - [ ] Alby
  - [ ] Mutiny
  - [ ] Other: _________________________________________

- [ ] **None** (Skip payment features for now)

- [ ] **I need help deciding** (we'll discuss based on your use case)

### 6.2 LN Proxy Node (Privacy & Programmability)

**Do you want an LN Proxy Node?**
- [ ] Yes (adds $5-10/month, can share VPS with LNbits/Phoenixd)
- [ ] No
- [ ] I need more information

**If yes, which features do you need?** (Check all that apply)
- [ ] Payment graph obfuscation (hide payment patterns)
- [ ] IP address protection (hide wallet IP)
- [ ] Spending limits (daily/weekly/monthly caps)
- [ ] Approval workflows (require guardian signatures for large payments)
- [ ] Time-based rules (e.g., payments only during business hours)
- [ ] Fee optimization (auto-route through lowest-fee paths)
- [ ] Payment batching (combine small payments to reduce fees)

### 6.3 Boltcard NFC (Physical Tap-to-Pay)

**Do you want Boltcard NFC tap-to-pay?**
- [ ] Yes (requires LNbits backend)
- [ ] No
- [ ] Maybe later

**If yes:**

**Quantity of Boltcards needed:** _______ cards ($5-15 each)

**Use cases:** (Check all that apply)
- [ ] Kids' allowance cards with spending limits
- [ ] Employee expense cards
- [ ] Event wristbands (festivals, conferences)
- [ ] Gift cards
- [ ] Point-of-sale payments
- [ ] Other: _________________________________________

**Spending limit preferences:**
- **Per-tap limit:** $_______ (or unlimited [ ])
- **Daily limit:** $_______ (or unlimited [ ])
- **Weekly limit:** $_______ (or unlimited [ ])

**PIN protection:**
- [ ] Require PIN for all transactions
- [ ] Require PIN only for transactions over $_______ 
- [ ] No PIN required

### 6.4 Payment Automation

**Do you need scheduled/recurring payments?**
- [ ] Yes (subscriptions, allowances, payroll)
- [ ] No
- [ ] Maybe later

**If yes, describe use cases:**  
_________________________________________  
_________________________________________

---

## Section 7: Governance & Family Federation

### 7.1 Role Hierarchy

**Which roles will you use?** (Check all that apply)

- [ ] **Private** (individual users, no family/org structure)
- [ ] **Offspring** (children, dependents - can request, limited spending)
- [ ] **Adult** (standard users - can spend, manage own account)
- [ ] **Steward** (managers, parents - can approve others' requests)
- [ ] **Guardian** (administrators, family heads - full control, multi-sig authority)

**Estimated number of users per role:**
- Private: _______ users
- Offspring: _______ users
- Adult: _______ users
- Steward: _______ users
- Guardian: _______ users

### 7.2 FROST Signing (Multi-Signature)

**Do you need FROST threshold signatures?**
- [ ] Yes (e.g., 2-of-3 guardians must approve large payments)
- [ ] No
- [ ] I need more information

**If yes:**

**Threshold configuration:**  
_______ of _______ guardians must approve  
*Example: 2 of 3 (any 2 guardians can approve)*

**What requires guardian approval?** (Check all that apply)
- [ ] Payments over $_______ 
- [ ] Adding new users
- [ ] Changing system settings
- [ ] Key recovery
- [ ] Other: _________________________________________

### 7.3 Guardian Approval Workflows

**Do you need approval workflows for specific actions?**
- [ ] Yes
- [ ] No

**If yes, what requires approval?** (Check all that apply)
- [ ] Offspring payment requests over $_______ 
- [ ] Adult payment requests over $_______ 
- [ ] New user registration
- [ ] Role changes (e.g., offspring → adult)
- [ ] Account recovery
- [ ] Other: _________________________________________

---

## Section 8: Privacy & Trust

### 8.1 Nostr Relay Preferences

**Relay configuration:**
- [ ] Use public relays (relay.damus.io, nos.lol - free)
- [ ] Self-host private relay (requires VPS - $5-10/month)
- [ ] Mix of public and private relays

**If self-hosting:**
- **Relay domain:** _________________________________________  
  *Example: relay.yourdomain.com*

### 8.2 NIP-85 Trust Scores

**Do you want NIP-85 trust/reputation system?**
- [ ] Yes (proof-of-personhood, anti-spam, progressive feature unlocking)
- [ ] No
- [ ] I need more information

**If yes, use cases:**
- [ ] Anti-spam (require trust score to send messages)
- [ ] Progressive features (unlock features as trust increases)
- [ ] Employee/member reputation tracking
- [ ] Other: _________________________________________

---

## Section 9: Use Case-Specific Questions

### 9.1 Family Use Case (Skip if not applicable)

**Family structure:**
- **Number of parents/guardians:** _______ 
- **Number of children:** _______ 
- **Children's ages:** _________________________________________

**Primary goals:** (Check all that apply)
- [ ] Teach kids financial responsibility with allowances
- [ ] Secure family communications
- [ ] Shared family wallet with spending controls
- [ ] Emergency recovery (guardians can help recover lost accounts)
- [ ] Other: _________________________________________

**Allowance configuration (if applicable):**
- **Weekly allowance per child:** $_______ 
- **Spending restrictions:** _________________________________________

### 9.2 Business Use Case (Skip if not applicable)

**Business type:**  
_________________________________________

**Number of employees:** _______ 

**Primary goals:** (Check all that apply)
- [ ] Secure employee communications
- [ ] Payroll automation
- [ ] Expense management with approval workflows
- [ ] Employee reputation/performance tracking
- [ ] Access control (NFC badges)
- [ ] Other: _________________________________________

**Payroll configuration (if applicable):**
- **Pay frequency:** Weekly [ ] Bi-weekly [ ] Monthly [ ]
- **Number of employees on payroll:** _______ 

**Expense approval workflow:**
- **Approval threshold:** Expenses over $_______ require manager approval
- **Number of managers/approvers:** _______ 

### 9.3 Peer Group Use Case (Skip if not applicable)

**Group type:**  
_________________________________________  
*Example: Book club, activist group, online community*

**Number of members:** _______ 

**Primary goals:** (Check all that apply)
- [ ] Censorship-resistant communications
- [ ] Anonymous messaging (sealed sender)
- [ ] Peer-to-peer payments
- [ ] Reputation system
- [ ] No central authority (fully decentralized)
- [ ] Other: _________________________________________

---

## Section 10: Timeline & Budget

### 10.1 Timeline Expectations

**When do you need this deployed?**
- [ ] ASAP (within 1 week)
- [ ] Within 2 weeks
- [ ] Within 1 month
- [ ] Flexible timeline
- [ ] Specific date: _________________________________________

**Are you available for a kickoff call?**
- [ ] Yes, preferred times: _________________________________________
- [ ] No, email communication only

### 10.2 Budget

**Estimated Monthly Hosting Costs** (based on your selections):

| Service | Cost |
|---------|------|
| Netlify | $_______ /month |
| Supabase | $_______ /month |
| Lightning Backend | $_______ /month |
| LN Proxy Node | $_______ /month |
| Nostr Relay (if self-hosted) | $_______ /month |
| Blossom Server (if self-hosted) | $_______ /month |
| **Total Monthly** | **$_______ /month** |

**Estimated One-Time Costs:**

| Item | Cost |
|------|------|
| Setup/Customization Fee | $_______ |
| NFC Name Tags (_____ qty) | $_______ |
| Boltcards (_____ qty) | $_______ |
| Hardware Keys (_____ qty) | $_______ |
| Logo Design (if needed) | $_______ |
| **Total One-Time** | **$_______** |

**Budget approval:**
- [ ] I approve the estimated costs above
- [ ] I need to discuss budget adjustments
- [ ] I need a formal quote before proceeding

---

## Section 11: Asset Delivery Checklist

### 11.1 Files to Provide

**Please provide the following files** (upload to shared folder or email):

- [ ] Main logo (PNG, transparent, min 512x512px)
- [ ] Square icon (PNG, transparent, 512x512px)
- [ ] Small icon (PNG, transparent, 192x192px)
- [ ] Favicon (PNG or ICO, 64x64px)
- [ ] Brand guidelines (if available)
- [ ] Any additional assets (fonts, graphics, etc.)

**File delivery method:**
- [ ] Email attachment to: _________________________________________
- [ ] Google Drive/Dropbox link: _________________________________________
- [ ] Other: _________________________________________

### 11.2 Access Credentials (Secure Delivery)

**We will need the following access** (provide via secure method):

- [ ] Domain registrar login (for DNS configuration)
- [ ] Netlify account access (if using your account)
- [ ] Supabase account access (if using your account)
- [ ] GitHub access (if you want repo access)
- [ ] LNbits admin key (if you're providing existing instance)
- [ ] Phoenixd API credentials (if you're providing existing instance)

**Preferred secure delivery method:**
- [ ] Encrypted email (PGP)
- [ ] Password manager share (1Password, Bitwarden)
- [ ] Secure file share (Tresorit, ProtonDrive)
- [ ] In-person/video call
- [ ] Other: _________________________________________

---

## Section 12: Completion Checklist

**Before submitting, verify you have:**

- [ ] Completed all applicable sections
- [ ] Provided app name and branding details
- [ ] Specified domain configuration
- [ ] Selected infrastructure preferences
- [ ] Chosen features from Pattern Language
- [ ] Answered use case-specific questions
- [ ] Reviewed timeline and budget
- [ ] Prepared logo files for delivery
- [ ] Identified secure method for credential sharing
- [ ] Read and understood the next steps below

---

## Next Steps

**After you submit this questionnaire:**

1. **Review & Confirmation** (1-2 business days)
   - We'll review your responses
   - Clarify any questions
   - Provide formal quote and timeline

2. **Kickoff Call** (optional, 30 minutes)
   - Walk through your selections
   - Discuss any technical questions
   - Finalize implementation details

3. **Asset Collection** (1-3 days)
   - You provide logo files
   - You provide access credentials (securely)
   - We verify all information is complete

4. **Implementation** (4-10 hours, based on complexity)
   - We customize the codebase
   - We configure infrastructure
   - We deploy to staging environment

5. **Testing & Review** (1-2 days)
   - You test staging deployment
   - We fix any issues
   - You approve for production

6. **Production Deployment** (1 day)
   - We deploy to production
   - We verify all features work
   - We hand over access and documentation

7. **Training & Handoff** (1-2 hours)
   - We train you on admin functions
   - We provide documentation
   - We establish ongoing support plan

**Total Timeline:** 1-2 weeks from questionnaire submission to production deployment

---

## Questions or Need Help?

**Contact Information:**

**Email:** _________________________________________  
**Phone:** _________________________________________  
**Preferred Contact Method:** _________________________________________

**Office Hours:** _________________________________________

**For feature questions:** Reference `docs/PATTERN_LANGUAGE.md`  
**For technical questions:** Reference `docs/WHITE_LABEL_CUSTOMIZATION_CHECKLIST.md`

---

**Thank you for choosing our self-sovereign identity and payment system!**

We're excited to help you deploy a privacy-first, censorship-resistant platform for your family, business, or community.


