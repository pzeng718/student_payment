import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { query } from '../config/database';

const router = express.Router();

// Validation rules
const studentValidation = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be between 1 and 100 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('grade').optional().trim().isLength({ min: 1, max: 20 }),
  body('phone').optional().trim().isLength({ min: 1, max: 20 }),
  body('emergency_contact').optional().trim().isLength({ min: 1, max: 100 }),
  body('emergency_phone').optional().trim().isLength({ min: 1, max: 20 }),
  body('notes').optional().trim().isLength({ max: 1000 })
];

const studentIdValidation = [
  param('id').isUUID().withMessage('Invalid student ID format')
];

// Get all students with optional filters
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, grade } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereClause += ` AND (name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (grade) {
      paramCount++;
      whereClause += ` AND grade = $${paramCount}`;
      params.push(grade);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM students ${whereClause}`;
    const countResult = await query(countQuery, params.slice(0, paramCount));
    const total = parseInt(countResult.rows[0].count);

    // Get students
    paramCount++;
    const studentsQuery = `
      SELECT
        id, name, email, grade, phone, emergency_contact, emergency_phone, notes,
        created_at, updated_at
      FROM students
      ${whereClause}
      ORDER BY name
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(limit, offset);

    const result = await query(studentsQuery, params);

    res.json({
      success: true,
      data: {
        students: result.rows,
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

// Get single student by ID
router.get('/:id', studentIdValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;

    const queryStr = `
      SELECT
        s.id, s.name, s.email, s.grade, s.phone, s.emergency_contact, s.emergency_phone, s.notes,
        s.created_at, s.updated_at,
        COALESCE(sb.total_classes_purchased, 0) as total_classes_purchased,
        COALESCE(sb.total_classes_remaining, 0) as total_classes_remaining,
        COALESCE(sb.classes_attended, 0) as classes_attended,
        COALESCE(sb.classes_used, 0) as classes_used,
        sb.attendance_percentage
      FROM students s
      LEFT JOIN student_balances sb ON s.id = sb.student_id
      WHERE s.id = $1
    `;

    const result = await query(queryStr, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Student not found' }
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

// Create new student
router.post('/', studentValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, grade, phone, emergency_contact, emergency_phone, notes } = req.body;

    const queryStr = `
      INSERT INTO students (name, email, grade, phone, emergency_contact, emergency_phone, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, email, grade, phone, emergency_contact, emergency_phone, notes, created_at, updated_at
    `;

    const result = await query(queryStr, [name, email, grade, phone, emergency_contact, emergency_phone, notes]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Student created successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Update student
router.put('/:id', [...studentIdValidation, ...studentValidation], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { name, email, grade, phone, emergency_contact, emergency_phone, notes } = req.body;

    const queryStr = `
      UPDATE students
      SET name = $1, email = $2, grade = $3, phone = $4, emergency_contact = $5, emergency_phone = $6, notes = $7
      WHERE id = $8
      RETURNING id, name, email, grade, phone, emergency_contact, emergency_phone, notes, created_at, updated_at
    `;

    const result = await query(queryStr, [name, email, grade, phone, emergency_contact, emergency_phone, notes, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Student not found' }
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Student updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Delete student
router.delete('/:id', studentIdValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;

    const result = await query('DELETE FROM students WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Student not found' }
      });
    }

    res.json({
      success: true,
      message: 'Student deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get student's enrolled classes
router.get('/:id/classes', studentIdValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;

    const queryStr = `
      SELECT
        c.id, c.name, c.subject, c.description, c.price_per_class,
        sce.enrolled_at, sce.is_active
      FROM classes c
      JOIN student_class_enrollments sce ON c.id = sce.class_id
      WHERE sce.student_id = $1 AND sce.is_active = true
      ORDER BY c.name
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

// Enroll student in class
router.post('/:id/enroll/:classId', [studentIdValidation, param('classId').isUUID()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id, classId } = req.params;

    const queryStr = `
      INSERT INTO student_class_enrollments (student_id, class_id)
      VALUES ($1, $2)
      ON CONFLICT (student_id, class_id) DO UPDATE SET
        is_active = true,
        enrolled_at = CURRENT_TIMESTAMP
      RETURNING id
    `;

    await query(queryStr, [id, classId]);

    res.status(201).json({
      success: true,
      message: 'Student enrolled in class successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Unenroll student from class
router.delete('/:id/unenroll/:classId', [studentIdValidation, param('classId').isUUID()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id, classId } = req.params;

    const result = await query(
      'UPDATE student_class_enrollments SET is_active = false WHERE student_id = $1 AND class_id = $2 RETURNING id',
      [id, classId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Enrollment not found' }
      });
    }

    res.json({
      success: true,
      message: 'Student unenrolled from class successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
