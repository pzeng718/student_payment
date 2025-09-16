# Student Class Balance Tracker

A comprehensive fullstack application for managing student class enrollments, payments, attendance, and balance tracking. Built with React + TypeScript + Ant Design for the frontend and Node.js + Express + PostgreSQL for the backend.

## 🚀 Features

### Core Features
- **Student Management**: Complete CRUD operations for students with contact information, grades, and emergency contacts
- **Class Management**: Create and manage classes with schedules, capacity limits, and pricing
- **Payment Processing**: Multiple payment methods (WeChat, Cash, Zelle, PayPal, Credit Card, Bank Transfer)
- **Attendance Tracking**: Real-time attendance recording with detailed statistics
- **Balance Management**: Automatic calculation of student class balances and usage tracking
- **Analytics Dashboard**: Comprehensive reporting and visualizations

### Dashboard Overview
- Key metrics (total students, classes, revenue, enrollments)
- Recent payment activity
- Upcoming class schedules
- Low balance alerts
- Enrollment statistics by subject

### Advanced Features
- **Multi-day Classes**: Support for recurring classes on multiple days of the week
- **Payment Allocation**: Allocate payments to specific classes
- **Bulk Operations**: Bulk attendance recording and management
- **Progress Tracking**: Visual progress bars for enrollment capacity and student balances
- **Responsive Design**: Mobile-friendly interface

## 🛠 Technology Stack

### Frontend
- **React 18** with TypeScript
- **Ant Design** UI framework
- **React Router** for navigation
- **Axios** for API calls
- **Recharts** for data visualization

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **PostgreSQL** with UUID support
- **pg** PostgreSQL client
- **Express Validator** for input validation
- **CORS, Helmet, Compression** for security and performance

### Database
- **PostgreSQL 15**
- UUID primary keys
- Foreign key constraints
- Views for common queries
- Triggers for automatic timestamp updates
- Sample data included

## 📁 Project Structure

```
student_payment/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts          # Database configuration
│   │   ├── controllers/             # Business logic (future)
│   │   ├── middleware/
│   │   │   ├── errorHandler.ts     # Error handling middleware
│   │   │   └── notFoundHandler.ts  # 404 handler
│   │   ├── models/                 # Database models (future)
│   │   ├── routes/
│   │   │   ├── students.ts         # Student API routes
│   │   │   ├── classes.ts          # Class API routes
│   │   │   ├── payments.ts         # Payment API routes
│   │   │   ├── attendance.ts       # Attendance API routes
│   │   │   └── dashboard.ts        # Dashboard API routes
│   │   └── server.ts               # Main server file
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx          # Main header component
│   │   │   └── Sidebar.tsx         # Navigation sidebar
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # Dashboard page
│   │   │   ├── Students.tsx        # Students management
│   │   │   ├── Classes.tsx         # Classes management
│   │   │   ├── Payments.tsx        # Payments management
│   │   │   ├── Attendance.tsx      # Attendance management
│   │   │   └── Analytics.tsx       # Analytics & reports
│   │   ├── App.tsx                 # Main app component
│   │   ├── App.css
│   │   └── index.tsx
│   ├── package.json
│   └── tsconfig.json
├── database/
│   └── schema.sql                  # Complete database schema
├── docker/
│   ├── backend.Dockerfile          # Backend container config
│   └── frontend.Dockerfile         # Frontend container config
├── docker-compose.yml              # Complete application stack
└── README.md
```

## 🚀 Quick Start

### Using Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd student_payment
   ```

2. **Start the application**
   ```bash
   docker-compose up -d
   ```

3. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Database: localhost:5432

### Manual Setup

#### Backend Setup

1. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb student_payment_tracker

   # Run schema
   psql -d student_payment_tracker -f ../database/schema.sql
   ```

4. **Start backend**
   ```bash
   npm run dev
   ```

#### Frontend Setup

1. **Install dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Start frontend**
   ```bash
   npm start
   ```

## 📊 Database Schema

### Core Tables
- **students**: Student information and contact details
- **classes**: Class definitions with pricing and capacity
- **class_schedules**: Recurring class schedules by day/time
- **student_class_enrollments**: Many-to-many student-class relationships
- **class_occurrences**: Actual class instances that occurred
- **student_attendance**: Attendance records for each occurrence
- **payments**: Payment records with multiple methods
- **payment_class_allocations**: Link payments to specific classes

### Views
- **student_balances**: Calculated student balance information
- **class_enrollment_summary**: Class enrollment statistics
- **recent_payments**: Recent payment activity

## 🔌 API Endpoints

### Students
- `GET /api/students` - List students with filtering
- `GET /api/students/:id` - Get student details
- `POST /api/students` - Create new student
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student
- `GET /api/students/:id/classes` - Get student's enrolled classes
- `POST /api/students/:id/enroll/:classId` - Enroll student in class
- `DELETE /api/students/:id/unenroll/:classId` - Unenroll student

### Classes
- `GET /api/classes` - List classes
- `GET /api/classes/:id` - Get class details
- `POST /api/classes` - Create new class
- `PUT /api/classes/:id` - Update class
- `DELETE /api/classes/:id` - Delete class
- `GET /api/classes/:id/schedules` - Get class schedules
- `POST /api/classes/:id/schedules` - Add class schedule
- `PUT /api/classes/:id/schedules/:scheduleId` - Update schedule
- `DELETE /api/classes/:id/schedules/:scheduleId` - Delete schedule

### Payments
- `GET /api/payments` - List payments
- `GET /api/payments/:id` - Get payment details
- `POST /api/payments` - Create payment
- `PUT /api/payments/:id` - Update payment
- `DELETE /api/payments/:id` - Delete payment
- `POST /api/payments/:id/allocate` - Allocate payment to classes
- `GET /api/payments/stats/summary` - Payment statistics

### Attendance
- `POST /api/attendance/occurrences` - Create class occurrence
- `GET /api/attendance/occurrences` - List occurrences
- `GET /api/attendance/occurrences/:id` - Get occurrence details
- `POST /api/attendance/occurrences/:occurrenceId/attendance` - Record attendance
- `PUT /api/attendance/occurrences/:occurrenceId/attendance/:studentId` - Update attendance
- `POST /api/attendance/occurrences/:occurrenceId/bulk-attendance` - Bulk attendance recording
- `GET /api/attendance/classes/:classId/stats` - Class attendance statistics

### Dashboard
- `GET /api/dashboard/overview` - Dashboard overview data
- `GET /api/dashboard/payments/analytics` - Payment analytics
- `GET /api/dashboard/attendance/analytics` - Attendance analytics
- `GET /api/dashboard/students/performance` - Student performance
- `GET /api/dashboard/health` - System health check

## 🎨 UI Components

### Dashboard
- **Statistics Cards**: Key metrics with icons and color coding
- **Recent Payments Table**: Latest payment activity
- **Upcoming Classes Table**: Next 7 days of scheduled classes
- **Balance Alerts**: Students with low remaining classes
- **Enrollment Stats**: Subject-wise enrollment with capacity indicators

### Navigation
- **Responsive Sidebar**: Collapsible navigation menu
- **Header**: Application title and user menu
- **Routing**: React Router for seamless navigation

## 🔒 Security Features

- **Input Validation**: Express-validator for request validation
- **CORS Protection**: Configured CORS settings
- **Rate Limiting**: API rate limiting to prevent abuse
- **Helmet**: Security headers
- **SQL Injection Prevention**: Parameterized queries
- **Error Handling**: Comprehensive error handling middleware

## 📱 Responsive Design

- **Mobile-First**: Optimized for mobile devices
- **Breakpoint Management**: Responsive layout for different screen sizes
- **Touch-Friendly**: Appropriate button sizes and spacing
- **Collapsible Sidebar**: Mobile-friendly navigation

## 🔄 Future Enhancements

- [ ] User authentication and authorization
- [ ] Role-based access control
- [ ] Email notifications for low balances
- [ ] Advanced reporting with PDF exports
- [ ] Real-time updates with WebSockets
- [ ] Mobile app with React Native
- [ ] Integration with payment gateways
- [ ] Automated class scheduling
- [ ] Student progress tracking
- [ ] Parent portal access

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

If you have any questions or need help, please open an issue in the repository or contact the development team.

---

**Built with ❤️ using React, TypeScript, Ant Design, Node.js, Express, and PostgreSQL**
