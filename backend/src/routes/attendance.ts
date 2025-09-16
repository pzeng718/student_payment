import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { query, getClient } from '../config/database';

const router = express.Router();

// Validation rules
const occurrenceValidation = [
  body('class_id').isUUID().withMessage('Valid class ID is required'),
  body('occurrence_date').isDate().withMessage('Valid occurrence date is required'),
  body('start_time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
  body('end_time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format'),
  body('notes').optional().trim().isLength({ max: 1000 })
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
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { class_id, occurrence_date, start_time, end_time, notes } = req.body;

    const queryStr = `
      INSERT INTO class_occurrences (class_id, occurrence_date, start_time, end_time, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await query(queryStr, [class_id, occurrence_date, start_time, end_time, notes]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Class occurrence created successfully'
    });
  } catch (error) {
    next(error);
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

    // Get enrolled students with attendance status
    const attendanceQuery = `
      SELECT
        s.id, s.name, s.grade, s.email,
        CASE
          WHEN sa.attendance_status IS NOT NULL THEN sa.attendance_status
          ELSE 'not_recorded'
        END as attendance_status,
        sa.check_in_time, sa.check_out_time, sa.notes as attendance_notes,
        sa.created_at as attendance_recorded_at
      FROM student_class_enrollments sce
      JOIN students s ON sce.student_id = s.id
      LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.class_occurrence_id = $1
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
