import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { query, getClient } from '../config/database';

// Helper function to deduct payment balance for a student
async function deductPaymentBalance(client: any, studentId: string, classId: string, occurrenceId: string) {
  // Check if deduction already exists for this occurrence to prevent double deduction
  const existingDeduction = await client.query(
    'SELECT id FROM payment_deductions WHERE student_id = $1 AND occurrence_id = $2',
    [studentId, occurrenceId]
  );

  if (existingDeduction.rows.length > 0) {
    // Already deducted for this occurrence, skip
    return;
  }

  // Find available payment for this student and class
  const paymentQuery = `
    SELECT
      p.id,
      pca.classes_allocated,
      (pca.classes_allocated - COALESCE(used.classes_used, 0)) as available_classes
    FROM payments p
    JOIN payment_class_allocations pca ON p.id = pca.payment_id
    LEFT JOIN (
      SELECT pd.payment_id, SUM(pd.classes_deducted) as classes_used
      FROM payment_deductions pd
      WHERE pd.student_id = $1 AND pd.class_id = $2
      GROUP BY pd.payment_id
    ) used ON p.id = used.payment_id
    WHERE p.student_id = $1
      AND pca.class_id = $2
      AND p.classes_remaining > 0
      AND (pca.classes_allocated - COALESCE(used.classes_used, 0)) > 0
    ORDER BY p.payment_date DESC
    LIMIT 1
  `;

  const paymentResult = await client.query(paymentQuery, [studentId, classId]);

  if (paymentResult.rows.length > 0) {
    const payment = paymentResult.rows[0];

    // Create payment deduction record
    await client.query(`
      INSERT INTO payment_deductions (student_id, class_id, occurrence_id, payment_id, classes_deducted)
      VALUES ($1, $2, $3, $4, 1)
    `, [studentId, classId, occurrenceId, payment.id]);

    // Update payment remaining count
    await client.query(`
      UPDATE payments
      SET classes_remaining = classes_remaining - 1
      WHERE id = $1
    `, [payment.id]);
  }
}

// Helper function to refund payment balance for a student (when excluded)
async function refundPaymentBalance(client: any, studentId: string, classId: string, occurrenceId: string) {
  // Find the payment deduction for this student and occurrence
  const deductionQuery = `
    SELECT pd.id, pd.payment_id, pd.classes_deducted
    FROM payment_deductions pd
    WHERE pd.student_id = $1 AND pd.class_id = $2 AND pd.occurrence_id = $3
  `;

  const deductionResult = await client.query(deductionQuery, [studentId, classId, occurrenceId]);

  if (deductionResult.rows.length > 0) {
    const deduction = deductionResult.rows[0];

    // Update payment remaining count (refund)
    await client.query(`
      UPDATE payments
      SET classes_remaining = classes_remaining + $1
      WHERE id = $2
    `, [deduction.classes_deducted, deduction.payment_id]);

    // Remove the payment deduction record
    await client.query(`
      DELETE FROM payment_deductions
      WHERE id = $1
    `, [deduction.id]);

    console.log(`💰 Refunded ${deduction.classes_deducted} class(es) to payment ${deduction.payment_id} for student ${studentId}`);
  } else {
    console.log(`⚠️  No payment deduction found to refund for student ${studentId}, occurrence ${occurrenceId}`);
  }
}

const router = express.Router();

// Validation rules
const occurrenceValidation = [
  body('class_id').isUUID().withMessage('Valid class ID is required'),
  body('occurrence_date').isDate().withMessage('Valid occurrence date is required'),
  body('start_time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
  body('end_time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format'),
  body('notes').optional().trim().isLength({ max: 1000 }),
  body('excluded_students').optional().isArray().withMessage('Excluded students must be an array'),
  body('excluded_students.*.student_id').optional().isUUID().withMessage('Valid student ID required for exclusion'),
  body('excluded_students.*.reason').optional().trim().isLength({ max: 500 })
];

const attendanceValidation = [
  body('student_id').isUUID().withMessage('Valid student ID is required'),
  body('attendance_status').isIn(['present', 'absent', 'late', 'excused']).withMessage('Invalid attendance status'),
  body('check_in_time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Check-in time must be in HH:MM format'),
  body('check_out_time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Check-out time must be in HH:MM format'),
  body('notes').optional().trim().isLength({ max: 1000 })
];

// Create class occurrence
router.post('/occurrences', occurrenceValidation, async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { class_id, occurrence_date, start_time, end_time, notes, excluded_students } = req.body;

    // Create the occurrence
    const occurrenceQuery = `
      INSERT INTO class_occurrences (class_id, occurrence_date, start_time, end_time, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const occurrenceResult = await client.query(occurrenceQuery, [class_id, occurrence_date, start_time, end_time, notes]);
    const occurrence = occurrenceResult.rows[0];

    // Add student exclusions if provided
    if (excluded_students && excluded_students.length > 0) {
      for (const exclusion of excluded_students) {
        await client.query(`
          INSERT INTO occurrence_exclusions (occurrence_id, student_id, reason)
          VALUES ($1, $2, $3)
        `, [occurrence.id, exclusion.student_id, exclusion.reason || null]);
      }
    }

    // Auto-mark attendance for all enrolled students (except excluded ones)
    const enrolledStudentsQuery = `
      SELECT sce.student_id
      FROM student_class_enrollments sce
      WHERE sce.class_id = $1 AND sce.is_active = true
      AND sce.student_id NOT IN (
        SELECT student_id FROM occurrence_exclusions WHERE occurrence_id = $2
      )
    `;

    const enrolledStudents = await client.query(enrolledStudentsQuery, [class_id, occurrence.id]);

    // Create attendance records and deduct payments
    for (const student of enrolledStudents.rows) {
      // Create attendance record as 'present' by default
      await client.query(`
        INSERT INTO student_attendance (student_id, class_occurrence_id, attendance_status)
        VALUES ($1, $2, 'present')
      `, [student.student_id, occurrence.id]);

      // Deduct payment balance
      await deductPaymentBalance(client, student.student_id, class_id, occurrence.id);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: occurrence,
      message: 'Class occurrence created successfully with attendance records'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Get class occurrences with filters
router.get('/occurrences', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, class_id, date_from, date_to, include_cancelled = false } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (class_id) {
      paramCount++;
      whereClause += ` AND co.class_id = $${paramCount}`;
      params.push(class_id);
    }

    if (date_from) {
      paramCount++;
      whereClause += ` AND co.occurrence_date >= $${paramCount}`;
      params.push(date_from);
    }

    if (date_to) {
      paramCount++;
      whereClause += ` AND co.occurrence_date <= $${paramCount}`;
      params.push(date_to);
    }

    if (!include_cancelled) {
      whereClause += ` AND co.was_cancelled = false`;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM class_occurrences co ${whereClause}`;
    const countResult = await query(countQuery, params.slice(0, paramCount));
    const total = parseInt(countResult.rows[0].count);

    // Get occurrences with class info
    paramCount++;
    const occurrencesQuery = `
      SELECT
        co.*,
        c.name as class_name, c.subject,
        COUNT(sa.id) as attendance_count,
        COUNT(CASE WHEN sa.attendance_status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN sa.attendance_status = 'absent' THEN 1 END) as absent_count,
        COUNT(CASE WHEN sa.attendance_status = 'late' THEN 1 END) as late_count
      FROM class_occurrences co
      JOIN classes c ON co.class_id = c.id
      LEFT JOIN student_attendance sa ON co.id = sa.class_occurrence_id
      ${whereClause}
      GROUP BY co.id, c.name, c.subject
      ORDER BY co.occurrence_date DESC, co.start_time DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(limit, offset);

    const result = await query(occurrencesQuery, params);

    res.json({
      success: true,
      data: {
        occurrences: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get single occurrence with attendance details
router.get('/occurrences/:id', param('id').isUUID(), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;

    // Get occurrence details
    const occurrenceQuery = `
      SELECT
        co.*,
        c.name as class_name, c.subject, c.price_per_class
      FROM class_occurrences co
      JOIN classes c ON co.class_id = c.id
      WHERE co.id = $1
    `;

    const occurrenceResult = await query(occurrenceQuery, [id]);

    if (occurrenceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Class occurrence not found' }
      });
    }

    const occurrence = occurrenceResult.rows[0];

    // Get enrolled students with attendance status and exclusions
    const attendanceQuery = `
      SELECT
        s.id as student_id,
        s.name as student_name,
        s.grade,
        s.email,
        sce.id as enrollment_id,
        CASE
          WHEN sa.attendance_status IS NOT NULL THEN sa.attendance_status
          ELSE 'not_recorded'
        END as attendance_status,
        sa.check_in_time, sa.check_out_time, sa.notes as attendance_notes,
        sa.created_at as attendance_recorded_at,
        CASE
          WHEN oe.student_id IS NOT NULL THEN true
          ELSE false
        END as is_excluded,
        oe.reason as exclusion_reason
      FROM student_class_enrollments sce
      JOIN students s ON sce.student_id = s.id
      LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.class_occurrence_id = $1
      LEFT JOIN occurrence_exclusions oe ON oe.student_id = s.id AND oe.occurrence_id = $1
      WHERE sce.class_id = $2 AND sce.is_active = true
      ORDER BY s.name
    `;

    const attendanceResult = await query(attendanceQuery, [id, occurrence.class_id]);

    res.json({
      success: true,
      data: {
        ...occurrence,
        attendance: attendanceResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update occurrence
router.put('/occurrences/:id', [param('id').isUUID(), ...occurrenceValidation], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { start_time, end_time, notes, was_cancelled } = req.body;

    const queryStr = `
      UPDATE class_occurrences
      SET start_time = $1, end_time = $2, notes = $3, was_cancelled = $4
      WHERE id = $5
      RETURNING *
    `;

    const result = await query(queryStr, [start_time, end_time, notes, was_cancelled, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Class occurrence not found' }
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Class occurrence updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Record student attendance for an occurrence
router.post('/occurrences/:occurrenceId/attendance', [
  param('occurrenceId').isUUID(),
  ...attendanceValidation
], async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { occurrenceId } = req.params;
    const { student_id, attendance_status, check_in_time, check_out_time, notes } = req.body;

    // Verify occurrence exists
    const occurrenceCheck = await client.query('SELECT id, class_id FROM class_occurrences WHERE id = $1', [occurrenceId]);
    if (occurrenceCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: { message: 'Class occurrence not found' }
      });
    }

    // Verify student is enrolled in the class
    const enrollmentCheck = await client.query(
      'SELECT id FROM student_class_enrollments WHERE student_id = $1 AND class_id = $2 AND is_active = true',
      [student_id, occurrenceCheck.rows[0].class_id]
    );

    if (enrollmentCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: { message: 'Student is not enrolled in this class' }
      });
    }

    // Upsert attendance record
    const attendanceQuery = `
      INSERT INTO student_attendance (student_id, class_occurrence_id, attendance_status, check_in_time, check_out_time, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (student_id, class_occurrence_id)
      DO UPDATE SET
        attendance_status = EXCLUDED.attendance_status,
        check_in_time = EXCLUDED.check_in_time,
        check_out_time = EXCLUDED.check_out_time,
        notes = EXCLUDED.notes
      RETURNING *
    `;

    const result = await client.query(attendanceQuery, [
      student_id, occurrenceId, attendance_status, check_in_time, check_out_time, notes
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Attendance recorded successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Update student attendance
router.put('/occurrences/:occurrenceId/attendance/:studentId', [
  param('occurrenceId').isUUID(),
  param('studentId').isUUID(),
  ...attendanceValidation
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { occurrenceId, studentId } = req.params;
    const { attendance_status, check_in_time, check_out_time, notes } = req.body;

    const queryStr = `
      UPDATE student_attendance
      SET attendance_status = $1, check_in_time = $2, check_out_time = $3, notes = $4
      WHERE class_occurrence_id = $5 AND student_id = $6
      RETURNING *
    `;

    const result = await query(queryStr, [attendance_status, check_in_time, check_out_time, notes, occurrenceId, studentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Attendance record not found' }
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Attendance updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Bulk record attendance for multiple students
router.post('/occurrences/:occurrenceId/bulk-attendance', [
  param('occurrenceId').isUUID(),
  body('attendance_records').isArray().withMessage('Attendance records must be an array')
], async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { occurrenceId } = req.params;
    const { attendance_records } = req.body;

    if (!Array.isArray(attendance_records) || attendance_records.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: { message: 'Attendance records are required' }
      });
    }

    // Verify occurrence exists
    const occurrenceCheck = await client.query('SELECT id FROM class_occurrences WHERE id = $1', [occurrenceId]);
    if (occurrenceCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: { message: 'Class occurrence not found' }
      });
    }

    const results = [];
    const errors_list = [];

    for (const record of attendance_records) {
      try {
        const { student_id, attendance_status, check_in_time, check_out_time, notes } = record;

        // Verify student is enrolled (this would be a separate query for each, but for bulk operations we might skip this for performance)
        const attendanceQuery = `
          INSERT INTO student_attendance (student_id, class_occurrence_id, attendance_status, check_in_time, check_out_time, notes)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (student_id, class_occurrence_id)
          DO UPDATE SET
            attendance_status = EXCLUDED.attendance_status,
            check_in_time = EXCLUDED.check_in_time,
            check_out_time = EXCLUDED.check_out_time,
            notes = EXCLUDED.notes
          RETURNING *
        `;

        const result = await client.query(attendanceQuery, [
          student_id, occurrenceId, attendance_status, check_in_time, check_out_time, notes
        ]);

        results.push(result.rows[0]);
      } catch (error) {
        errors_list.push({
          student_id: record.student_id,
          error: error.message
        });
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        processed: results.length,
        errors: errors_list.length > 0 ? errors_list : undefined
      },
      message: `Bulk attendance processing completed. Processed: ${results.length}, Errors: ${errors_list.length}`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Add student exclusion to occurrence
router.post('/occurrences/:occurrenceId/exclusions', [
  param('occurrenceId').isUUID(),
  body('student_id').isUUID().withMessage('Valid student ID is required'),
  body('reason').optional().trim().isLength({ max: 500 })
], async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { occurrenceId } = req.params;
    const { student_id, reason } = req.body;

    // Verify occurrence exists
    const occurrenceCheck = await client.query('SELECT id, class_id FROM class_occurrences WHERE id = $1', [occurrenceId]);
    if (occurrenceCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: { message: 'Class occurrence not found' } });
    }

    // Add exclusion
    const exclusionQuery = `
      INSERT INTO occurrence_exclusions (occurrence_id, student_id, reason)
      VALUES ($1, $2, $3)
      ON CONFLICT (occurrence_id, student_id)
      DO UPDATE SET reason = EXCLUDED.reason
      RETURNING *
    `;

    const result = await client.query(exclusionQuery, [occurrenceId, student_id, reason]);

    // Remove any existing attendance record for this student
    await client.query('DELETE FROM student_attendance WHERE student_id = $1 AND class_occurrence_id = $2', [student_id, occurrenceId]);

    // Reverse any payment deduction for this student
    await reversePaymentDeduction(client, student_id, occurrenceId);

    await client.query('COMMIT');

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Student excluded from occurrence successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Remove student exclusion from occurrence
router.delete('/occurrences/:occurrenceId/exclusions/:studentId', [
  param('occurrenceId').isUUID(),
  param('studentId').isUUID()
], async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { occurrenceId, studentId } = req.params;

    // Remove exclusion
    const result = await client.query(
      'DELETE FROM occurrence_exclusions WHERE occurrence_id = $1 AND student_id = $2 RETURNING *',
      [occurrenceId, studentId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: { message: 'Exclusion not found' } });
    }

    // Add attendance record as present
    await client.query(`
      INSERT INTO student_attendance (student_id, class_occurrence_id, attendance_status)
      VALUES ($1, $2, 'present')
    `, [studentId, occurrenceId]);

    // Deduct payment balance
    const occurrence = await client.query('SELECT class_id FROM class_occurrences WHERE id = $1', [occurrenceId]);
    await deductPaymentBalance(client, studentId, occurrence.rows[0].class_id, occurrenceId);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Student exclusion removed successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Update attendance with payment balance management
router.put('/occurrences/:occurrenceId/attendance-with-payment', [
  param('occurrenceId').isUUID(),
  body('student_id').isUUID().withMessage('Valid student ID is required'),
  body('attendance_status').isIn(['present', 'absent', 'late', 'excused']).withMessage('Invalid attendance status'),
  body('update_payment_balance').optional().isBoolean().withMessage('Update payment balance must be boolean'),
  body('check_in_time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Check-in time must be in HH:MM format'),
  body('check_out_time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Check-out time must be in HH:MM format'),
  body('notes').optional().trim().isLength({ max: 1000 })
], async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { occurrenceId } = req.params;
    const { student_id, attendance_status, update_payment_balance = true, check_in_time, check_out_time, notes } = req.body;

    // Get current attendance status
    const currentAttendance = await client.query(
      'SELECT attendance_status FROM student_attendance WHERE student_id = $1 AND class_occurrence_id = $2',
      [student_id, occurrenceId]
    );

    const wasPresent = currentAttendance.rows.length > 0 && currentAttendance.rows[0].attendance_status === 'present';
    const isPresent = attendance_status === 'present';

    // Update attendance record
    const attendanceQuery = `
      INSERT INTO student_attendance (student_id, class_occurrence_id, attendance_status, check_in_time, check_out_time, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (student_id, class_occurrence_id)
      DO UPDATE SET
        attendance_status = EXCLUDED.attendance_status,
        check_in_time = EXCLUDED.check_in_time,
        check_out_time = EXCLUDED.check_out_time,
        notes = EXCLUDED.notes
      RETURNING *
    `;

    const result = await client.query(attendanceQuery, [
      student_id, occurrenceId, attendance_status, check_in_time, check_out_time, notes
    ]);

    // Handle payment balance changes if requested
    if (update_payment_balance) {
      const occurrence = await client.query('SELECT class_id FROM class_occurrences WHERE id = $1', [occurrenceId]);

      if (wasPresent && !isPresent) {
        // Student was present but now is not - reverse deduction
        await reversePaymentDeduction(client, student_id, occurrenceId);
      } else if (!wasPresent && isPresent) {
        // Student was not present but now is - deduct payment
        await deductPaymentBalance(client, student_id, occurrence.rows[0].class_id, occurrenceId);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Attendance updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Helper function to reverse payment deduction
async function reversePaymentDeduction(client: any, studentId: string, occurrenceId: string) {
  // Find the payment deduction for this occurrence
  const deductionQuery = await client.query(
    'SELECT payment_id, classes_deducted FROM payment_deductions WHERE student_id = $1 AND occurrence_id = $2',
    [studentId, occurrenceId]
  );

  if (deductionQuery.rows.length > 0) {
    const deduction = deductionQuery.rows[0];

    // Restore payment balance
    await client.query(
      'UPDATE payments SET classes_remaining = classes_remaining + $1 WHERE id = $2',
      [deduction.classes_deducted, deduction.payment_id]
    );

    // Remove deduction record
    await client.query(
      'DELETE FROM payment_deductions WHERE student_id = $1 AND occurrence_id = $2',
      [studentId, occurrenceId]
    );
  }
}

// Get scheduled classes for calendar view
router.get('/scheduled-classes', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: { message: 'start_date and end_date query parameters are required' }
      });
    }

    const scheduledQuery = `
      SELECT
        cs.id as schedule_id,
        c.id as class_id,
        c.name as class_name,
        c.subject,
        cs.day_of_week,
        cs.start_time,
        cs.end_time,
        c.price_per_class,
        c.max_students,
        c.description
      FROM class_schedules cs
      JOIN classes c ON cs.class_id = c.id
      WHERE cs.is_active = true
      ORDER BY cs.day_of_week, cs.start_time
    `;

    const result = await query(scheduledQuery);

    // Generate scheduled dates within the range
    const scheduledClasses = [];
    const start = new Date(start_date as string);
    const end = new Date(end_date as string);

    for (const schedule of result.rows) {
      const currentDate = new Date(start);

      while (currentDate <= end) {
        if (currentDate.getDay() === schedule.day_of_week) {
          const scheduledDate = currentDate.toISOString().split('T')[0];

          // Check if occurrence already exists
          const existingQuery = `
            SELECT id FROM class_occurrences
            WHERE class_id = $1 AND occurrence_date = $2 AND start_time = $3
          `;

          const existing = await query(existingQuery, [schedule.class_id, scheduledDate, schedule.start_time]);

          scheduledClasses.push({
            id: `${schedule.schedule_id}_${scheduledDate}`,
            schedule_id: schedule.schedule_id,
            class_id: schedule.class_id,
            class_name: schedule.class_name,
            subject: schedule.subject,
            date: scheduledDate,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            price_per_class: schedule.price_per_class,
            max_students: schedule.max_students,
            description: schedule.description,
            has_occurrence: existing.rows.length > 0,
            is_scheduled: true
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    res.json({
      success: true,
      data: {
        scheduled_classes: scheduledClasses
      }
    });
  } catch (error) {
    next(error);
  }
});

// Auto-create occurrences based on class schedules
router.post('/auto-create-occurrences', async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { target_date } = req.body;
    const checkDate = target_date ? new Date(target_date) : new Date();
    const dayOfWeek = checkDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Find all active class schedules for the target day
    const schedulesQuery = `
      SELECT
        cs.*,
        c.name as class_name,
        c.price_per_class,
        c.duration_minutes
      FROM class_schedules cs
      JOIN classes c ON cs.class_id = c.id
      WHERE cs.day_of_week = $1 AND cs.is_active = true
    `;

    const schedules = await client.query(schedulesQuery, [dayOfWeek]);
    const createdOccurrences = [];
    const errors = [];

    for (const schedule of schedules.rows) {
      try {
        // Check if occurrence already exists
        const existingQuery = `
          SELECT id FROM class_occurrences
          WHERE class_id = $1 AND occurrence_date = $2 AND start_time = $3
        `;

        const existing = await client.query(existingQuery, [
          schedule.class_id,
          checkDate.toISOString().split('T')[0],
          schedule.start_time
        ]);

        if (existing.rows.length > 0) {
          continue; // Skip if already exists
        }

        // Create the occurrence
        const occurrenceQuery = `
          INSERT INTO class_occurrences (class_id, schedule_id, occurrence_date, start_time, end_time, is_auto_created)
          VALUES ($1, $2, $3, $4, $5, true)
          RETURNING *
        `;

        const occurrenceResult = await client.query(occurrenceQuery, [
          schedule.class_id,
          schedule.id,
          checkDate.toISOString().split('T')[0],
          schedule.start_time,
          schedule.end_time
        ]);

        const occurrence = occurrenceResult.rows[0];

        // Auto-mark attendance for all enrolled students
        const enrolledStudentsQuery = `
          SELECT sce.student_id
          FROM student_class_enrollments sce
          WHERE sce.class_id = $1 AND sce.is_active = true
        `;

        const enrolledStudents = await client.query(enrolledStudentsQuery, [schedule.class_id]);

        // Create attendance records and deduct payments
        for (const student of enrolledStudents.rows) {
          // Create attendance record as 'present' by default
          await client.query(`
            INSERT INTO student_attendance (student_id, class_occurrence_id, attendance_status)
            VALUES ($1, $2, 'present')
          `, [student.student_id, occurrence.id]);

          // Deduct payment balance
          await deductPaymentBalance(client, student.student_id, schedule.class_id, occurrence.id);
        }

        createdOccurrences.push({
          id: occurrence.id,
          class_name: schedule.class_name,
          date: checkDate.toISOString().split('T')[0],
          start_time: schedule.start_time,
          end_time: schedule.end_time
        });

      } catch (error: any) {
        errors.push({
          class_id: schedule.class_id,
          class_name: schedule.class_name,
          error: error.message
        });
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        created: createdOccurrences.length,
        occurrences: createdOccurrences,
        errors: errors.length > 0 ? errors : undefined
      },
      message: `Auto-created ${createdOccurrences.length} class occurrences for ${schedules.rows.length} schedules`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Get attendance statistics for a class
router.get('/classes/:classId/stats', param('classId').isUUID(), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { classId } = req.params;
    const { period = '30 days' } = req.query;

    const dateFilter = period === '7 days'
      ? 'AND co.occurrence_date >= CURRENT_DATE - INTERVAL \'7 days\''
      : 'AND co.occurrence_date >= CURRENT_DATE - INTERVAL \'30 days\'';

    const statsQuery = `
      SELECT
        COUNT(*) as total_occurrences,
        COUNT(CASE WHEN co.was_cancelled = false THEN 1 END) as completed_occurrences,
        COUNT(sa.id) as total_attendance_records,
        COUNT(CASE WHEN sa.attendance_status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN sa.attendance_status = 'absent' THEN 1 END) as absent_count,
        COUNT(CASE WHEN sa.attendance_status = 'late' THEN 1 END) as late_count,
        COUNT(CASE WHEN sa.attendance_status = 'excused' THEN 1 END) as excused_count,
        ROUND(
          (COUNT(CASE WHEN sa.attendance_status = 'present' THEN 1 END)::decimal /
           NULLIF(COUNT(sa.id), 0)) * 100, 2
        ) as attendance_percentage
      FROM class_occurrences co
      LEFT JOIN student_attendance sa ON co.id = sa.class_occurrence_id
      WHERE co.class_id = $1 ${dateFilter}
    `;

    const result = await query(statsQuery, [classId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Class not found' }
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

export default router;
