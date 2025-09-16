import express from 'express';
import { query } from '../config/database';

const router = express.Router();

// Get dashboard overview statistics
router.get('/overview', async (req, res, next) => {
  try {
    const { period = '30 days' } = req.query;

    const dateFilter = period === '7 days'
      ? 'AND created_at >= CURRENT_DATE - INTERVAL \'7 days\''
      : 'AND created_at >= CURRENT_DATE - INTERVAL \'30 days\'';

    // Get key metrics
    const metricsQuery = `
      SELECT
        (SELECT COUNT(*) FROM students) as total_students,
        (SELECT COUNT(*) FROM classes) as total_classes,
        (SELECT COUNT(*) FROM class_occurrences WHERE occurrence_date >= CURRENT_DATE - INTERVAL '7 days') as recent_occurrences,
        (SELECT COUNT(*) FROM payments WHERE payment_date >= CURRENT_DATE - INTERVAL '7 days') as recent_payments,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days') as monthly_revenue,
        (SELECT COUNT(*) FROM student_class_enrollments WHERE is_active = true) as active_enrollments
    `;

    const metricsResult = await query(metricsQuery);
    const metrics = metricsResult.rows[0];

    // Get recent payments
    const recentPaymentsQuery = `
      SELECT
        p.id, p.amount, p.classes_purchased, p.payment_method,
        p.payment_date, s.name as student_name, s.grade
      FROM payments p
      JOIN students s ON p.student_id = s.id
      WHERE p.payment_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY p.payment_date DESC
      LIMIT 10
    `;

    const recentPayments = await query(recentPaymentsQuery);

    // Get upcoming classes (next 7 days)
    const upcomingClassesQuery = `
      SELECT
        co.id, co.occurrence_date, co.start_time, co.end_time,
        c.name as class_name, c.subject,
        COUNT(sa.id) as attendance_count,
        c.max_students
      FROM class_occurrences co
      JOIN classes c ON co.class_id = c.id
      LEFT JOIN student_attendance sa ON co.id = sa.class_occurrence_id
      WHERE co.occurrence_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
      AND co.was_cancelled = false
      GROUP BY co.id, c.name, c.subject, c.max_students
      ORDER BY co.occurrence_date, co.start_time
      LIMIT 10
    `;

    const upcomingClasses = await query(upcomingClassesQuery);

    // Get student balance alerts (students with low balance)
    const balanceAlertsQuery = `
      SELECT
        s.id, s.name, s.grade,
        COALESCE(sb.total_classes_remaining, 0) as remaining_classes,
        COALESCE(sb.total_classes_purchased, 0) as total_purchased
      FROM students s
      LEFT JOIN student_balances sb ON s.id = sb.student_id
      WHERE COALESCE(sb.total_classes_remaining, 0) <= 2
      ORDER BY COALESCE(sb.total_classes_remaining, 0)
      LIMIT 5
    `;

    const balanceAlerts = await query(balanceAlertsQuery);

    // Get class enrollment statistics
    const enrollmentStatsQuery = `
      WITH class_stats AS (
        SELECT
            c.subject,
            c.id AS class_id,
            COUNT(sce.student_id) AS enrolled_students,
            c.max_students,
            CASE 
            WHEN c.max_students IS NOT NULL AND c.max_students > 0
            THEN (COUNT(sce.student_id)::decimal / c.max_students::decimal) * 100
            ELSE NULL
            END AS enrollment_percentage
        FROM classes c
        LEFT JOIN student_class_enrollments sce 
            ON c.id = sce.class_id AND sce.is_active = true
        GROUP BY c.subject, c.id, c.max_students
        )
        SELECT
        subject,
        SUM(enrolled_students) AS total_enrolled_students,
        COUNT(CASE WHEN max_students IS NOT NULL THEN 1 END) AS classes_with_limit,
        ROUND(AVG(enrollment_percentage), 2) AS avg_enrollment_percentage
        FROM class_stats
        GROUP BY subject
        ORDER BY total_enrolled_students DESC;
    `;

    const enrollmentStats = await query(enrollmentStatsQuery);

    res.json({
      success: true,
      data: {
        metrics,
        recent_payments: recentPayments.rows,
        upcoming_classes: upcomingClasses.rows,
        balance_alerts: balanceAlerts.rows,
        enrollment_stats: enrollmentStats.rows,
        period
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get payment analytics
router.get('/payments/analytics', async (req, res, next) => {
  try {
    const { period = '30 days', group_by = 'day' } = req.query;

    const dateFilter = period === '7 days'
      ? 'WHERE payment_date >= CURRENT_DATE - INTERVAL \'7 days\''
      : 'WHERE payment_date >= CURRENT_DATE - INTERVAL \'30 days\'';

    const groupByClause = group_by === 'week'
      ? 'DATE_TRUNC(\'week\', payment_date)'
      : group_by === 'month'
      ? 'DATE_TRUNC(\'month\', payment_date)'
      : 'DATE_TRUNC(\'day\', payment_date)';

    const analyticsQuery = `
      SELECT
        ${groupByClause} as period,
        COUNT(*) as payment_count,
        SUM(amount) as total_amount,
        SUM(classes_purchased) as total_classes,
        AVG(amount) as average_payment,
        COUNT(DISTINCT student_id) as unique_students
      FROM payments
      ${dateFilter}
      GROUP BY ${groupByClause}
      ORDER BY period
    `;

    const result = await query(analyticsQuery);

    // Get payment method distribution
    const methodDistributionQuery = `
      SELECT
        payment_method,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        ROUND((SUM(amount) / (SELECT SUM(amount) FROM payments ${dateFilter}) * 100), 2) as percentage
      FROM payments
      ${dateFilter}
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `;

    const methodDistribution = await query(methodDistributionQuery);

    res.json({
      success: true,
      data: {
        time_series: result.rows,
        method_distribution: methodDistribution.rows,
        period,
        group_by
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get attendance analytics
router.get('/attendance/analytics', async (req, res, next) => {
  try {
    const { period = '30 days', class_id } = req.query;

    const dateFilter = period === '7 days'
      ? 'AND co.occurrence_date >= CURRENT_DATE - INTERVAL \'7 days\''
      : 'AND co.occurrence_date >= CURRENT_DATE - INTERVAL \'30 days\'';

    let classFilter = '';
    const params: any[] = [];
    if (class_id) {
      classFilter = 'AND co.class_id = $1';
      params.push(class_id);
    }

    // Overall attendance statistics
    const overallStatsQuery = `
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
        ) as overall_attendance_rate
      FROM class_occurrences co
      LEFT JOIN student_attendance sa ON co.id = sa.class_occurrence_id
      WHERE 1=1 ${dateFilter} ${classFilter}
    `;

    const overallStats = await query(overallStatsQuery, params);

    // Attendance by class
    const classAttendanceQuery = `
      SELECT
        c.id, c.name, c.subject,
        COUNT(co.id) as total_occurrences,
        COUNT(CASE WHEN co.was_cancelled = false THEN 1 END) as completed_occurrences,
        COUNT(sa.id) as attendance_records,
        ROUND(
          (COUNT(CASE WHEN sa.attendance_status = 'present' THEN 1 END)::decimal /
           NULLIF(COUNT(sa.id), 0)) * 100, 2
        ) as attendance_rate
      FROM classes c
      LEFT JOIN class_occurrences co ON c.id = co.class_id ${dateFilter}
      LEFT JOIN student_attendance sa ON co.id = sa.class_occurrence_id
      GROUP BY c.id, c.name, c.subject
      ORDER BY attendance_rate DESC NULLS LAST
      LIMIT 10
    `;

    const classAttendance = await query(classAttendanceQuery);

    // Attendance trends over time
    const trendsQuery = `
      SELECT
        DATE_TRUNC('day', co.occurrence_date) as date,
        COUNT(*) as occurrences,
        COUNT(sa.id) as attendance_records,
        COUNT(CASE WHEN sa.attendance_status = 'present' THEN 1 END) as present_count,
        ROUND(
          (COUNT(CASE WHEN sa.attendance_status = 'present' THEN 1 END)::decimal /
           NULLIF(COUNT(sa.id), 0)) * 100, 2
        ) as daily_attendance_rate
      FROM class_occurrences co
      LEFT JOIN student_attendance sa ON co.id = sa.class_occurrence_id
      WHERE co.was_cancelled = false ${dateFilter} ${classFilter}
      GROUP BY DATE_TRUNC('day', co.occurrence_date)
      ORDER BY date DESC
      LIMIT 30
    `;

    const trends = await query(trendsQuery, params);

    res.json({
      success: true,
      data: {
        overall_stats: overallStats.rows[0],
        class_attendance: classAttendance.rows,
        trends: trends.rows,
        period,
        class_id: class_id || null
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get student performance analytics
router.get('/students/performance', async (req, res, next) => {
  try {
    const { limit = 20, sort_by = 'attendance_percentage' } = req.query;

    const sortColumn = sort_by === 'classes_attended'
      ? 'classes_attended'
      : sort_by === 'classes_remaining'
      ? 'total_classes_remaining'
      : 'attendance_percentage';

    const performanceQuery = `
      SELECT
        s.id, s.name, s.grade,
        COALESCE(sb.total_classes_purchased, 0) as total_classes_purchased,
        COALESCE(sb.total_classes_remaining, 0) as total_classes_remaining,
        COALESCE(sb.classes_attended, 0) as classes_attended,
        COALESCE(sb.classes_used, 0) as classes_used,
        COALESCE(sb.attendance_percentage, 0) as attendance_percentage,
        CASE
          WHEN COALESCE(sb.total_classes_remaining, 0) <= 2 THEN 'low_balance'
          WHEN COALESCE(sb.attendance_percentage, 0) < 70 THEN 'low_attendance'
          ELSE 'good_standing'
        END as status
      FROM students s
      LEFT JOIN student_balances sb ON s.id = sb.student_id
      ORDER BY
        CASE WHEN $1 = 'attendance_percentage' THEN COALESCE(sb.attendance_percentage, 0) END DESC,
        CASE WHEN $1 = 'classes_attended' THEN COALESCE(sb.classes_attended, 0) END DESC,
        CASE WHEN $1 = 'classes_remaining' THEN COALESCE(sb.total_classes_remaining, 0) END DESC
      LIMIT $2
    `;

    const result = await query(performanceQuery, [sortColumn, limit]);

    // Get students with low balance
    const lowBalanceQuery = `
      SELECT COUNT(*) as count
      FROM students s
      LEFT JOIN student_balances sb ON s.id = sb.student_id
      WHERE COALESCE(sb.total_classes_remaining, 0) <= 2
    `;

    const lowBalance = await query(lowBalanceQuery);

    // Get students with low attendance
    const lowAttendanceQuery = `
      SELECT COUNT(*) as count
      FROM students s
      LEFT JOIN student_balances sb ON s.id = sb.student_id
      WHERE COALESCE(sb.attendance_percentage, 0) < 70
      AND COALESCE(sb.total_classes_purchased, 0) > 0
    `;

    const lowAttendance = await query(lowAttendanceQuery);

    res.json({
      success: true,
      data: {
        students: result.rows,
        alerts: {
          low_balance: parseInt(lowBalance.rows[0].count),
          low_attendance: parseInt(lowAttendance.rows[0].count)
        },
        sort_by,
        limit: Number(limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get system health status
router.get('/health', async (req, res, next) => {
  try {
    // Check database connection
    const dbHealth = await query('SELECT 1 as status');

    // Get recent activity
    const recentActivityQuery = `
      SELECT
        (SELECT COUNT(*) FROM students WHERE created_at >= CURRENT_DATE - INTERVAL '24 hours') as new_students_24h,
        (SELECT COUNT(*) FROM payments WHERE payment_date >= CURRENT_DATE - INTERVAL '24 hours') as new_payments_24h,
        (SELECT COUNT(*) FROM class_occurrences WHERE occurrence_date = CURRENT_DATE) as today_occurrences,
        (SELECT COUNT(*) FROM payments WHERE classes_remaining <= 2) as low_balance_students
    `;

    const recentActivity = await query(recentActivityQuery);

    res.json({
      success: true,
      data: {
        system_status: 'healthy',
        database: 'connected',
        recent_activity: recentActivity.rows[0],
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        message: 'System health check failed',
        details: error.message
      }
    });
  }
});

export default router;
