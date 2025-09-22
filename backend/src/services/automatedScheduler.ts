import cron from 'node-cron';
import { query, getClient } from '../config/database';

export async function startAutomatedScheduler() {
  console.log('🚀 Starting automated scheduler...');

  // Run every 5 minutes to check for classes that should have occurred
  cron.schedule('*/5 * * * *', async () => {
    console.log('🔄 Running automated class occurrence check...');
    await checkAndCreateOccurrences();
  });

  // Also run at the start to catch up on any missed occurrences
  await checkAndCreateOccurrences();

  console.log('✅ Automated scheduler started successfully');
}

async function checkAndCreateOccurrences() {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    console.log(`📅 Checking for classes on ${today} (Day ${dayOfWeek}) at ${currentTime}`);

    // Find all active class schedules that should have occurred but don't have occurrences yet
    const schedulesQuery = `
      SELECT
        cs.*,
        c.name as class_name,
        c.price_per_class,
        c.duration_minutes,
        c.max_students
      FROM class_schedules cs
      JOIN classes c ON cs.class_id = c.id
      WHERE cs.day_of_week = $1
        AND cs.is_active = true
        AND cs.is_active = true
        AND cs.start_time <= $2
    `;

    const schedules = await client.query(schedulesQuery, [dayOfWeek, currentTime]);

    console.log(`📋 Found ${schedules.rows.length} potential class schedules to check`);

    for (const schedule of schedules.rows) {
      try {
        // Check if occurrence already exists for this schedule today
        const existingQuery = `
          SELECT id FROM class_occurrences
          WHERE class_id = $1
            AND schedule_id = $2
            AND occurrence_date = $3
            AND start_time = $4
        `;

        const existing = await client.query(existingQuery, [
          schedule.class_id,
          schedule.id,
          today,
          schedule.start_time
        ]);

        if (existing.rows.length > 0) {
          console.log(`⏭️  Skipping ${schedule.class_name} - occurrence already exists`);
          continue;
        }

        console.log(`🎯 Creating occurrence for ${schedule.class_name} at ${schedule.start_time}`);

        // Calculate end time
        const startTime = schedule.start_time;
        const [hours, minutes] = startTime.split(':').map(Number);
        const startDateTime = new Date(today);
        startDateTime.setHours(hours, minutes, 0, 0);

        const endDateTime = new Date(startDateTime.getTime() + (schedule.duration_minutes * 60000));
        const endTime = endDateTime.toTimeString().slice(0, 5);

        // Create the occurrence
        const occurrenceQuery = `
          INSERT INTO class_occurrences (class_id, schedule_id, occurrence_date, start_time, end_time, is_auto_created)
          VALUES ($1, $2, $3, $4, $5, true)
          RETURNING *
        `;

        const occurrenceResult = await client.query(occurrenceQuery, [
          schedule.class_id,
          schedule.id,
          today,
          startTime,
          endTime
        ]);

        const occurrence = occurrenceResult.rows[0];

        // Get all enrolled students for this class
        const enrolledStudentsQuery = `
          SELECT sce.student_id, s.name as student_name
          FROM student_class_enrollments sce
          JOIN students s ON sce.student_id = s.id
          WHERE sce.class_id = $1 AND sce.is_active = true
          ORDER BY s.name
        `;

        const enrolledStudents = await client.query(enrolledStudentsQuery, [schedule.class_id]);

        console.log(`👥 Processing ${enrolledStudents.rows.length} enrolled students for ${schedule.class_name}`);

        // Create attendance records and deduct payments for each student
        for (const student of enrolledStudents.rows) {
          try {
            // Create attendance record as 'present' by default
            await client.query(`
              INSERT INTO student_attendance (student_id, class_occurrence_id, attendance_status)
              VALUES ($1, $2, 'present')
            `, [student.student_id, occurrence.id]);

            // Deduct payment balance
            await deductPaymentBalance(client, student.student_id, schedule.class_id, occurrence.id);

            console.log(`✅ Processed ${student.student_name} for ${schedule.class_name}`);
          } catch (studentError: any) {
            console.error(`❌ Error processing student ${student.student_name}:`, studentError.message);
          }
        }

        console.log(`🎉 Successfully created occurrence for ${schedule.class_name} with ${enrolledStudents.rows.length} students`);

      } catch (scheduleError: any) {
        console.error(`❌ Error processing schedule ${schedule.class_name}:`, scheduleError.message);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Automated occurrence creation completed');

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Error in automated scheduler:', error.message);
  } finally {
    client.release();
  }
}

// Helper function to deduct payment balance for a student
async function deductPaymentBalance(client: any, studentId: string, classId: string, occurrenceId: string) {
  // Check if deduction already exists for this occurrence to prevent double deduction
  const existingDeduction = await client.query(
    'SELECT id FROM payment_deductions WHERE student_id = $1 AND occurrence_id = $2',
    [studentId, occurrenceId]
  );

  if (existingDeduction.rows.length > 0) {
    console.log(`⚠️  Skipping deduction - already exists for student ${studentId}, occurrence ${occurrenceId}`);
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

    console.log(`💰 Deducted 1 class from payment ${payment.id} for student ${studentId}`);
  } else {
    console.log(`⚠️  No available payment found for student ${studentId}, class ${classId}`);
  }
}
