import React, { useState, useEffect } from 'react';
import {
  Typography, Table, Button, Space, Modal, Form, Select,
  Popconfirm, message, Tag, Card, Statistic, Row, Col, Progress,
  Tabs, List, DatePicker, Calendar, Badge, Divider, Input
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined,
  UserOutlined, BookOutlined, TeamOutlined
} from '@ant-design/icons';
import axios from 'axios';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

interface ClassOccurrence {
  id: string;
  class_id: string;
  class_name: string;
  occurrence_date: string;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
  total_enrolled: number;
  present_count: number;
  absent_count: number;
  attendance_percentage: number;
}

interface AttendanceRecord {
  id: string;
  student_id: string;
  student_name: string;
  grade: string;
  attendance_status: 'present' | 'absent' | 'late';
  notes?: string;
}

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface Class {
  id: string;
  name: string;
  subject: string;
}

const statusColors = {
  present: 'green',
  absent: 'red',
  late: 'orange'
};

const statusLabels = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late'
};

const Attendance: React.FC = () => {
  const [occurrences, setOccurrences] = useState<ClassOccurrence[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [occurrenceModalVisible, setOccurrenceModalVisible] = useState(false);
  const [selectedOccurrence, setSelectedOccurrence] = useState<ClassOccurrence | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [form] = Form.useForm();

  const fetchOccurrences = async () => {
    try {
      setLoading(true);
      const params: any = {
        date_from: selectedDate.startOf('month').format('YYYY-MM-DD'),
        date_to: selectedDate.endOf('month').format('YYYY-MM-DD')
      };
      if (searchText) params.search = searchText;

      const response = await axios.get('/api/attendance/occurrences', { params });
      setOccurrences(response.data.occurrences || []);
    } catch (error: any) {
      console.error('Error fetching occurrences:', error);
      message.error(error.response?.data?.message || 'Failed to fetch occurrences');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const response = await axios.get('/api/students');
      const studentsData = response.data.data?.students || [];
      console.log('Fetched students:', studentsData);
      setStudents(studentsData);
    } catch (error: any) {
      console.error('Error fetching students:', error);
      message.error(error.response?.data?.message || 'Failed to fetch students');
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await axios.get('/api/classes');
      const classesData = response.data.data?.classes || [];
      console.log('Fetched classes:', classesData);
      setClasses(classesData);
    } catch (error: any) {
      console.error('Error fetching classes:', error);
      message.error(error.response?.data?.message || 'Failed to fetch classes');
    }
  };

  const fetchAttendanceForOccurrence = async (occurrenceId: string) => {
    try {
      const response = await axios.get(`/api/attendance/occurrences/${occurrenceId}`);
      setAttendanceRecords(response.data.attendance || []);
    } catch (error: any) {
      console.error('Error fetching attendance:', error);
      message.error(error.response?.data?.message || 'Failed to fetch attendance records');
    }
  };

  useEffect(() => {
    fetchOccurrences();
    fetchStudents();
    fetchClasses();
  }, [selectedDate, searchText]);

  const handleCreateOccurrence = async (values: any) => {
    try {
      await axios.post('/api/attendance/occurrences', values);
      message.success('Class occurrence created successfully');
      setModalVisible(false);
      form.resetFields();
      fetchOccurrences();
    } catch (error: any) {
      console.error('Error creating occurrence:', error);
      message.error(error.response?.data?.message || 'Failed to create occurrence');
    }
  };

  const handleUpdateAttendance = async (occurrenceId: string, studentId: string, status: string, notes?: string) => {
    try {
      await axios.put(`/api/attendance/occurrences/${occurrenceId}/attendance/${studentId}`, {
        attendance_status: status,
        notes
      });
      message.success('Attendance updated successfully');
      if (selectedOccurrence) {
        fetchAttendanceForOccurrence(selectedOccurrence.id);
      }
    } catch (error: any) {
      console.error('Error updating attendance:', error);
      message.error(error.response?.data?.message || 'Failed to update attendance');
    }
  };

  const handleBulkAttendance = async (occurrenceId: string, attendanceData: any[]) => {
    try {
      await axios.post(`/api/attendance/occurrences/${occurrenceId}/bulk-attendance`, {
        attendance: attendanceData
      });
      message.success('Bulk attendance updated successfully');
      if (selectedOccurrence) {
        fetchAttendanceForOccurrence(selectedOccurrence.id);
      }
    } catch (error: any) {
      console.error('Error updating bulk attendance:', error);
      message.error(error.response?.data?.message || 'Failed to update bulk attendance');
    }
  };

  const showOccurrenceModal = async (occurrence: ClassOccurrence) => {
    setSelectedOccurrence(occurrence);
    await fetchAttendanceForOccurrence(occurrence.id);
    setOccurrenceModalVisible(true);
  };

  const occurrenceColumns: ColumnsType<ClassOccurrence> = [
    {
      title: 'Class',
      dataIndex: 'class_name',
      key: 'class_name',
      sorter: (a, b) => a.class_name.localeCompare(b.class_name),
      render: (name: string, record: ClassOccurrence) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {dayjs(record.occurrence_date).format('MMM DD, YYYY')} • {record.start_time} - {record.end_time}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Enrollment',
      dataIndex: 'total_enrolled',
      key: 'total_enrolled',
      render: (total: number, record: ClassOccurrence) => (
        <Space direction="vertical" size={0}>
          <Text strong>{total} enrolled</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.present_count} present • {record.absent_count} absent
          </Text>
        </Space>
      ),
    },
    {
      title: 'Attendance Rate',
      dataIndex: 'attendance_percentage',
      key: 'attendance_percentage',
      render: (percentage: number, record: ClassOccurrence) => (
        <Space direction="vertical" size={0}>
          <Text strong>{Number(percentage).toFixed(1)}%</Text>
          <Progress
            percent={percentage}
            size="small"
            status={percentage >= 90 ? 'success' : percentage >= 70 ? 'normal' : 'exception'}
            style={{ width: 80 }}
          />
        </Space>
      ),
      sorter: (a, b) => a.attendance_percentage - b.attendance_percentage,
    },
    {
      title: 'Status',
      dataIndex: 'is_cancelled',
      key: 'is_cancelled',
      render: (cancelled: boolean) => (
        <Tag color={cancelled ? 'red' : 'green'}>
          {cancelled ? 'Cancelled' : 'Scheduled'}
        </Tag>
      ),
      filters: [
        { text: 'Scheduled', value: false },
        { text: 'Cancelled', value: true },
      ],
      onFilter: (value, record) => record.is_cancelled === value,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record: ClassOccurrence) => (
        <Space>
          <Button
            icon={<TeamOutlined />}
            onClick={() => showOccurrenceModal(record)}
            disabled={record.is_cancelled}
          >
            View Attendance
          </Button>
        </Space>
      ),
    },
  ];

  const attendanceColumns: ColumnsType<AttendanceRecord> = [
    {
      title: 'Student',
      dataIndex: 'student_name',
      key: 'student_name',
      sorter: (a, b) => a.student_name.localeCompare(b.student_name),
      render: (name: string, record: AttendanceRecord) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Grade: {record.grade}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'attendance_status',
      key: 'attendance_status',
      render: (status: string) => (
        <Tag color={statusColors[status as keyof typeof statusColors]}>
          {statusLabels[status as keyof typeof statusLabels]}
        </Tag>
      ),
      filters: Object.entries(statusLabels).map(([key, label]) => ({
        text: label,
        value: key,
      })),
      onFilter: (value, record) => record.attendance_status === value,
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      render: (notes: string) => notes || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record: AttendanceRecord) => (
        <Space>
          <Select
            value={record.attendance_status}
            style={{ width: 120 }}
            onChange={(value) => handleUpdateAttendance(
              selectedOccurrence!.id,
              record.student_id,
              value
            )}
          >
            {Object.entries(statusLabels).map(([key, label]) => (
              <Option key={key} value={key}>{label}</Option>
            ))}
          </Select>
        </Space>
      ),
    },
  ];

  const totalOccurrences = occurrences.length;
  const cancelledOccurrences = occurrences.filter(o => o.is_cancelled).length;
  const avgAttendanceRate = occurrences.length > 0
    ? occurrences.reduce((sum, o) => sum + o.attendance_percentage, 0) / occurrences.length
    : 0;

  const getListData = (value: Dayjs) => {
    const dateStr = value.format('YYYY-MM-DD');
    return occurrences.filter(occurrence =>
      occurrence.occurrence_date === dateStr
    );
  };

  const dateCellRender = (value: Dayjs) => {
    const listData = getListData(value);
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {listData.map((item, index) => (
          <li key={index}>
            <Badge
              status={item.is_cancelled ? 'error' : 'success'}
              text={
                <span style={{ fontSize: '11px' }}>
                  {item.class_name} ({item.attendance_percentage.toFixed(0)}%)
                </span>
              }
            />
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Title level={2}>Attendance Management</Title>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Total Occurrences"
              value={totalOccurrences}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Cancelled Classes"
              value={cancelledOccurrences}
              prefix={<DeleteOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Avg Attendance Rate"
              value={avgAttendanceRate}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#52c41a' }}
              formatter={(value) => `${Number(value).toFixed(1)}%`}
            />
          </Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="calendar" size="large" style={{ marginBottom: 24 }}>
        <TabPane tab="Calendar View" key="calendar">
          <Card>
            <Calendar
              value={selectedDate}
              onChange={(date) => setSelectedDate(date)}
              dateCellRender={dateCellRender}
              style={{ border: '1px solid #f0f0f0' }}
            />
          </Card>
        </TabPane>

        <TabPane tab="Occurrences List" key="occurrences">
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Search occurrences..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </Col>
            <Col xs={24} sm={12} md={8}>
              <DatePicker
                value={selectedDate}
                onChange={(date) => date && setSelectedDate(date)}
                style={{ width: '100%' }}
                allowClear={false}
              />
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  setModalVisible(true);
                }}
                style={{ width: '100%' }}
              >
                Add Occurrence
              </Button>
            </Col>
          </Row>

          <Table
            columns={occurrenceColumns}
            dataSource={occurrences}
            loading={loading}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} occurrences`,
            }}
            scroll={{ x: 1000 }}
          />
        </TabPane>
      </Tabs>

      <Modal
        title="Add Class Occurrence"
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateOccurrence}
        >
          <Form.Item
            name="class_id"
            label="Class"
            rules={[{ required: true, message: 'Please select a class' }]}
          >
            <Select
              placeholder={classes.length === 0 ? "Loading classes..." : "Select class"}
              disabled={classes.length === 0}
              showSearch
              optionFilterProp="children"
            >
              {classes.map(cls => (
                <Option key={cls.id} value={cls.id}>{cls.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="occurrence_date"
            label="Date"
            rules={[{ required: true, message: 'Please select date' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="start_time"
            label="Start Time"
            rules={[{ required: true, message: 'Please enter start time' }]}
          >
            <Input placeholder="09:00" />
          </Form.Item>

          <Form.Item
            name="end_time"
            label="End Time"
            rules={[{ required: true, message: 'Please enter end time' }]}
          >
            <Input placeholder="10:30" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Create Occurrence
              </Button>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  form.resetFields();
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Attendance - ${selectedOccurrence?.class_name}`}
        open={occurrenceModalVisible}
        onCancel={() => {
          setOccurrenceModalVisible(false);
          setSelectedOccurrence(null);
          setAttendanceRecords([]);
        }}
        footer={null}
        width={1000}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>
            {dayjs(selectedOccurrence?.occurrence_date).format('MMM DD, YYYY')} •
            {selectedOccurrence?.start_time} - {selectedOccurrence?.end_time}
          </Text>
          <Divider />
          <Text>
            Total Enrolled: {selectedOccurrence?.total_enrolled} |
            Present: {attendanceRecords.filter(r => r.attendance_status === 'present').length} |
            Absent: {attendanceRecords.filter(r => r.attendance_status === 'absent').length} |
            Late: {attendanceRecords.filter(r => r.attendance_status === 'late').length}
          </Text>
        </div>

        <Table
          columns={attendanceColumns}
          dataSource={attendanceRecords}
          rowKey="student_id"
          pagination={{
            pageSize: 15,
            showSizeChanger: true,
            showQuickJumper: true,
          }}
          scroll={{ x: 800 }}
        />
      </Modal>
    </div>
  );
};

export default Attendance;
