import React, { useState, useEffect } from 'react';
import {
  Row, Col, Card, Statistic, Table, List, Typography, Progress,
  Space, Tag, Button, Select, message
} from 'antd';
import {
  UserOutlined, BookOutlined, DollarOutlined, CalendarOutlined,
  TeamOutlined, BarChartOutlined, AlertOutlined
} from '@ant-design/icons';
import axios from 'axios';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;

interface DashboardData {
  metrics: {
    total_students: number;
    total_classes: number;
    recent_occurrences: number;
    recent_payments: number;
    monthly_revenue: number;
    active_enrollments: number;
  };
  recent_payments: Array<{
    id: string;
    amount: number;
    classes_purchased: number;
    payment_method: string;
    payment_date: string;
    student_name: string;
    grade: string;
  }>;
  upcoming_classes: Array<{
    id: string;
    occurrence_date: string;
    start_time: string;
    end_time: string;
    class_name: string;
    subject: string;
    attendance_count: number;
    max_students: number;
  }>;
  balance_alerts: Array<{
    id: string;
    name: string;
    grade: string;
    remaining_classes: number;
    total_purchased: number;
  }>;
  enrollment_stats: Array<{
    subject: string;
    enrolled_students: number;
    classes_with_limit: number;
    avg_enrollment_percentage: number;
  }>;
  period: string;
}

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30 days');

  const fetchDashboardData = async (selectedPeriod = '30 days') => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/dashboard/overview?period=${selectedPeriod}`);
      setData(response.data.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      message.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(period);
  }, [period]);

  const paymentMethodColors: { [key: string]: string } = {
    wechat: 'green',
    cash: 'blue',
    zelle: 'purple',
    paypal: 'orange',
    credit_card: 'red',
    bank_transfer: 'cyan',
  };

  const paymentColumns: ColumnsType<any> = [
    {
      title: 'Student',
      dataIndex: 'student_name',
      key: 'student_name',
      render: (name: string, record: any) => (
        <Space>
          <Text strong>{name}</Text>
          <Tag>{record.grade}</Tag>
        </Space>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: any) => `$${Number(amount).toFixed(2)}`,
    },
    {
      title: 'Classes',
      dataIndex: 'classes_purchased',
      key: 'classes_purchased',
    },
    {
      title: 'Method',
      dataIndex: 'payment_method',
      key: 'payment_method',
      render: (method: string) => (
        <Tag color={paymentMethodColors[method] || 'default'}>
          {method.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'payment_date',
      key: 'payment_date',
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
  ];

  const upcomingClassesColumns: ColumnsType<any> = [
    {
      title: 'Class',
      dataIndex: 'class_name',
      key: 'class_name',
      render: (name: string, record: any) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.subject}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Date & Time',
      key: 'datetime',
      render: (record: any) => (
        <Space direction="vertical" size={0}>
          <Text>{new Date(record.occurrence_date).toLocaleDateString()}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.start_time} - {record.end_time}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Enrollment',
      key: 'enrollment',
      render: (record: any) => (
        <Space direction="vertical" size={0}>
          <Text>{record.attendance_count}/{record.max_students || '∞'}</Text>
          {record.max_students && (
            <Progress
              percent={Math.round((record.attendance_count / record.max_students) * 100)}
              size="small"
              status={record.attendance_count >= record.max_students ? 'exception' : 'normal'}
            />
          )}
        </Space>
      ),
    },
  ];

  if (loading || !data) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={2}>Dashboard</Title>
            <Select value={period} onChange={setPeriod} style={{ width: 120 }}>
              <Option value="7 days">7 Days</Option>
              <Option value="30 days">30 Days</Option>
            </Select>
          </div>
        </Col>
      </Row>

      {/* Key Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Students"
              value={data.metrics.total_students}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Classes"
              value={data.metrics.total_classes}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Monthly Revenue"
              value={data.metrics.monthly_revenue}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#cf1322' }}
              formatter={(value) => `$${Number(value).toFixed(2)}`}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Active Enrollments"
              value={data.metrics.active_enrollments}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Recent Payments */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <DollarOutlined />
                Recent Payments
              </Space>
            }
            extra={<Button type="link" size="small">View All</Button>}
          >
            <Table
              columns={paymentColumns}
              dataSource={data.recent_payments}
              pagination={false}
              size="small"
              scroll={{ x: 600 }}
            />
          </Card>
        </Col>

        {/* Upcoming Classes */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <CalendarOutlined />
                Upcoming Classes
              </Space>
            }
            extra={<Button type="link" size="small">View All</Button>}
          >
            <Table
              columns={upcomingClassesColumns}
              dataSource={data.upcoming_classes}
              pagination={false}
              size="small"
              scroll={{ x: 500 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Balance Alerts */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <AlertOutlined style={{ color: '#faad14' }} />
                Low Balance Alerts
              </Space>
            }
          >
            <List
              dataSource={data.balance_alerts}
              renderItem={(item) => (
                <List.Item style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>{item.name}</Text>
                        <Tag>{item.grade}</Tag>
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary">
                          {item.remaining_classes} classes remaining
                        </Text>
                        <Progress
                          percent={Math.round((item.remaining_classes / item.total_purchased) * 100)}
                          size="small"
                          status={item.remaining_classes <= 2 ? 'exception' : 'normal'}
                          strokeColor={item.remaining_classes <= 2 ? '#ff4d4f' : '#52c41a'}
                        />
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* Enrollment by Subject */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BarChartOutlined />
                Enrollment by Subject
              </Space>
            }
          >
            <List
              dataSource={data.enrollment_stats}
              renderItem={(item) => (
                <List.Item style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <List.Item.Meta
                    title={item.subject}
                    description={
                      <Space direction="vertical" size={0} style={{ width: '100%' }}>
                        <Text type="secondary">
                          {item.enrolled_students} students enrolled
                        </Text>
                        {item.avg_enrollment_percentage && (
                          <div style={{ width: '100%' }}>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              Avg. capacity: {Number(item.avg_enrollment_percentage).toFixed(1)}%
                            </Text>
                            <Progress
                              percent={item.avg_enrollment_percentage}
                              size="small"
                              status={item.avg_enrollment_percentage >= 90 ? 'exception' : 'normal'}
                              strokeColor={
                                item.avg_enrollment_percentage >= 90 ? '#ff4d4f' :
                                item.avg_enrollment_percentage >= 70 ? '#faad14' : '#52c41a'
                              }
                            />
                          </div>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
