import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { query, getClient } from '../config/database';

const router = express.Router();

// Validation rules
const paymentValidation = [
  body('student_id').isUUID().withMessage('Valid student ID is required'),
  body('payment_method').isIn(['wechat', 'cash', 'zelle', 'paypal', 'credit_card', 'bank_transfer'])
    .withMessage('Invalid payment method'),
  body('amount').isDecimal({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('classes_purchased').isInt({ min: 1 }).withMessage('Classes purchased must be at least 1'),
  body('payment_reference').optional().trim().isLength({ min: 1, max: 100 }),
  body('notes').optional().trim().isLength({ max: 1000 }),
  body('class_allocations').optional().isArray().withMessage('Class allocations must be an array'),
  body('class_allocations.*.class_id').optional().isUUID().withMessage('Valid class ID required'),
  body('class_allocations.*.classes_allocated').optional().isInt({ min: 1 }).withMessage('Classes allocated must be at least 1')
];

const paymentIdValidation = [
  param('id').isUUID().withMessage('Invalid payment ID format')
];

// Get all payments with optional filters
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, student_id, payment_method, date_from, date_to } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (student_id) {
      paramCount++;
      whereClause += ` AND p.student_id = $${paramCount}`;
      params.push(student_id);
    }

    if (payment_method) {
      paramCount++;
      whereClause += ` AND p.payment_method = $${paramCount}`;
      params.push(payment_method);
    }

    if (date_from) {
      paramCount++;
      whereClause += ` AND p.payment_date >= $${paramCount}`;
      params.push(date_from);
    }

    if (date_to) {
      paramCount++;
      whereClause += ` AND p.payment_date <= $${paramCount}`;
      params.push(date_to);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM payments p ${whereClause}`;
    const countResult = await query(countQuery, params.slice(0, paramCount));
    const total = parseInt(countResult.rows[0].count);

    // Get payments with student info
    paramCount++;
    const paymentsQuery = `
      SELECT
        p.id, p.amount, p.classes_purchased, p.classes_remaining, p.payment_method,
        p.payment_date, p.payment_reference, p.notes, p.created_at, p.updated_at,
        s.name as student_name, s.grade, s.email,
        COUNT(pca.class_id) as classes_allocated_to
      FROM payments p
      JOIN students s ON p.student_id = s.id
      LEFT JOIN payment_class_allocations pca ON p.id = pca.payment_id
      ${whereClause}
      GROUP BY p.id, s.name, s.grade, s.email
      ORDER BY p.payment_date DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(limit, offset);

    const result = await query(paymentsQuery, params);

    res.json({
      success: true,
      data: {
        payments: result.rows,
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

// Get single payment by ID
router.get('/:id', paymentIdValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;

    const paymentQuery = `
      SELECT
        p.*,
        s.name as student_name, s.grade, s.email
      FROM payments p
      JOIN students s ON p.student_id = s.id
      WHERE p.id = $1
    `;

    const paymentResult = await query(paymentQuery, [id]);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Payment not found' }
      });
    }

    const paymentData = paymentResult.rows[0];

    // Get allocated classes
    const allocationsQuery = `
      SELECT
        c.id, c.name, c.subject,
        pca.classes_allocated
      FROM payment_class_allocations pca
      JOIN classes c ON pca.class_id = c.id
      WHERE pca.payment_id = $1
    `;
    const allocationsResult = await query(allocationsQuery, [id]);

    res.json({
      success: true,
      data: {
        ...paymentData,
        class_allocations: allocationsResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create new payment
router.post('/', paymentValidation, async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { student_id, payment_method, amount, classes_purchased, payment_reference, notes, class_allocations } = req.body;

    // If class_allocations are provided, validate that student is enrolled in those classes
    if (class_allocations && Array.isArray(class_allocations)) {
      for (const allocation of class_allocations) {
        const enrollmentCheck = await client.query(
          'SELECT id FROM student_class_enrollments WHERE student_id = $1 AND class_id = $2 AND is_active = true',
          [student_id, allocation.class_id]
        );

        if (enrollmentCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: { message: `Student is not enrolled in class ${allocation.class_id}` }
          });
        }
      }
    }

    // Calculate classes remaining (initially same as purchased)
    const classes_remaining = classes_purchased;

    // Create payment record
    const paymentQuery = `
      INSERT INTO payments (student_id, payment_method, amount, classes_purchased, classes_remaining, payment_reference, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const paymentResult = await client.query(paymentQuery, [
      student_id, payment_method, amount, classes_purchased, classes_remaining, payment_reference, notes
    ]);

    const payment = paymentResult.rows[0];

    // If class allocations are provided, create them
    if (class_allocations && Array.isArray(class_allocations)) {
      for (const allocation of class_allocations) {
        // Check for overdue occurrences for this class
        const overdueQuery = `
          SELECT co.id as occurrence_id, co.occurrence_date
          FROM class_occurrences co
          JOIN student_attendance sa ON co.id = sa.class_occurrence_id
          WHERE sa.student_id = $1
            AND co.class_id = $2
            AND co.is_overdue = true
            AND sa.attendance_status = 'present'
          ORDER BY co.occurrence_date ASC
          LIMIT $3
        `;

        const overdueOccurrences = await client.query(overdueQuery, [
          student_id,
          allocation.class_id,
          allocation.allocated_classes
        ]);

        // Create payment allocation
        await client.query(
          'INSERT INTO payment_class_allocations (payment_id, class_id, classes_allocated) VALUES ($1, $2, $3)',
          [payment.id, allocation.class_id, allocation.allocated_classes]
        );

        // Handle overdue deductions
        if (overdueOccurrences.rows.length > 0) {
          for (const overdue of overdueOccurrences.rows) {
            // Check if deduction already exists
            const existingDeduction = await client.query(
              'SELECT id FROM payment_deductions WHERE student_id = $1 AND occurrence_id = $2',
              [student_id, overdue.occurrence_id]
            );

            if (existingDeduction.rows.length === 0) {
              // Create overdue deduction record
              await client.query(`
                INSERT INTO payment_deductions (student_id, class_id, occurrence_id, payment_id, classes_deducted, is_overdue_deduction)
                VALUES ($1, $2, $3, $4, 1, true)
              `, [student_id, allocation.class_id, overdue.occurrence_id, payment.id]);

              // Remove overdue status
              await client.query(`
                UPDATE class_occurrences
                SET is_overdue = false
                WHERE id = $1
              `, [overdue.occurrence_id]);

              console.log(`✅ Overdue deduction created for occurrence ${overdue.occurrence_id} on ${overdue.occurrence_date}`);
            }
          }
        }
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: payment,
      message: 'Payment created successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Update payment (for corrections)
router.put('/:id', [...paymentIdValidation, ...paymentValidation], async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { student_id, payment_method, amount, classes_purchased, payment_reference, notes } = req.body;

    // Get current payment to calculate adjustment
    const currentPaymentQuery = 'SELECT * FROM payments WHERE id = $1';
    const currentPaymentResult = await client.query(currentPaymentQuery, [id]);

    if (currentPaymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: { message: 'Payment not found' }
      });
    }

    const currentPayment = currentPaymentResult.rows[0];

    // Calculate new classes remaining (can't be less than 0 or more than purchased)
    const newClassesRemaining = Math.max(0, Math.min(classes_purchased, currentPayment.classes_remaining + (classes_purchased - currentPayment.classes_purchased)));

    const updateQuery = `
      UPDATE payments
      SET student_id = $1, payment_method = $2, amount = $3, classes_purchased = $4,
          classes_remaining = $5, payment_reference = $6, notes = $7
      WHERE id = $8
      RETURNING *
    `;

    const result = await client.query(updateQuery, [
      student_id, payment_method, amount, classes_purchased, newClassesRemaining,
      payment_reference, notes, id
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Payment updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Delete payment
router.delete('/:id', paymentIdValidation, async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;

    const result = await client.query('DELETE FROM payments WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: { message: 'Payment not found' }
      });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Allocate payment to specific classes
router.post('/:id/allocate', paymentIdValidation, async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { allocations } = req.body; // Array of {class_id, classes_allocated}

    if (!Array.isArray(allocations) || allocations.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: { message: 'Class allocations are required' }
      });
    }

    // Verify payment exists and get current classes remaining
    const paymentQuery = 'SELECT classes_remaining FROM payments WHERE id = $1';
    const paymentResult = await client.query(paymentQuery, [id]);

    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: { message: 'Payment not found' }
      });
    }

    const payment = paymentResult.rows[0];
    const totalClassesToAllocate = allocations.reduce((sum, allocation) => sum + allocation.allocated_classes, 0);

    if (totalClassesToAllocate > payment.classes_remaining) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: { message: 'Cannot allocate more classes than remaining in payment' }
      });
    }

    // Delete existing allocations
    await client.query('DELETE FROM payment_class_allocations WHERE payment_id = $1', [id]);

    // Create new allocations
    for (const allocation of allocations) {
      const allocationQuery = `
        INSERT INTO payment_class_allocations (payment_id, class_id, classes_allocated)
        VALUES ($1, $2, $3)
      `;
      await client.query(allocationQuery, [id, allocation.class_id, allocation.allocated_classes]);
    }

    // Update payment classes remaining
    const newClassesRemaining = payment.classes_remaining - totalClassesToAllocate;
    await client.query('UPDATE payments SET classes_remaining = $1 WHERE id = $2', [newClassesRemaining, id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Payment allocated to classes successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Get payment allocations
router.get('/:id/allocations', paymentIdValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;

    const queryStr = `
      SELECT
        c.id, c.name, c.subject,
        pca.classes_allocated
      FROM payment_class_allocations pca
      JOIN classes c ON pca.class_id = c.id
      WHERE pca.payment_id = $1
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

// Get payment statistics
router.get('/stats/summary', async (req, res, next) => {
  try {
    const { period = '30 days' } = req.query;

    const dateFilter = period === '7 days'
      ? 'AND payment_date >= CURRENT_DATE - INTERVAL \'7 days\''
      : 'AND payment_date >= CURRENT_DATE - INTERVAL \'30 days\'';

    const statsQuery = `
      SELECT
        COUNT(*) as total_payments,
        SUM(amount) as total_amount,
        SUM(classes_purchased) as total_classes_purchased,
        payment_method,
        COUNT(DISTINCT student_id) as unique_students
      FROM payments
      WHERE 1=1 ${dateFilter}
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `;

    const result = await query(statsQuery);

    // Calculate totals
    const totals = result.rows.reduce((acc, row) => {
      acc.total_payments += parseInt(row.total_payments);
      acc.total_amount += parseFloat(row.total_amount);
      acc.total_classes_purchased += parseInt(row.total_classes_purchased);
      acc.unique_students = Math.max(acc.unique_students, parseInt(row.unique_students));
      return acc;
    }, { total_payments: 0, total_amount: 0, total_classes_purchased: 0, unique_students: 0 });

    res.json({
      success: true,
      data: {
        period,
        payment_methods: result.rows,
        totals
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
