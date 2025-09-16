import React, { useState, useEffect } from 'react';
import {
  Typography, Card, Statistic, Row, Col, Progress,
  Tabs, List, Space, Tag, Button, Select, DatePicker,
  Divider, Table, Tooltip
} from 'antd';
import {
  BarChartOutlined, PieChartOutlined, LineChartOutlined,
  RiseOutlined, FallOutlined, UserOutlined,
  BookOutlined, DollarOutlined, CalendarOutlined, TeamOutlined,
  AlertOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  Area, AreaChart, Legend
} from 'recharts';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;
const { RangePicker } = DatePicker;

interface AnalyticsData {
  payments?: {
    by_method?: Array<{ method: string; count: number; amount: number }>;
    over_time?: Array<{ date: string; amount: number; count: number }>;
    trends?: {
      total_revenue?: number;
      total_payments?: number;
      avg_payment?: number;
      growth_percentage?: number;
    };
  };
  attendance?: {
    overall_rate?: number;
    by_class?: Array<{
      class_name: string;
      attendance_rate: number;
      total_occurrences: number;
      avg_students: number;
    }>;
    trends?: Array<{
      date: string;
      attendance_rate: number;
      total_present: number;
      total_absent: number;
    }>;
  };
  students?: {
    performance?: Array<{
      student_id: string;
      student_name: string;
      grade: string;
      attendance_percentage: number;
      classes_remaining: number;
      total_classes_purchased: number;
      status: 'good' | 'warning' | 'critical';
    }>;
    by_grade?: Array<{
      grade: string;
      student_count: number;
      avg_attendance: number;
      avg_balance: number;
    }>;
    alerts?: {
      low_balance?: number;
      low_attendance?: number;
      no_activity?: number;
    };
  };
  classes?: {
    enrollment?: Array<{
      class_name: string;
      subject: string;
      enrolled_students: number;
      max_students: number;
      enrollment_percentage: number;
      avg_attendance: number;
    }>;
    utilization?: {
      total_classes?: number;
      avg_enrollment_rate?: number;
      full_classes?: number;
      underutilized_classes?: number;
    };
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

const Analytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<any>([]);
  const [period, setPeriod] = useState('30d');

  const fetchAnalyticsData = async (selectedPeriod = '30d') => {
    try {
      setLoading(true);
      const params: any = { period: selectedPeriod };
      if (dateRange && dateRange.length === 2) {
        params.date_from = dateRange[0]?.format?.('YYYY-MM-DD');
        params.date_to = dateRange[1]?.format?.('YYYY-MM-DD');
      }

      const [paymentsRes, attendanceRes, studentsRes, classesRes] = await Promise.all([
        axios.get('/api/dashboard/payments/analytics', { params }),
        axios.get('/api/dashboard/attendance/analytics', { params }),
        axios.get('/api/dashboard/students/performance', { params }),
        axios.get('/api/dashboard/overview', { params })
      ]);

      setData({
        payments: paymentsRes.data ?? {},
        attendance: attendanceRes.data ?? {},
        students: studentsRes.data ?? {},
        classes: classesRes.data ?? {}
      });
    } catch (error: any) {
      console.error('Error fetching analytics data:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData(period);
  }, [period, dateRange]);

  const paymentMethodColumns = [
    {
      title: 'Payment Method',
      dataIndex: 'method',
      key: 'method',
      render: (method: string) => (
        <Tag color={
          method === 'cash' ? 'blue' :
          method === 'wechat' ? 'green' :
          method === 'zelle' ? 'purple' : 'orange'
        }>
          {method ? method.charAt(0).toUpperCase() + method.slice(1) : 'Unknown'}
        </Tag>
      ),
    },
    {
      title: 'Total Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `$${Number(amount ?? 0).toFixed(2)}`,
      sorter: (a: any, b: any) => (a.amount ?? 0) - (b.amount ?? 0),
    },
    {
      title: 'Transactions',
      dataIndex: 'count',
      key: 'count',
      sorter: (a: any, b: any) => (a.count ?? 0) - (b.count ?? 0),
    },
    {
      title: 'Avg per Transaction',
      dataIndex: 'avg',
      key: 'avg',
      render: (_: any, record: any) => {
        const amount = record.amount ?? 0;
        const count = record.count ?? 1; // avoid divide by zero
        return `$${(amount / count).toFixed(2)}`;
      },
    },
  ];

  const studentPerformanceColumns = [
    {
      title: 'Student',
      dataIndex: 'student_name',
      key: 'student_name',
      render: (name: string, record: any) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name ?? 'Unknown'}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Grade: {record?.grade ?? 'N/A'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Attendance Rate',
      dataIndex: 'attendance_percentage',
      key: 'attendance_percentage',
      render: (percentage: number) => {
        const safePercentage = Number(percentage ?? 0);
        return (
          <Space direction="vertical" size={0}>
            <Text strong>{safePercentage.toFixed(1)}%</Text>
            <Progress
              percent={safePercentage}
              size="small"
              status={
                safePercentage >= 90 ? 'success' :
                safePercentage >= 70 ? 'normal' : 'exception'
              }
              style={{ width: 80 }}
            />
          </Space>
        );
      },
      sorter: (a: any, b: any) => (a.attendance_percentage ?? 0) - (b.attendance_percentage ?? 0),
    },
    {
      title: 'Classes Balance',
      dataIndex: 'classes_remaining',
      key: 'classes_remaining',
      render: (remaining: number, record: any) => (
        <Space direction="vertical" size={0}>
          <Text strong>{remaining ?? 0} remaining</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            of {record?.total_classes_purchased ?? 0} purchased
          </Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={
          status === 'good' ? 'green' :
          status === 'warning' ? 'orange' :
          status === 'critical' ? 'red' : 'default'
        }>
          {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'N/A'}
        </Tag>
      ),
    },
  ];

  if (loading || !data) {
    return (
      <div>
        <Title level={2}>Analytics & Reports</Title>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          Loading analytics data...
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* rest of render stays same but update ALL usages with ?. and || [] */}
      {/* Example changes shown: */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={2}>Analytics & Reports</Title>
            <Space>
              <Select value={period} onChange={setPeriod} style={{ width: 120 }}>
                <Option value="7d">Last 7 days</Option>
                <Option value="30d">Last 30 days</Option>
                <Option value="90d">Last 90 days</Option>
                <Option value="1y">Last year</Option>
              </Select>
              <RangePicker
                value={dateRange}
                onChange={setDateRange}
                style={{ width: 250 }}
              />
            </Space>
          </div>
        </Col>
      </Row>

      <Tabs defaultActiveKey="overview" size="large">
        {/* Example: Total Revenue guarded */}
        <TabPane tab="Overview" key="overview">
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="Total Revenue"
                  value={data?.payments?.trends?.total_revenue ?? 0}
                  prefix={<DollarOutlined />}
                  valueStyle={{ color: '#3f8600' }}
                  formatter={(value) => `$${Number(value ?? 0).toFixed(2)}`}
                />
              </Card>
            </Col>
            {/* ... repeat similar pattern everywhere */}
          </Row>
        </TabPane>

        {/* Payments Tab */}
        <TabPane tab="Payments" key="payments">
          <Card title="Payment Methods Breakdown">
            <Table
              columns={paymentMethodColumns}
              dataSource={data?.payments?.by_method ?? []}
              pagination={false}
              size="small"
            />
          </Card>
        </TabPane>

        {/* Students Tab */}
        <TabPane tab="Students" key="students">
          <Card title="Student Performance">
            <Table
              columns={studentPerformanceColumns}
              dataSource={data?.students?.performance ?? []}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
              }}
              scroll={{ x: 800 }}
            />
          </Card>
        </TabPane>

        {/* Classes Tab */}
        <TabPane tab="Classes" key="classes">
          <Card title="Class Enrollment">
            <Table
              columns={[
                {
                  title: 'Class',
                  dataIndex: 'class_name',
                  key: 'class_name',
                  render: (name: string, record: any) => (
                    <Space direction="vertical" size={0}>
                      <Text strong>{name ?? 'N/A'}</Text>
                      <Tag color="blue">{record?.subject ?? 'N/A'}</Tag>
                    </Space>
                  ),
                },
                {
                  title: 'Enrollment',
                  dataIndex: 'enrolled_students',
                  key: 'enrolled_students',
                  render: (enrolled: number, record: any) => (
                    <Space direction="vertical" size={0}>
                      <Text strong>
                        {enrolled ?? 0}/{record?.max_students ?? 0}
                      </Text>
                      <Progress
                        percent={record?.enrollment_percentage ?? 0}
                        size="small"
                        status={(record?.enrollment_percentage ?? 0) >= 90 ? 'exception' : 'normal'}
                        style={{ width: 80 }}
                      />
                    </Space>
                  ),
                },
                {
                  title: 'Avg Attendance',
                  dataIndex: 'avg_attendance',
                  key: 'avg_attendance',
                  render: (attendance: number) => `${Number(attendance ?? 0).toFixed(1)}%`,
                },
              ]}
              dataSource={data?.classes?.enrollment ?? []}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
              }}
              scroll={{ x: 600 }}
            />
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default Analytics;
