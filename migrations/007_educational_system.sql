-- Educational System Database Migration
-- Creates tables for course management, progress tracking, and cognitive capital
-- @compliance Master Context - Privacy-first, Bitcoin-only

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('basic', 'advanced', 'specialized')),
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('satnam', 'citadel-academy')),
    duration INTEGER NOT NULL CHECK (duration > 0), -- in hours
    difficulty VARCHAR(50) NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    prerequisites JSONB DEFAULT '[]',
    badges JSONB DEFAULT '[]',
    cost INTEGER NOT NULL DEFAULT 0, -- in satoshis
    enrollment_type VARCHAR(50) NOT NULL DEFAULT 'immediate' CHECK (enrollment_type IN ('immediate', 'approval-required', 'external')),
    max_students INTEGER,
    current_enrollment INTEGER DEFAULT 0,
    start_date BIGINT,
    instructor VARCHAR(255),
    syllabus JSONB DEFAULT '[]',
    learning_outcomes JSONB DEFAULT '[]',
    certificate_type VARCHAR(50) DEFAULT 'completion' CHECK (certificate_type IN ('completion', 'certification', 'badge')),
    external_url TEXT,
    registration_deadline BIGINT,
    is_active BOOLEAN DEFAULT true,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Course enrollments table
CREATE TABLE IF NOT EXISTS course_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_pubkey VARCHAR(64) NOT NULL,
    family_id VARCHAR(100),
    enrollment_type VARCHAR(50) NOT NULL DEFAULT 'immediate',
    provider VARCHAR(50) NOT NULL,
    cost INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'enrolled' CHECK (status IN ('pending', 'enrolled', 'completed', 'dropped')),
    metadata JSONB DEFAULT '{}',
    enrolled_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    completed_at BIGINT,
    final_score INTEGER,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    UNIQUE(course_id, user_pubkey)
);

-- Course progress table
CREATE TABLE IF NOT EXISTS course_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_pubkey VARCHAR(64) NOT NULL,
    family_id VARCHAR(100),
    overall_progress INTEGER NOT NULL DEFAULT 0 CHECK (overall_progress >= 0 AND overall_progress <= 100),
    time_spent INTEGER NOT NULL DEFAULT 0, -- in minutes
    modules_completed INTEGER NOT NULL DEFAULT 0,
    quizzes_completed INTEGER NOT NULL DEFAULT 0,
    average_quiz_score DECIMAL(5,2) DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'in-progress' CHECK (status IN ('not-started', 'in-progress', 'completed')),
    last_activity BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    completed_at BIGINT,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    UNIQUE(course_id, user_pubkey)
);

-- Module progress table
CREATE TABLE IF NOT EXISTS module_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_pubkey VARCHAR(64) NOT NULL,
    module_id VARCHAR(100) NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    time_spent INTEGER NOT NULL DEFAULT 0, -- in minutes
    quiz_score INTEGER CHECK (quiz_score >= 0 AND quiz_score <= 100),
    completed_at BIGINT,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    UNIQUE(course_id, user_pubkey, module_id)
);

-- Cognitive capital metrics table
CREATE TABLE IF NOT EXISTS cognitive_capital_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_pubkey VARCHAR(64) NOT NULL UNIQUE,
    family_id VARCHAR(100),
    total_courses INTEGER NOT NULL DEFAULT 0,
    completed_courses INTEGER NOT NULL DEFAULT 0,
    total_time_spent INTEGER NOT NULL DEFAULT 0, -- in minutes
    average_quiz_score DECIMAL(5,2) DEFAULT 0,
    badges_earned INTEGER NOT NULL DEFAULT 0,
    certificates_earned INTEGER NOT NULL DEFAULT 0,
    cognitive_capital_score INTEGER NOT NULL DEFAULT 0,
    learning_streak INTEGER NOT NULL DEFAULT 0, -- consecutive days
    weekly_progress INTEGER NOT NULL DEFAULT 0,
    monthly_progress INTEGER NOT NULL DEFAULT 0,
    last_updated BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Learning pathways table
CREATE TABLE IF NOT EXISTS learning_pathways (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    courses JSONB NOT NULL DEFAULT '[]', -- array of course IDs
    estimated_duration INTEGER NOT NULL, -- in hours
    difficulty VARCHAR(50) NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    badges JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- User badges table
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_pubkey VARCHAR(64) NOT NULL,
    badge_id VARCHAR(100) NOT NULL,
    course_id VARCHAR(100) REFERENCES courses(id) ON DELETE SET NULL,
    awarded_by VARCHAR(64),
    awarded_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    UNIQUE(user_pubkey, badge_id)
);

-- User certificates table
CREATE TABLE IF NOT EXISTS user_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_pubkey VARCHAR(64) NOT NULL,
    course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    certificate_type VARCHAR(50) NOT NULL DEFAULT 'completion',
    issued_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    issuer VARCHAR(255) NOT NULL,
    verification_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    UNIQUE(user_pubkey, course_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_course_enrollments_user ON course_enrollments(user_pubkey);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course ON course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_status ON course_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_family ON course_enrollments(family_id);

CREATE INDEX IF NOT EXISTS idx_course_progress_user ON course_progress(user_pubkey);
CREATE INDEX IF NOT EXISTS idx_course_progress_course ON course_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_status ON course_progress(status);
CREATE INDEX IF NOT EXISTS idx_course_progress_family ON course_progress(family_id);

CREATE INDEX IF NOT EXISTS idx_module_progress_user ON module_progress(user_pubkey);
CREATE INDEX IF NOT EXISTS idx_module_progress_course ON module_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_module_progress_module ON module_progress(module_id);

CREATE INDEX IF NOT EXISTS idx_cognitive_capital_user ON cognitive_capital_metrics(user_pubkey);
CREATE INDEX IF NOT EXISTS idx_cognitive_capital_family ON cognitive_capital_metrics(family_id);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_pubkey);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);

CREATE INDEX IF NOT EXISTS idx_user_certificates_user ON user_certificates(user_pubkey);
CREATE INDEX IF NOT EXISTS idx_user_certificates_course ON user_certificates(course_id);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = EXTRACT(EPOCH FROM NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_enrollments_updated_at BEFORE UPDATE ON course_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_progress_updated_at BEFORE UPDATE ON course_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_module_progress_updated_at BEFORE UPDATE ON module_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_pathways_updated_at BEFORE UPDATE ON learning_pathways
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to update current enrollment count
CREATE OR REPLACE FUNCTION update_course_enrollment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE courses 
        SET current_enrollment = current_enrollment + 1
        WHERE id = NEW.course_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE courses 
        SET current_enrollment = current_enrollment - 1
        WHERE id = OLD.course_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_course_enrollment_count_trigger
    AFTER INSERT OR DELETE ON course_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_course_enrollment_count();

-- Create function to update cognitive capital on course completion
CREATE OR REPLACE FUNCTION update_cognitive_capital_on_completion()
RETURNS TRIGGER AS $$
DECLARE
    course_record RECORD;
    base_score INTEGER;
BEGIN
    -- Only trigger on status change to 'completed'
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        -- Get course details
        SELECT * INTO course_record FROM courses WHERE id = NEW.course_id;
        
        IF course_record IS NOT NULL THEN
            -- Calculate base score based on difficulty
            base_score := CASE course_record.difficulty
                WHEN 'beginner' THEN 100
                WHEN 'intermediate' THEN 200
                WHEN 'advanced' THEN 300
                ELSE 100
            END;
            
            -- Update cognitive capital metrics
            INSERT INTO cognitive_capital_metrics (
                user_pubkey,
                family_id,
                total_courses,
                completed_courses,
                total_time_spent,
                cognitive_capital_score,
                last_updated
            ) VALUES (
                NEW.user_pubkey,
                NEW.family_id,
                1,
                1,
                course_record.duration * 60,
                base_score,
                EXTRACT(EPOCH FROM NOW())
            )
            ON CONFLICT (user_pubkey) DO UPDATE SET
                total_courses = cognitive_capital_metrics.total_courses + 1,
                completed_courses = cognitive_capital_metrics.completed_courses + 1,
                total_time_spent = cognitive_capital_metrics.total_time_spent + (course_record.duration * 60),
                cognitive_capital_score = cognitive_capital_metrics.cognitive_capital_score + base_score,
                last_updated = EXTRACT(EPOCH FROM NOW());
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cognitive_capital_on_completion_trigger
    AFTER UPDATE ON course_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_cognitive_capital_on_completion();

-- Insert sample data
INSERT INTO courses (id, title, description, category, provider, duration, difficulty, prerequisites, badges, cost, enrollment_type, syllabus, learning_outcomes, certificate_type, is_active) VALUES
(
    'bitcoin-101',
    'Bitcoin Fundamentals',
    'Learn the basics of Bitcoin, blockchain technology, and digital money. Perfect for beginners starting their Bitcoin journey.',
    'basic',
    'satnam',
    8,
    'beginner',
    '[]',
    '["bitcoin-initiate"]',
    0,
    'immediate',
    '["What is Bitcoin?", "How Bitcoin works", "Wallets and addresses", "Transactions and blocks", "Mining and consensus", "Bitcoin security basics"]',
    '["Understand Bitcoin fundamentals", "Set up a secure wallet", "Make your first transaction", "Explain Bitcoin to others"]',
    'completion',
    true
),
(
    'lightning-201',
    'Lightning Network Mastery',
    'Advanced Lightning Network concepts, channel management, and practical applications for Bitcoin scaling.',
    'advanced',
    'citadel-academy',
    12,
    'intermediate',
    '["bitcoin-101"]',
    '["lightning-journeyman"]',
    50000,
    'approval-required',
    '["Lightning Network architecture", "Channel opening and management", "Payment routing", "Liquidity optimization", "Advanced security practices", "Real-world applications"]',
    '["Set up Lightning nodes", "Manage payment channels", "Optimize routing", "Build Lightning applications"]',
    'certification',
    true
),
(
    'privacy-301',
    'Privacy & Sovereignty',
    'Advanced privacy techniques, coin mixing, and maintaining financial sovereignty in the digital age.',
    'specialized',
    'citadel-academy',
    16,
    'advanced',
    '["bitcoin-101", "lightning-201"]',
    '["privacy-guardian"]',
    100000,
    'approval-required',
    '["Privacy fundamentals", "Coin mixing techniques", "Tor and VPN usage", "Hardware security", "Social engineering defense", "Legal considerations"]',
    '["Implement privacy tools", "Protect financial sovereignty", "Navigate legal frameworks", "Teach privacy to others"]',
    'certification',
    true
);

INSERT INTO learning_pathways (id, title, description, courses, estimated_duration, difficulty, badges, is_active) VALUES
(
    'bitcoin-journey',
    'Bitcoin Journey',
    'Complete path from Bitcoin basics to advanced concepts',
    '["bitcoin-101", "lightning-201", "privacy-301"]',
    36,
    'intermediate',
    '["bitcoin-initiate", "lightning-journeyman", "privacy-guardian"]',
    true
),
(
    'privacy-mastery',
    'Privacy Mastery',
    'Master privacy and sovereignty in the digital age',
    '["privacy-301"]',
    16,
    'advanced',
    '["privacy-guardian"]',
    true
);

-- Create RLS policies for privacy
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_capital_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_pathways ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_certificates ENABLE ROW LEVEL SECURITY;

-- Courses: Public read access, admin write access
CREATE POLICY "Courses public read" ON courses FOR SELECT USING (true);
CREATE POLICY "Courses admin write" ON courses FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Course enrollments: Users can only access their own enrollments
CREATE POLICY "Enrollments user access" ON course_enrollments FOR ALL USING (
    user_pubkey = (auth.jwt() ->> 'sub')::text
);

-- Course progress: Users can only access their own progress
CREATE POLICY "Progress user access" ON course_progress FOR ALL USING (
    user_pubkey = (auth.jwt() ->> 'sub')::text
);

-- Module progress: Users can only access their own progress
CREATE POLICY "Module progress user access" ON module_progress FOR ALL USING (
    user_pubkey = (auth.jwt() ->> 'sub')::text
);

-- Cognitive capital: Users can only access their own metrics
CREATE POLICY "Cognitive capital user access" ON cognitive_capital_metrics FOR ALL USING (
    user_pubkey = (auth.jwt() ->> 'sub')::text
);

-- Learning pathways: Public read access
CREATE POLICY "Pathways public read" ON learning_pathways FOR SELECT USING (true);

-- User badges: Users can only access their own badges
CREATE POLICY "Badges user access" ON user_badges FOR ALL USING (
    user_pubkey = (auth.jwt() ->> 'sub')::text
);

-- User certificates: Users can only access their own certificates
CREATE POLICY "Certificates user access" ON user_certificates FOR ALL USING (
    user_pubkey = (auth.jwt() ->> 'sub')::text
); 