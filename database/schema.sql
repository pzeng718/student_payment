-- Student Class Balance Tracker Database Schema
-- PostgreSQL with UUID support and proper relationships
create database student_payment_tracker;

\c student_payment_tracker;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Students table
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    grade VARCHAR(20),
    phone VARCHAR(20),
    emergency_contact VARCHAR(100),
    emergency_phone VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classes table
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    subject VARCHAR(100),
    duration_minutes INTEGER DEFAULT 60,
    max_students INTEGER,
    price_per_class DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Class schedules table (for recurring classes on specific days/times)
CREATE TABLE class_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 1=Monday, etc.
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, day_of_week, start_time) -- Prevent duplicate schedules
);

-- Student class enrollments (many-to-many relationship)
CREATE TABLE student_class_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(student_id, class_id) -- Prevent duplicate enrollments
);

-- Class occurrences (actual instances of classes that took place)
CREATE TABLE class_occurrences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES class_schedules(id) ON DELETE SET NULL,
    occurrence_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    actual_duration_minutes INTEGER,
    notes TEXT,
    was_cancelled BOOLEAN DEFAULT false,
    is_auto_created BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, occurrence_date, start_time) -- Prevent duplicate occurrences
);

-- Student exclusions from class occurrences
CREATE TABLE occurrence_exclusions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    occurrence_id UUID NOT NULL REFERENCES class_occurrences(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(occurrence_id, student_id) -- One exclusion per student per occurrence
);

-- Student attendance tracking
CREATE TABLE student_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_occurrence_id UUID NOT NULL REFERENCES class_occurrences(id) ON DELETE CASCADE,
    attendance_status VARCHAR(20) NOT NULL CHECK (attendance_status IN ('present', 'absent', 'late', 'excused')),
    check_in_time TIME,
    check_out_time TIME,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, class_occurrence_id) -- One attendance record per student per occurrence
);
-- Payment types enum
CREATE TYPE payment_method AS ENUM ('wechat', 'cash', 'zelle', 'paypal', 'credit_card', 'bank_transfer');

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    payment_method payment_method NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    classes_purchased INTEGER NOT NULL CHECK (classes_purchased > 0),
    classes_remaining INTEGER NOT NULL CHECK (classes_remaining >= 0),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_reference VARCHAR(100), -- Transaction ID or reference number
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- Payment deductions tracking (links attendance to payment usage)
CREATE TABLE payment_deductions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    occurrence_id UUID NOT NULL REFERENCES class_occurrences(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    classes_deducted INTEGER NOT NULL DEFAULT 1 CHECK (classes_deducted > 0),
    deduction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, occurrence_id) -- One deduction per student per occurrence
);

-- Payment class allocation (which classes the payment covers)
CREATE TABLE payment_class_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    classes_allocated INTEGER NOT NULL CHECK (classes_allocated > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(payment_id, class_id)
);

-- Indexes for better performance
CREATE INDEX idx_students_name ON students(name);
CREATE INDEX idx_students_grade ON students(grade);
CREATE INDEX idx_classes_name ON classes(name);
CREATE INDEX idx_class_schedules_class_id ON class_schedules(class_id);
CREATE INDEX idx_class_schedules_day_time ON class_schedules(day_of_week, start_time);
CREATE INDEX idx_student_enrollments_student_id ON student_class_enrollments(student_id);
CREATE INDEX idx_student_enrollments_class_id ON student_class_enrollments(class_id);
CREATE INDEX idx_class_occurrences_class_id ON class_occurrences(class_id);
CREATE INDEX idx_class_occurrences_date ON class_occurrences(occurrence_date);
CREATE INDEX idx_class_occurrences_auto_created ON class_occurrences(is_auto_created);
CREATE INDEX idx_occurrence_exclusions_occurrence_id ON occurrence_exclusions(occurrence_id);
CREATE INDEX idx_occurrence_exclusions_student_id ON occurrence_exclusions(student_id);
CREATE INDEX idx_student_attendance_student_id ON student_attendance(student_id);
CREATE INDEX idx_student_attendance_occurrence_id ON student_attendance(class_occurrence_id);
CREATE INDEX idx_payment_deductions_student_id ON payment_deductions(student_id);
CREATE INDEX idx_payment_deductions_class_id ON payment_deductions(class_id);
CREATE INDEX idx_payment_deductions_occurrence_id ON payment_deductions(occurrence_id);
CREATE INDEX idx_payment_deductions_payment_id ON payment_deductions(payment_id);
CREATE INDEX idx_payments_student_id ON payments(student_id);
CREATE INDEX idx_payments_date ON payments(payment_date);
CREATE INDEX idx_payment_allocations_payment_id ON payment_class_allocations(payment_id);

-- Triggers to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_schedules_updated_at BEFORE UPDATE ON class_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_occurrences_updated_at BEFORE UPDATE ON class_occurrences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_occurrence_exclusions_updated_at BEFORE UPDATE ON occurrence_exclusions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_attendance_updated_at BEFORE UPDATE ON student_attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_deductions_updated_at BEFORE UPDATE ON payment_deductions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries

-- Student balance view (classes purchased - classes attended)
CREATE VIEW student_balances AS
SELECT
    s.id as student_id,
    s.name as student_name,
    s.grade,
    COALESCE(SUM(p.classes_purchased), 0) as total_classes_purchased,
    COALESCE(SUM(p.classes_remaining), 0) as total_classes_remaining,
    COALESCE(attended.classes_attended, 0) as classes_attended,
    (COALESCE(SUM(p.classes_purchased), 0) - COALESCE(attended.classes_attended, 0)) as classes_used,
    CASE
        WHEN COALESCE(SUM(p.classes_purchased), 0) > 0
        THEN ROUND(
            (COALESCE(attended.classes_attended, 0)::decimal /
             COALESCE(SUM(p.classes_purchased), 0)::decimal) * 100, 2
        )
        ELSE 0
    END as attendance_percentage
FROM students s
LEFT JOIN payments p ON s.id = p.student_id
LEFT JOIN (
    SELECT pd.student_id, SUM(pd.classes_deducted) as classes_attended
    FROM payment_deductions pd
    GROUP BY pd.student_id
) attended ON s.id = attended.student_id
GROUP BY s.id, s.name, s.grade, attended.classes_attended;

-- Class enrollment summary view
CREATE VIEW class_enrollment_summary AS
SELECT
    c.id as class_id,
    c.name as class_name,
    c.subject,
    COUNT(sce.student_id) as enrolled_students,
    c.max_students,
    CASE
        WHEN c.max_students IS NOT NULL
        THEN ROUND((COUNT(sce.student_id)::decimal / c.max_students::decimal) * 100, 2)
        ELSE NULL
    END as enrollment_percentage
FROM classes c
LEFT JOIN student_class_enrollments sce ON c.id = sce.class_id AND sce.is_active = true
GROUP BY c.id, c.name, c.subject, c.max_students;

-- Recent payments view
CREATE VIEW recent_payments AS
SELECT
    p.id,
    p.amount,
    p.classes_purchased,
    p.classes_remaining,
    p.payment_method,
    p.payment_date,
    s.name as student_name,
    s.grade,
    COUNT(pca.class_id) as classes_allocated_to
FROM payments p
JOIN students s ON p.student_id = s.id
LEFT JOIN payment_class_allocations pca ON p.id = pca.payment_id
WHERE p.payment_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.amount, p.classes_purchased, p.classes_remaining, p.payment_method, p.payment_date, s.name, s.grade
ORDER BY p.payment_date DESC;

-- Additional indexes for better performance
CREATE INDEX idx_payments_student_enrolled_classes ON payments(student_id);
CREATE INDEX idx_payment_allocations_enrollment_check ON payment_class_allocations(payment_id, class_id);
