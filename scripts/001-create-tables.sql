-- TalusAg Visitor Management System Database Schema

-- Locations table (different sites/buildings)
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin users profile table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'viewer')),
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visitor types (contractor, guest, delivery, interview, etc.)
CREATE TABLE IF NOT EXISTS visitor_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  badge_color TEXT DEFAULT '#10B981',
  requires_host BOOLEAN DEFAULT true,
  requires_company BOOLEAN DEFAULT false,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hosts (employees who can receive visitors)
CREATE TABLE IF NOT EXISTS hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department TEXT,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visitors table
CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sign-in records
CREATE TABLE IF NOT EXISTS sign_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  visitor_type_id UUID REFERENCES visitor_types(id) ON DELETE SET NULL,
  host_id UUID REFERENCES hosts(id) ON DELETE SET NULL,
  sign_in_time TIMESTAMPTZ DEFAULT NOW(),
  sign_out_time TIMESTAMPTZ,
  purpose TEXT,
  badge_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-registered visits (bookings)
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  host_id UUID REFERENCES hosts(id) ON DELETE SET NULL,
  visitor_type_id UUID REFERENCES visitor_types(id) ON DELETE SET NULL,
  expected_arrival TIMESTAMPTZ NOT NULL,
  expected_departure TIMESTAMPTZ,
  visitor_first_name TEXT NOT NULL,
  visitor_last_name TEXT NOT NULL,
  visitor_email TEXT,
  visitor_company TEXT,
  purpose TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'checked_in', 'completed', 'cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evacuation records
CREATE TABLE IF NOT EXISTS evacuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  all_clear BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default location
INSERT INTO locations (name, address) VALUES ('TalusAg Headquarters', '123 Main Street, Austin, TX 78701');

-- Insert default visitor types
INSERT INTO visitor_types (name, badge_color, requires_host, requires_company, location_id)
SELECT 'Guest', '#10B981', true, false, id FROM locations LIMIT 1;

INSERT INTO visitor_types (name, badge_color, requires_host, requires_company, location_id)
SELECT 'Contractor', '#F59E0B', true, true, id FROM locations LIMIT 1;

INSERT INTO visitor_types (name, badge_color, requires_host, requires_company, location_id)
SELECT 'Delivery', '#3B82F6', false, true, id FROM locations LIMIT 1;

INSERT INTO visitor_types (name, badge_color, requires_host, requires_company, location_id)
SELECT 'Interview', '#8B5CF6', true, false, id FROM locations LIMIT 1;

-- Insert sample hosts
INSERT INTO hosts (name, email, department, location_id)
SELECT 'Hiro Iwanaga', 'hiro@talusag.com', 'Executive', id FROM locations LIMIT 1;

INSERT INTO hosts (name, email, department, location_id)
SELECT 'David Toyne', 'david@talusag.com', 'Engineering', id FROM locations LIMIT 1;

INSERT INTO hosts (name, email, department, location_id)
SELECT 'Tracy Keyes', 'tracy@talusag.com', 'Engineering', id FROM locations LIMIT 1;
