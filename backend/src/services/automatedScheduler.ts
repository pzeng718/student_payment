import cron from 'node-cron';
import { getClient } from '../config/database';

export async function startAutomatedScheduler() {
  console.log('🚀 Starting scheduler...');

  // Run immediately on startup to catch up on any missed occurrences
  await checkAndCreateOccurrences();

  // Run every 5 minutes to check for classes that should have occurred
  const scheduledTask = cron.schedule('*/5 * * * *', async () => {
    await checkAndCreateOccurrences();
  });

  console.log('✅ Scheduler running every 5 minutes');

  // Return the scheduled task so it can be stopped if needed
  return scheduledTask;
}

// Export function for manual testing
export async function testScheduler() {
  await checkAndCreateOccurrences();
}

// Helper function to get Eastern Time
function getEasternTime() {
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  return etTime;
}

async function checkAndCreateOccurrences() {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Use Eastern Time for all operations
    const etNow = getEasternTime();
    const currentTime = etNow.toTimeString().slice(0, 5); // HH:MM format in ET
    const today = etNow.toISOString().split('T')[0]; // YYYY-MM-DD format in ET
    const dayOfWeek = etNow.getDay(); // 0 = Sunday, 1 = Monday, etc. in ET

    // Show current UTC time for comparison
    const utcNow = new Date();
    const utcTime = utcNow.toTimeString().slice(0, 5);
    const utcDate = utcNow.toISOString().split('T')[0];
    const utcDayOfWeek = utcNow.getUTCDay();

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
        AND cs.start_time <= $2
    `;

    const schedules = await client.query(schedulesQuery, [dayOfWeek, currentTime]);

    if (schedules.rows.length > 0) {
      console.log(`[ET] Found ${schedules.rows.length} classes for today: ${schedules.rows.map(s => s.class_name).join(', ')}`);
    }

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

        // Calculate end time using Eastern Time
        const startTime = schedule.start_time;
        console.log(`  Processing ${schedule.class_name}: start=${startTime}, duration=${schedule.duration_minutes || 'null'}`);

        const [startHours, startMinutes] = startTime.split(':').map(Number);

        // Create start time in ET using more robust method
        const startDateTime = new Date(today);
        startDateTime.setHours(startHours, startMinutes, 0, 0);

        // Calculate end time by adding duration in minutes
        const durationMs = (schedule.duration_minutes || 60) * 60000; // Default to 60 minutes if null
        const endDateTime = new Date(startDateTime.getTime() + durationMs);

        console.log(`  Start datetime: ${startDateTime.toISOString()}`);
        console.log(`  End datetime: ${endDateTime.toISOString()}`);

        // Format end time as HH:MM
        const endHours = endDateTime.getHours().toString().padStart(2, '0');
        const endMinutes = endDateTime.getMinutes().toString().padStart(2, '0');
        const endTime = `${endHours}:${endMinutes}`;

        // Validate the end time
        if (isNaN(endDateTime.getTime()) || endHours === 'NaN' || endMinutes === 'NaN') {
          console.error(`  ❌ Invalid end time calculated for ${schedule.class_name}: ${endTime}`);
          console.error(`     Start time: ${startTime}, Duration: ${schedule.duration_minutes}`);
          console.error(`     Start datetime: ${startDateTime.toISOString()}, End datetime: ${endDateTime.toISOString()}`);
          continue;
        }

        console.log(`  ✅ End time calculated: ${endTime}`);

        // Create the occurrence
        const occurrenceQuery = `
          INSERT INTO class_occurrences (class_id, schedule_id, occurrence_date, start_time, end_time, is_auto_created)
          VALUES ($1, $2, $3, $4, $5, true)
          RETURNING *
        `;

        console.log(`  📝 Creating occurrence: ${schedule.class_name} from ${startTime} to ${endTime}`);

        const occurrenceResult = await client.query(occurrenceQuery, [
          schedule.class_id,
          schedule.id,
          today,
          startTime,
          endTime
        ]);

        const occurrence = occurrenceResult.rows[0];
        console.log(`  ✅ Occurrence created with ID: ${occurrence.id}`);

        try {
          // Get all enrolled students for this class (excluding already processed ones)
        const enrolledStudentsQuery = `
          SELECT sce.student_id, s.name as student_name, s.email, s.grade
          FROM student_class_enrollments sce
          JOIN students s ON sce.student_id = s.id
          WHERE sce.class_id = $1
            AND sce.is_active = true
            AND NOT EXISTS (
              SELECT 1 FROM student_attendance sa
              WHERE sa.student_id = sce.student_id
                AND sa.class_occurrence_id = $2
            )
          ORDER BY s.name
        `;

        const enrolledStudents = await client.query(enrolledStudentsQuery, [schedule.class_id, occurrence.id]);

        let processedCount = 0;
        let skippedCount = 0;

        // Create attendance records and deduct payments for each student
        for (const student of enrolledStudents.rows) {
          try {
                // Create attendance record as 'present' by default
            await client.query(`
              INSERT INTO student_attendance (student_id, class_occurrence_id, attendance_status)
              VALUES ($1, $2, 'present')
            `, [student.student_id, occurrence.id]);

            // Deduct payment balance (includes overdue logic)
            const deductionResult = await deductPaymentBalance(client, student.student_id, schedule.class_id, occurrence.id);

            if (deductionResult.success) {
              processedCount++;
            } else {
              skippedCount++;
            }

          } catch (studentError: any) {
            skippedCount++;
          }
        }

        if (processedCount > 0) {
          console.log(`✅ ${schedule.class_name}: ${processedCount} students processed${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`);
        }
        } catch (studentProcessingError: any) {
          console.error(`❌ Error processing students for ${schedule.class_name}:`, studentProcessingError.message);
        }

      } catch (scheduleError: any) {
        console.error(`❌ ${schedule.class_name}:`, scheduleError.message);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Scheduler completed');

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Scheduler error:', error.message);
  } finally {
    client.release();
  }
}

// Helper function to deduct payment balance for a student (includes overdue logic)
async function deductPaymentBalance(client: any, studentId: string, classId: string, occurrenceId: string) {
  try {
    // Check if deduction already exists for this occurrence to prevent double deduction
    const existingDeduction = await client.query(
      'SELECT id FROM payment_deductions WHERE student_id = $1 AND occurrence_id = $2',
      [studentId, occurrenceId]
    );

    if (existingDeduction.rows.length > 0) {
      return { success: false, reason: 'already_exists' };
    }

    // Find available payment for this student and class
    const paymentQuery = `
      SELECT
        p.id,
        p.classes_remaining,
        pca.classes_allocated,
        (pca.classes_allocated - COALESCE(used.classes_used, 0)) as available_classes,
        p.payment_date,
        c.price_per_class
      FROM payments p
      JOIN payment_class_allocations pca ON p.id = pca.payment_id
      JOIN classes c ON c.id = pca.class_id
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

    if (paymentResult.rows.length === 0) {
      // No payment available - mark occurrence as overdue for this student
      await client.query(`
        UPDATE class_occurrences
        SET is_overdue = true
        WHERE id = $1
      `, [occurrenceId]);

      return { success: false, reason: 'no_payment_available_overdue' };
    }

    const payment = paymentResult.rows[0];
    const classPrice = parseFloat(payment.price_per_class || '0');

    // Double-check that we have classes remaining in this payment
    if (payment.classes_remaining <= 0) {
      // Mark as overdue
      await client.query(`
        UPDATE class_occurrences
        SET is_overdue = true
        WHERE id = $1
      `, [occurrenceId]);

      return { success: false, reason: 'no_classes_remaining_overdue' };
    }

    const availableClasses = payment.classes_allocated - (payment.available_classes || 0);
    if (availableClasses <= 0) {
      // Mark as overdue
      await client.query(`
        UPDATE class_occurrences
        SET is_overdue = true
        WHERE id = $1
      `, [occurrenceId]);

      return { success: false, reason: 'no_allocated_classes_overdue' };
    }

    // Create payment deduction record
    const deductionResult = await client.query(`
      INSERT INTO payment_deductions (student_id, class_id, occurrence_id, payment_id, classes_deducted)
      VALUES ($1, $2, $3, $4, 1)
      RETURNING id
    `, [studentId, classId, occurrenceId, payment.id]);

    // Update payment remaining count
    await client.query(`
      UPDATE payments
      SET classes_remaining = classes_remaining - 1
      WHERE id = $1
    `, [payment.id]);

    // Remove overdue status if it was set
    await client.query(`
      UPDATE class_occurrences
      SET is_overdue = false
      WHERE id = $1
    `, [occurrenceId]);

    return { success: true, payment_id: payment.id, deduction_id: deductionResult.rows[0].id };

  } catch (error: any) {
    return { success: false, reason: 'error', error: error.message };
  }
}
