-- Seed bookings for testing
-- This script creates test bookings for today

-- First, ensure we have a location, host, and visitor type to reference
DO $$
DECLARE
    v_location_id uuid;
    v_host_id uuid;
    v_visitor_type_id uuid;
    v_visitor_type_training_id uuid;
    v_today date := CURRENT_DATE;
BEGIN
    -- Get first location (or create one if none exists)
    SELECT id INTO v_location_id FROM locations LIMIT 1;
    
    IF v_location_id IS NULL THEN
        INSERT INTO locations (name, address, latitude, longitude, timezone)
        VALUES ('Main Office', '123 Business Park Dr, Austin, TX 78701', 30.2672, -97.7431, 'America/Chicago')
        RETURNING id INTO v_location_id;
    END IF;
    
    -- Get first active host (or create one if none exists)
    SELECT id INTO v_host_id FROM hosts WHERE is_active = true LIMIT 1;
    
    IF v_host_id IS NULL THEN
        INSERT INTO hosts (name, email, department, location_id, is_active)
        VALUES ('John Smith', 'john.smith@talusag.com', 'Engineering', v_location_id, true)
        RETURNING id INTO v_host_id;
    END IF;
    
    -- Get a visitor type without training requirement
    SELECT id INTO v_visitor_type_id FROM visitor_types WHERE requires_training = false LIMIT 1;
    
    IF v_visitor_type_id IS NULL THEN
        INSERT INTO visitor_types (name, badge_color, requires_host, requires_training, location_id)
        VALUES ('Guest', '#10B981', true, false, v_location_id)
        RETURNING id INTO v_visitor_type_id;
    END IF;
    
    -- Get a visitor type with training requirement
    SELECT id INTO v_visitor_type_training_id FROM visitor_types WHERE requires_training = true LIMIT 1;
    
    IF v_visitor_type_training_id IS NULL THEN
        INSERT INTO visitor_types (name, badge_color, requires_host, requires_training, training_title, training_video_url, location_id)
        VALUES ('Contractor', '#F59E0B', true, true, 'Safety Training', 'https://www.youtube.com/embed/dQw4w9WgXcQ', v_location_id)
        RETURNING id INTO v_visitor_type_training_id;
    END IF;
    
    -- Clear existing test bookings (optional - comment out if you want to keep existing bookings)
    DELETE FROM bookings WHERE visitor_email IN (
        'alice.johnson@acmecorp.com',
        'bob.williams@techstartup.io',
        'carol.davis@enterprise.com',
        'david.miller@consulting.com'
    );
    
    -- Insert test bookings for today
    
    -- Booking 1: Morning meeting, no training required
    INSERT INTO bookings (
        visitor_first_name,
        visitor_last_name,
        visitor_email,
        visitor_company,
        expected_arrival,
        expected_departure,
        purpose,
        status,
        host_id,
        visitor_type_id,
        location_id
    ) VALUES (
        'Alice',
        'Johnson',
        'alice.johnson@acmecorp.com',
        'Acme Corporation',
        (v_today + TIME '09:00:00')::timestamp with time zone,
        (v_today + TIME '11:00:00')::timestamp with time zone,
        'Product demo and discussion',
        'pending',
        v_host_id,
        v_visitor_type_id,
        v_location_id
    );
    
    -- Booking 2: Afternoon meeting, no training required
    INSERT INTO bookings (
        visitor_first_name,
        visitor_last_name,
        visitor_email,
        visitor_company,
        expected_arrival,
        expected_departure,
        purpose,
        status,
        host_id,
        visitor_type_id,
        location_id
    ) VALUES (
        'Bob',
        'Williams',
        'bob.williams@techstartup.io',
        'Tech Startup Inc',
        (v_today + TIME '14:00:00')::timestamp with time zone,
        (v_today + TIME '16:00:00')::timestamp with time zone,
        'Partnership discussion',
        'pending',
        v_host_id,
        v_visitor_type_id,
        v_location_id
    );
    
    -- Booking 3: Contractor visit, requires training
    INSERT INTO bookings (
        visitor_first_name,
        visitor_last_name,
        visitor_email,
        visitor_company,
        expected_arrival,
        expected_departure,
        purpose,
        status,
        host_id,
        visitor_type_id,
        location_id
    ) VALUES (
        'Carol',
        'Davis',
        'carol.davis@enterprise.com',
        'Enterprise Solutions LLC',
        (v_today + TIME '10:30:00')::timestamp with time zone,
        (v_today + TIME '17:00:00')::timestamp with time zone,
        'System installation and setup',
        'pending',
        v_host_id,
        v_visitor_type_training_id,
        v_location_id
    );
    
    -- Booking 4: Multiple bookings for same email (to test selection)
    INSERT INTO bookings (
        visitor_first_name,
        visitor_last_name,
        visitor_email,
        visitor_company,
        expected_arrival,
        expected_departure,
        purpose,
        status,
        host_id,
        visitor_type_id,
        location_id
    ) VALUES (
        'David',
        'Miller',
        'david.miller@consulting.com',
        'Miller Consulting',
        (v_today + TIME '09:30:00')::timestamp with time zone,
        (v_today + TIME '10:30:00')::timestamp with time zone,
        'Morning check-in',
        'pending',
        v_host_id,
        v_visitor_type_id,
        v_location_id
    );
    
    INSERT INTO bookings (
        visitor_first_name,
        visitor_last_name,
        visitor_email,
        visitor_company,
        expected_arrival,
        expected_departure,
        purpose,
        status,
        host_id,
        visitor_type_id,
        location_id
    ) VALUES (
        'David',
        'Miller',
        'david.miller@consulting.com',
        'Miller Consulting',
        (v_today + TIME '13:00:00')::timestamp with time zone,
        (v_today + TIME '15:00:00')::timestamp with time zone,
        'Afternoon workshop',
        'pending',
        v_host_id,
        v_visitor_type_id,
        v_location_id
    );
    
    RAISE NOTICE 'Successfully created test bookings for today (%):', v_today;
    RAISE NOTICE '- alice.johnson@acmecorp.com (9:00 AM, no training)';
    RAISE NOTICE '- bob.williams@techstartup.io (2:00 PM, no training)';
    RAISE NOTICE '- carol.davis@enterprise.com (10:30 AM, requires training)';
    RAISE NOTICE '- david.miller@consulting.com (2 bookings: 9:30 AM and 1:00 PM)';
END $$;
