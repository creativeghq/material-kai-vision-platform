-- =====================================================
-- QUOTE SYSTEM ENHANCEMENTS
-- =====================================================
-- 1. Status Tags System
-- 2. Upsells/Extras System
-- 3. Project Timeline System
-- =====================================================

-- =====================================================
-- 1. STATUS TAGS SYSTEM
-- =====================================================

-- Create status_tags table for custom quote statuses
CREATE TABLE IF NOT EXISTS status_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6B7280', -- Hex color code
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE, -- System tags cannot be deleted
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default system status tags
INSERT INTO status_tags (name, color, is_system, display_order) VALUES
    ('pending', '#F59E0B', TRUE, 1),
    ('in_progress', '#3B82F6', TRUE, 2),
    ('quoted', '#8B5CF6', TRUE, 3),
    ('accepted', '#10B981', TRUE, 4),
    ('rejected', '#EF4444', TRUE, 5),
    ('expired', '#6B7280', TRUE, 6)
ON CONFLICT (name) DO NOTHING;

-- Add status_tag_id to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status_tag_id UUID REFERENCES status_tags(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_quotes_status_tag ON quotes(status_tag_id);

-- =====================================================
-- 2. UPSELLS/EXTRAS SYSTEM
-- =====================================================

-- Create upsells table for admin-managed upsell items
CREATE TABLE IF NOT EXISTS upsells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create quote_upsells junction table (many-to-many)
CREATE TABLE IF NOT EXISTS quote_upsells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    upsell_id UUID NOT NULL REFERENCES upsells(id) ON DELETE CASCADE,
    customer_accepted BOOLEAN DEFAULT NULL, -- NULL = not decided, TRUE = accepted, FALSE = rejected
    admin_notes TEXT,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    UNIQUE(quote_id, upsell_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_quote_upsells_quote ON quote_upsells(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_upsells_upsell ON quote_upsells(upsell_id);

-- =====================================================
-- 3. PROJECT TIMELINE SYSTEM
-- =====================================================

-- Create timeline_steps table for predefined timeline steps
CREATE TABLE IF NOT EXISTS timeline_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default timeline steps
INSERT INTO timeline_steps (name, description, display_order) VALUES
    ('Quote Accepted', 'Customer accepted the quote', 1),
    ('Materials Ordered', 'Materials have been ordered from suppliers', 2),
    ('Materials Received', 'Materials received and inspected', 3),
    ('Production Started', 'Production/fabrication has begun', 4),
    ('Quality Check', 'Quality inspection completed', 5),
    ('Packaging', 'Items packaged for delivery', 6),
    ('Shipped', 'Order shipped to customer', 7),
    ('Delivered', 'Order delivered to customer', 8),
    ('Project Completed', 'Project marked as complete', 9)
ON CONFLICT DO NOTHING;

-- Create quote_timeline table for tracking project progress
CREATE TABLE IF NOT EXISTS quote_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    timeline_step_id UUID NOT NULL REFERENCES timeline_steps(id),
    status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'skipped'
    notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(quote_id, timeline_step_id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_quote_timeline_quote ON quote_timeline(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_timeline_step ON quote_timeline(timeline_step_id);

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Status Tags: Admin only
ALTER TABLE status_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage status tags" ON status_tags FOR ALL USING (true);

-- Upsells: Admin only
ALTER TABLE upsells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage upsells" ON upsells FOR ALL USING (true);

-- Quote Upsells: Users can view their own, admin can manage all
ALTER TABLE quote_upsells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their quote upsells" ON quote_upsells FOR SELECT USING (
    quote_id IN (SELECT id FROM quotes WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update their quote upsells acceptance" ON quote_upsells FOR UPDATE USING (
    quote_id IN (SELECT id FROM quotes WHERE user_id = auth.uid())
);
CREATE POLICY "Admin can manage all quote upsells" ON quote_upsells FOR ALL USING (true);

-- Timeline Steps: Admin only
ALTER TABLE timeline_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage timeline steps" ON timeline_steps FOR ALL USING (true);

-- Quote Timeline: Users can view their own, admin can manage all
ALTER TABLE quote_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their quote timeline" ON quote_timeline FOR SELECT USING (
    quote_id IN (SELECT id FROM quotes WHERE user_id = auth.uid())
);
CREATE POLICY "Admin can manage all quote timelines" ON quote_timeline FOR ALL USING (true);

