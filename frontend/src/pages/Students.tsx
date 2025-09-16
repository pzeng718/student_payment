import React, { useState, useEffect } from 'react';
import {
  Typography, Table, Button, Space, Modal, Form, Input, Select,
  Popconfirm, message, Tag, Card, Statistic, Row, Col
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
}

interface Class {
  id: string;
  name: string;
  subject: string;
  price_per_class?: number;
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
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [form] = Form.useForm();
  const [enrollmentForm] = Form.useForm();

  // Fetch students
  const fetchStudents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchText) params.append('search', searchText);
      if (gradeFilter) params.append('grade', gradeFilter);

      const response = await axios.get(`/api/students?${params.toString()}`);
      const studentsData = response.data.data?.students || [];
      console.log('Fetched students:', studentsData);
      setStudents(studentsData);
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
      fetchStudents();
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
      fetchStudents();
    } catch (error: any) {
      console.error('Error unenrolling student:', error);
      message.error(error.response?.data?.message || 'Failed to unenroll student');
    }
  };

  const showEnrollmentModal = (student: Student) => {
    setSelectedStudent(student);
    setEnrollmentModalVisible(true);
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
              {record.total_classes_remaining || 0} classes remaining
            </Text>
          </div>
          {record.total_classes_purchased && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {record.total_classes_purchased} purchased
              </Text>
            </div>
          )}
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
          <Text strong>0 enrolled</Text>
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
    </div>
  );
};

export default Students;
