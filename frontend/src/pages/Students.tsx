import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Typography, Table, Button, Space, Modal, Form, Input, Select,
  Popconfirm, message, Tag, Card, Statistic, Row, Col, List
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  UserOutlined, MailOutlined, PhoneOutlined, BookOutlined
} from '@ant-design/icons';
import axios from 'axios';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface Student {
  id: string;
  name: string;
  email?: string;
  grade?: string;
  phone?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  total_classes_purchased?: number;
  total_classes_remaining?: number;
  classes_attended?: number;
  classes_used?: number;
  attendance_percentage?: number;
  enrolled_classes_count?: number;
}

interface Class {
  id: string;
  name: string;
  subject: string;
  price_per_class?: number;
}

interface ClassBalance {
  class_id: string;
  class_name: string;
  subject: string;
  classes_purchased: number;
  classes_remaining: number;
  classes_used: number;
  classes_attended: number;
}

const Students: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [searchText, setSearchText] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string | undefined>();
  const [enrollmentModalVisible, setEnrollmentModalVisible] = useState(false);
  const [balanceModalVisible, setBalanceModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentBalances, setStudentBalances] = useState<ClassBalance[]>([]);
  const [form] = Form.useForm();
  const [enrollmentForm] = Form.useForm();

  // Search caching
  const searchCache = useRef<Map<string, { data: Student[], timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  const generateCacheKey = useCallback((search: string, grade: string | undefined) => {
    return `${search || ''}_${grade || 'all'}`;
  }, []);

  const getCachedResult = useCallback((key: string) => {
    const cached = searchCache.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, []);

  const setCachedResult = useCallback((key: string, data: Student[]) => {
    searchCache.current.set(key, {
      data: [...data],
      timestamp: Date.now()
    });

    // Limit cache size to prevent memory issues
    if (searchCache.current.size > 20) {
      const firstKey = searchCache.current.keys().next().value;
      searchCache.current.delete(firstKey);
    }
  }, []);

  const clearCache = useCallback(() => {
    searchCache.current.clear();
  }, []);

  // Fetch students with caching
  const fetchStudents = async () => {
    try {
      setLoading(true);

      const cacheKey = generateCacheKey(searchText, gradeFilter);
      const cachedData = getCachedResult(cacheKey);

      if (cachedData) {
        console.log('Using cached students data');
        setStudents(cachedData);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (searchText) params.append('search', searchText);
      if (gradeFilter) params.append('grade', gradeFilter);

      const response = await axios.get(`/api/students?${params.toString()}`);
      const studentsData = response.data.data?.students || [];
      console.log('Fetched students from API:', studentsData);

      setStudents(studentsData);
      setCachedResult(cacheKey, studentsData);
    } catch (error) {
      console.error('Error fetching students:', error);
      message.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  // Fetch available classes for enrollment
  const fetchClasses = async () => {
    try {
      const response = await axios.get('/api/classes');
      const classesData = response.data.data?.classes || [];
      console.log('Fetched classes:', classesData);
      setClasses(classesData);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, [searchText, gradeFilter]);

  // Handle form submission
  const handleSubmit = async (values: any) => {
    try {
      if (editingStudent) {
        await axios.put(`/api/students/${editingStudent.id}`, values);
        message.success('Student updated successfully');
      } else {
        await axios.post('/api/students', values);
        message.success('Student created successfully');
      }
      setModalVisible(false);
      setEditingStudent(null);
      form.resetFields();
      clearCache(); // Clear cache when data changes
      fetchStudents();
    } catch (error: any) {
      console.error('Error saving student:', error);
      message.error(error.response?.data?.message || 'Failed to save student');
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/students/${id}`);
      message.success('Student deleted successfully');
      clearCache(); // Clear cache when data changes
      fetchStudents();
    } catch (error: any) {
      console.error('Error deleting student:', error);
      message.error(error.response?.data?.message || 'Failed to delete student');
    }
  };

  // Handle enrollment
  const handleEnroll = async (studentId: string, classId: string) => {
    try {
      await axios.post(`/api/students/${studentId}/enroll/${classId}`);
      message.success('Student enrolled successfully');
      clearCache(); // Clear cache when enrollment changes
      // Refresh both students and classes data to ensure consistency
      fetchStudents();
      fetchClasses();
    } catch (error: any) {
      console.error('Error enrolling student:', error);
      message.error(error.response?.data?.message || 'Failed to enroll student');
    }
  };

  // Handle unenrollment
  const handleUnenroll = async (studentId: string, classId: string) => {
    try {
      await axios.delete(`/api/students/${studentId}/unenroll/${classId}`);
      message.success('Student unenrolled successfully');
      clearCache(); // Clear cache when enrollment changes
      // Refresh both students and classes data to ensure consistency
      fetchStudents();
      fetchClasses();
    } catch (error: any) {
      console.error('Error unenrolling student:', error);
      message.error(error.response?.data?.message || 'Failed to unenroll student');
    }
  };

  const showEnrollmentModal = (student: Student) => {
    setSelectedStudent(student);
    setEnrollmentModalVisible(true);
  };

  const showBalanceModal = async (student: Student) => {
    setSelectedStudent(student);
    await fetchStudentBalances(student.id);
    setBalanceModalVisible(true);
  };

  const fetchStudentBalances = async (studentId: string) => {
    try {
      const response = await axios.get(`/api/students/${studentId}/balances`);
      const balances = response.data.data?.balances || [];
      setStudentBalances(balances);
    } catch (error: any) {
      console.error('Error fetching student balances:', error);
      message.error('Failed to load student balances');
      setStudentBalances([]);
    }
  };

  const handleEnrollmentSubmit = async (values: any) => {
    if (!selectedStudent) return;

    try {
      await handleEnroll(selectedStudent.id, values.class_id);
      setEnrollmentModalVisible(false);
      setSelectedStudent(null);
      enrollmentForm.resetFields();
    } catch (error: any) {
      console.error('Error enrolling student:', error);
      message.error(error.response?.data?.message || 'Failed to enroll student');
    }
  };

  const columns: ColumnsType<Student> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, record: Student) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {record.grade && <Tag>{record.grade}</Tag>}
        </Space>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      render: (record: Student) => (
        <Space direction="vertical" size={0}>
          {record.email && (
            <div>
              <MailOutlined style={{ marginRight: 4 }} />
              {record.email}
            </div>
          )}
          {record.phone && (
            <div>
              <PhoneOutlined style={{ marginRight: 4 }} />
              {record.phone}
            </div>
          )}
        </Space>
      ),
    },
    {
      title: 'Balance',
      key: 'balance',
      render: (record: Student) => (
        <Space direction="vertical" size={0}>
          <div>
            <Text strong>
              {record.total_classes_remaining || 0} total classes remaining
            </Text>
          </div>
          <div>
            <Button
              type="link"
              size="small"
              onClick={() => showBalanceModal(record)}
              style={{ padding: 0, fontSize: '12px' }}
            >
              View per-class balances
            </Button>
          </div>
          {record.attendance_percentage !== undefined && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {Number(record.attendance_percentage).toFixed(1)}% attendance
              </Text>
            </div>
          )}
        </Space>
      ),
    },
    {
      title: 'Classes',
      key: 'classes',
      render: (record: Student) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.enrolled_classes_count || 0} enrolled</Text>
          <Button
            type="link"
            size="small"
            onClick={() => showEnrollmentModal(record)}
            style={{ padding: 0 }}
          >
            Enroll in Class
          </Button>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (record: Student) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setEditingStudent(record);
              form.setFieldsValue(record);
              setModalVisible(true);
            }}
          />
          <Popconfirm
            title="Are you sure you want to delete this student?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const grades = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
                  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
                  'Grade 11', 'Grade 12', 'College', 'Adult'];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2}>Students Management</Title>
        </Col>
      </Row>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Students"
              value={students.length}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Active Students"
              value={students.filter(s => (s.total_classes_remaining || 0) > 0).length}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Low Balance"
              value={students.filter(s => (s.total_classes_remaining || 0) <= 2).length}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Avg Attendance"
              value={
                students.length > 0
                  ? students.reduce((acc, s) => acc + (s.attendance_percentage || 0), 0) / students.length
                  : 0
              }
              prefix={<BookOutlined />}
              valueStyle={{ color: '#722ed1' }}
              formatter={(value) => `${Number(value).toFixed(1)}%`}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Input
            placeholder="Search students by name or email"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: '100%' }}
          />
        </Col>
        <Col>
          <Select
            placeholder="Filter by grade"
            value={gradeFilter}
            onChange={setGradeFilter}
            style={{ width: 150 }}
            allowClear
          >
            {grades.map(grade => (
              <Option key={grade} value={grade}>{grade}</Option>
            ))}
          </Select>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingStudent(null);
              form.resetFields();
              setModalVisible(true);
            }}
          >
            Add Student
          </Button>
        </Col>
      </Row>

      {/* Students Table */}
      <Table
        columns={columns}
        dataSource={students}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} students`,
        }}
        scroll={{ x: 800 }}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingStudent ? 'Edit Student' : 'Add New Student'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingStudent(null);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="Full Name"
            rules={[{ required: true, message: 'Please enter the student name' }]}
          >
            <Input placeholder="Enter full name" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { type: 'email', message: 'Please enter a valid email' }
                ]}
              >
                <Input placeholder="student@example.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="Phone"
              >
                <Input placeholder="+1 (555) 123-4567" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="grade"
                label="Grade"
              >
                <Select placeholder="Select grade">
                  {grades.map(grade => (
                    <Option key={grade} value={grade}>{grade}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="notes"
            label="Notes"
          >
            <TextArea
              placeholder="Additional notes about the student"
              rows={3}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingStudent ? 'Update' : 'Create'} Student
              </Button>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  setEditingStudent(null);
                  form.resetFields();
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Enrollment Modal */}
      <Modal
        title={`Enroll Student - ${selectedStudent?.name}`}
        open={enrollmentModalVisible}
        onCancel={() => {
          setEnrollmentModalVisible(false);
          setSelectedStudent(null);
          enrollmentForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={enrollmentForm}
          layout="vertical"
          onFinish={handleEnrollmentSubmit}
        >
          <Form.Item
            name="class_id"
            label="Select Class"
            rules={[{ required: true, message: 'Please select a class' }]}
          >
            <Select
              placeholder={classes.length === 0 ? "Loading classes..." : "Select a class to enroll in"}
              disabled={classes.length === 0}
              showSearch
              optionFilterProp="children"
            >
              {classes.map(cls => (
                <Option key={cls.id} value={cls.id}>
                  {cls.name} - {cls.subject}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Enroll Student
              </Button>
              <Button
                onClick={() => {
                  setEnrollmentModalVisible(false);
                  setSelectedStudent(null);
                  enrollmentForm.resetFields();
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Balance Modal */}
      <Modal
        title={`Class Balances - ${selectedStudent?.name}`}
        open={balanceModalVisible}
        onCancel={() => {
          setBalanceModalVisible(false);
          setSelectedStudent(null);
          setStudentBalances([]);
        }}
        footer={null}
        width={800}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            Detailed balance information for each class this student is enrolled in.
          </Text>
        </div>

        {studentBalances.length > 0 ? (
          <List
            dataSource={studentBalances}
            renderItem={(balance) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>{balance.class_name}</Text>
                      <Tag color="blue">{balance.subject}</Tag>
                    </Space>
                  }
                  description={
                    <Row gutter={16}>
                      <Col span={6}>
                        <Text type="secondary">Purchased: </Text>
                        <Text strong>{balance.classes_purchased}</Text>
                      </Col>
                      <Col span={6}>
                        <Text type="secondary">Remaining: </Text>
                        <Text strong style={{ color: balance.classes_remaining > 0 ? '#52c41a' : '#cf1322' }}>
                          {balance.classes_remaining}
                        </Text>
                      </Col>
                      <Col span={6}>
                        <Text type="secondary">Used: </Text>
                        <Text>{balance.classes_used}</Text>
                      </Col>
                      <Col span={6}>
                        <Text type="secondary">Attended: </Text>
                        <Text>{balance.classes_attended}</Text>
                      </Col>
                    </Row>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Text type="secondary">No balance information available for this student.</Text>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Students;
