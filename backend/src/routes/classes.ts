import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { query } from '../config/database';

const router = express.Router();

// Validation rules
const classValidation = [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Class name must be between 1 and 200 characters'),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('subject').optional().trim().isLength({ min: 1, max: 100 }),
  body('duration_minutes').optional().isInt({ min: 15, max: 480 }).withMessage('Duration must be between 15 and 480 minutes'),
  body('max_students').optional().isInt({ min: 1, max: 100 }),
  body('price_per_class').optional().isDecimal().withMessage('Price must be a valid decimal')
];

const classIdValidation = [
  param('id').isUUID().withMessage('Invalid class ID format')
];

const scheduleValidation = [
  body('day_of_week').isInt({ min: 0, max: 6 }).withMessage('Day of week must be between 0 (Sunday) and 6 (Saturday)'),
  body('start_time').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
  body('end_time').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format')
];

// Get all classes with optional filters
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, subject } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereClause += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (subject) {
      paramCount++;
      whereClause += ` AND subject = $${paramCount}`;
      params.push(subject);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM classes ${whereClause}`;
    const countResult = await query(countQuery, params.slice(0, paramCount));
    const total = parseInt(countResult.rows[0].count);

    // Get classes with enrollment info
    paramCount++;
    const classesQuery = `
      SELECT
        c.id, c.name, c.description, c.subject, c.duration_minutes, c.max_students, c.price_per_class,
        c.created_at, c.updated_at,
        ces.enrolled_students,
        ces.enrollment_percentage
      FROM classes c
      LEFT JOIN class_enrollment_summary ces ON c.id = ces.class_id
      ${whereClause}
      ORDER BY c.name
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(limit, offset);

    const result = await query(classesQuery, params);

    res.json({
      success: true,
      data: {
        classes: result.rows,
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

// Get single class by ID with detailed information
router.get('/:id', classIdValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;

    // Get class details
    const classQuery = `
      SELECT
        c.*,
        ces.enrolled_students,
        ces.enrollment_percentage
      FROM classes c
      LEFT JOIN class_enrollment_summary ces ON c.id = ces.class_id
      WHERE c.id = $1
    `;

    const classResult = await query(classQuery, [id]);

    if (classResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Class not found' }
      });
    }

    const classData = classResult.rows[0];

    // Get class schedules
    const schedulesQuery = `
      SELECT id, day_of_week, start_time, end_time, is_active
      FROM class_schedules
      WHERE class_id = $1
      ORDER BY day_of_week, start_time
    `;
    const schedulesResult = await query(schedulesQuery, [id]);

    // Get enrolled students
    const studentsQuery = `
      SELECT
        s.id, s.name, s.grade, s.email,
        sce.enrolled_at, sce.is_active
      FROM students s
      JOIN student_class_enrollments sce ON s.id = sce.student_id
      WHERE sce.class_id = $1 AND sce.is_active = true
      ORDER BY s.name
    `;
    const studentsResult = await query(studentsQuery, [id]);

    res.json({
      success: true,
      data: {
        ...classData,
        schedules: schedulesResult.rows,
        enrolled_students: studentsResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create new class
router.post('/', classValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, description, subject, duration_minutes, max_students, price_per_class } = req.body;

    const queryStr = `
      INSERT INTO classes (name, description, subject, duration_minutes, max_students, price_per_class)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await query(queryStr, [name, description, subject, duration_minutes, max_students, price_per_class]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Class created successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Update class
router.put('/:id', [...classIdValidation, ...classValidation], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { name, description, subject, duration_minutes, max_students, price_per_class } = req.body;

    const queryStr = `
      UPDATE classes
      SET name = $1, description = $2, subject = $3, duration_minutes = $4, max_students = $5, price_per_class = $6
      WHERE id = $7
      RETURNING *
    `;

    const result = await query(queryStr, [name, description, subject, duration_minutes, max_students, price_per_class, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Class not found' }
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Class updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Delete class
router.delete('/:id', classIdValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;

    const result = await query('DELETE FROM classes WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Class not found' }
      });
    }

    res.json({
      success: true,
      message: 'Class deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Class schedules management
router.get('/:id/schedules', classIdValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;

    const queryStr = `
      SELECT id, day_of_week, start_time, end_time, is_active, created_at, updated_at
      FROM class_schedules
      WHERE class_id = $1
      ORDER BY day_of_week, start_time
    `;

    const result = await query(queryStr, [id]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Add class schedule
router.post('/:id/schedules', [...classIdValidation, ...scheduleValidation], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { day_of_week, start_time, end_time } = req.body;

    const queryStr = `
      INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await query(queryStr, [id, day_of_week, start_time, end_time]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Class schedule added successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Update class schedule
router.put('/:id/schedules/:scheduleId',
  [classIdValidation, param('scheduleId').isUUID(), ...scheduleValidation],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id, scheduleId } = req.params;
      const { day_of_week, start_time, end_time, is_active } = req.body;

      const queryStr = `
        UPDATE class_schedules
        SET day_of_week = $1, start_time = $2, end_time = $3, is_active = $4
        WHERE id = $5 AND class_id = $6
        RETURNING *
      `;

      const result = await query(queryStr, [day_of_week, start_time, end_time, is_active, scheduleId, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { message: 'Schedule not found' }
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
        message: 'Class schedule updated successfully'
      });
    } catch (error) {
      next(error);
    }
  });

// Delete class schedule
router.delete('/:id/schedules/:scheduleId',
  [classIdValidation, param('scheduleId').isUUID()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id, scheduleId } = req.params;

      const result = await query(
        'DELETE FROM class_schedules WHERE id = $1 AND class_id = $2 RETURNING id',
        [scheduleId, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { message: 'Schedule not found' }
        });
      }

      res.json({
        success: true,
        message: 'Class schedule deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  });

// Get upcoming class occurrences
router.get('/:id/occurrences', classIdValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { limit = 10 } = req.query;

    const queryStr = `
      SELECT
        co.id, co.occurrence_date, co.start_time, co.end_time,
        co.actual_duration_minutes, co.was_cancelled, co.notes
      FROM class_occurrences co
      WHERE co.class_id = $1
      ORDER BY co.occurrence_date DESC, co.start_time DESC
      LIMIT $2
    `;

    const result = await query(queryStr, [id, limit]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

export default router;
