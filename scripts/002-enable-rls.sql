-- Enable Row Level Security on all tables

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evacuations ENABLE ROW LEVEL SECURITY;

-- Locations policies (all authenticated users can view)
CREATE POLICY "Allow authenticated users to view locations" ON locations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to manage locations" ON locations
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Profiles policies
CREATE POLICY "Allow users to view their own profile" ON profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "Allow users to update their own profile" ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "Allow admins to view all profiles" ON profiles
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Allow admins to manage profiles" ON profiles
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Visitor types policies (all authenticated users can view)
CREATE POLICY "Allow authenticated users to view visitor types" ON visitor_types
  FOR SELECT TO authenticated USING (true);

-- Allow anonymous users to view visitor types (for kiosk)
CREATE POLICY "Allow anonymous to view visitor types" ON visitor_types
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow admins to manage visitor types" ON visitor_types
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- Hosts policies
CREATE POLICY "Allow authenticated users to view hosts" ON hosts
  FOR SELECT TO authenticated USING (true);

-- Allow anonymous users to view hosts (for kiosk)
CREATE POLICY "Allow anonymous to view hosts" ON hosts
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow staff to manage hosts" ON hosts
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- Visitors policies
CREATE POLICY "Allow authenticated users to view visitors" ON visitors
  FOR SELECT TO authenticated USING (true);

-- Allow anonymous to insert visitors (for kiosk sign-in)
CREATE POLICY "Allow anonymous to insert visitors" ON visitors
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous to view visitors" ON visitors
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow staff to manage visitors" ON visitors
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- Sign-ins policies
CREATE POLICY "Allow authenticated users to view sign-ins" ON sign_ins
  FOR SELECT TO authenticated USING (true);

-- Allow anonymous to insert sign-ins (for kiosk)
CREATE POLICY "Allow anonymous to insert sign-ins" ON sign_ins
  FOR INSERT TO anon WITH CHECK (true);

-- Allow anonymous to update sign-ins (for sign-out)
CREATE POLICY "Allow anonymous to update sign_ins" ON sign_ins
  FOR UPDATE TO anon USING (true);

CREATE POLICY "Allow staff to manage sign-ins" ON sign_ins
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- Bookings policies
CREATE POLICY "Allow authenticated users to view bookings" ON bookings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow staff to manage bookings" ON bookings
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- Evacuations policies
CREATE POLICY "Allow authenticated users to view evacuations" ON evacuations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow staff to manage evacuations" ON evacuations
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );
