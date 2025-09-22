import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Typography, Table, Button, Space, Modal, Form, Input, Select,
  Popconfirm, message, Tag, Card, Statistic, Row, Col, Progress,
  Tabs, List, InputNumber
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  BookOutlined, ClockCircleOutlined, TeamOutlined
} from '@ant-design/icons';
import axios from 'axios';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

interface Class {
  id: string;
  name: string;
  description?: string;
  subject?: string;
  duration_minutes?: number;
  max_students?: number;
  price_per_class?: number;
  created_at: string;
  updated_at: string;
  enrolled_students?: number;
  enrollment_percentage?: number;
}

interface Schedule {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface EnrolledStudent {
  id: string;
  name: string;
  grade: string;
  email: string;
  enrolled_at: string;
  is_active: boolean;
}

const Classes: React.FC = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [addScheduleModalVisible, setAddScheduleModalVisible] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedClassSchedules, setSelectedClassSchedules] = useState<Schedule[]>([]);
  const [selectedClassStudents, setSelectedClassStudents] = useState<EnrolledStudent[]>([]);
  const [searchText, setSearchText] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string | undefined>();
  const [form] = Form.useForm();
  const [scheduleForm] = Form.useForm();

  // Search caching
  const searchCache = useRef<Map<string, { data: Class[], timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  const generateCacheKey = useCallback((search: string, subject: string | undefined) => {
    return `${search || ''}_${subject || 'all'}`;
  }, []);

  const getCachedResult = useCallback((key: string) => {
    const cached = searchCache.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, []);

  const setCachedResult = useCallback((key: string, data: Class[]) => {
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

  const daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  const subjects = ['Mathematics', 'English', 'Science', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Art', 'Music', 'Computer Science', 'Other'];

  // Fetch classes with caching
  const fetchClasses = async () => {
    try {
      setLoading(true);

      const cacheKey = generateCacheKey(searchText, subjectFilter);
      const cachedData = getCachedResult(cacheKey);

      if (cachedData) {
        console.log('Using cached classes data');
        setClasses(cachedData);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (searchText) params.append('search', searchText);
      if (subjectFilter) params.append('subject', subjectFilter);

      const response = await axios.get(`/api/classes?${params.toString()}`);
      const classesData = response.data.data?.classes || [];
      console.log('Fetched classes from API:', classesData);

      setClasses(classesData);
      setCachedResult(cacheKey, classesData);
    } catch (error) {
      console.error('Error fetching classes:', error);
      message.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  // Fetch class details with schedules and students
  const fetchClassDetails = async (classId: string) => {
    try {
      const [schedulesResponse, studentsResponse] = await Promise.all([
        axios.get(`/api/classes/${classId}/schedules`),
        axios.get(`/api/classes/${classId}`)
      ]);

      setSelectedClassSchedules(schedulesResponse.data.data);
      setSelectedClassStudents(studentsResponse.data.data.enrolled_students || []);
    } catch (error) {
      console.error('Error fetching class details:', error);
      message.error('Failed to load class details');
    }
  };

  useEffect(() => {
    fetchClasses();
  }, [searchText, subjectFilter]);

  // Handle form submission
  const handleSubmit = async (values: any) => {
    try {
      if (editingClass) {
        await axios.put(`/api/classes/${editingClass.id}`, values);
        message.success('Class updated successfully');
      } else {
        await axios.post('/api/classes', values);
        message.success('Class created successfully');
      }
      setModalVisible(false);
      setEditingClass(null);
      form.resetFields();
      clearCache(); // Clear cache when data changes
      fetchClasses();
    } catch (error: any) {
      console.error('Error saving class:', error);
      message.error(error.response?.data?.message || 'Failed to save class');
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/classes/${id}`);
      message.success('Class deleted successfully');
      clearCache(); // Clear cache when data changes
      fetchClasses();
    } catch (error: any) {
      console.error('Error deleting class:', error);
      message.error(error.response?.data?.message || 'Failed to delete class');
    }
  };

  // Handle schedule submission
  const handleScheduleSubmit = async (values: any) => {
    try {
      if (selectedClass) {
        await axios.post(`/api/classes/${selectedClass.id}/schedules`, values);
        message.success('Schedule added successfully');
        setAddScheduleModalVisible(false);
        scheduleForm.resetFields();
        clearCache(); // Clear cache when schedule data changes
        fetchClassDetails(selectedClass.id);
      }
    } catch (error: any) {
      console.error('Error adding schedule:', error);
      message.error(error.response?.data?.message || 'Failed to add schedule');
    }
  };

  // Handle schedule delete
  const handleScheduleDelete = async (scheduleId: string) => {
    try {
      if (selectedClass) {
        await axios.delete(`/api/classes/${selectedClass.id}/schedules/${scheduleId}`);
        message.success('Schedule deleted successfully');
        clearCache(); // Clear cache when schedule data changes
        fetchClassDetails(selectedClass.id);
      }
    } catch (error: any) {
      console.error('Error deleting schedule:', error);
      message.error(error.response?.data?.message || 'Failed to delete schedule');
    }
  };

  const columns: ColumnsType<Class> = [
    {
      title: 'Class Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, record: Class) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {record.subject && (
            <Tag color="blue">{record.subject}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Details',
      key: 'details',
      render: (record: Class) => (
        <Space direction="vertical" size={0}>
          {record.description && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {record.description.length > 50
                  ? `${record.description.substring(0, 50)}...`
                  : record.description
                }
              </Text>
            </div>
          )}
          {record.duration_minutes && (
            <div>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {record.duration_minutes} minutes
              </Text>
            </div>
          )}
        </Space>
      ),
    },
    {
      title: 'Enrollment',
      key: 'enrollment',
      render: (record: Class) => (
        <Space direction="vertical" size={0}>
          <div>
            <Text strong>
              {record.enrolled_students || 0} students
            </Text>
          </div>
          {record.max_students && (
            <div style={{ width: '100px' }}>
              <Progress
                percent={Math.round(((record.enrolled_students || 0) / record.max_students) * 100)}
                size="small"
                status={(record.enrolled_students || 0) >= record.max_students ? 'exception' : 'normal'}
              />
            </div>
          )}
          {record.max_students && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Max: {record.max_students}
              </Text>
            </div>
          )}
        </Space>
      ),
    },
    {
      title: 'Pricing',
      key: 'pricing',
      render: (record: Class) => (
        <Space direction="vertical" size={0}>
          {record.price_per_class && (
            <div>
              <Text strong>${Number(record.price_per_class).toFixed(2)}</Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                /class
              </Text>
            </div>
          )}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (record: Class) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setEditingClass(record);
              form.setFieldsValue(record);
              setModalVisible(true);
            }}
          />
          <Button
            icon={<ClockCircleOutlined />}
            onClick={() => {
              setSelectedClass(record);
              fetchClassDetails(record.id);
              setScheduleModalVisible(true);
            }}
          >
            Schedules
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this class?"
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

  const scheduleColumns: ColumnsType<Schedule> = [
    {
      title: 'Day',
      dataIndex: 'day_of_week',
      key: 'day_of_week',
      render: (day: number) => daysOfWeek.find(d => d.value === day)?.label,
    },
    {
      title: 'Time',
      key: 'time',
      render: (record: Schedule) => (
        <span>{record.start_time} - {record.end_time}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>
          {isActive ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (record: Schedule) => (
        <Popconfirm
          title="Are you sure you want to delete this schedule?"
          onConfirm={() => handleScheduleDelete(record.id)}
          okText="Yes"
          cancelText="No"
        >
          <Button icon={<DeleteOutlined />} size="small" danger />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2}>Classes Management</Title>
        </Col>
      </Row>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Classes"
              value={classes.length}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Enrollment"
              value={classes.reduce((acc, c) => {
                const enrolled = c.enrolled_students;
                return acc + (typeof enrolled === 'number' ? enrolled : 0);
              }, 0)}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Avg Enrollment Rate"
              value={
                classes.length > 0
                  ? classes.reduce((acc, c) => {
                      if (c.max_students) {
                        return acc + (((c.enrolled_students || 0) / c.max_students) * 100);
                      }
                      return acc;
                    }, 0) / classes.filter(c => c.max_students).length
                  : 0
              }
              prefix={<BookOutlined />}
              valueStyle={{ color: '#722ed1' }}
              formatter={(value) => `${Number(value).toFixed(1)}%`}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Full Classes"
              value={classes.filter(c => (c.enrolled_students || 0) >= (c.max_students || 0)).length}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Input
            placeholder="Search classes by name or description"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: '100%' }}
          />
        </Col>
        <Col>
          <Select
            placeholder="Filter by subject"
            value={subjectFilter}
            onChange={setSubjectFilter}
            style={{ width: 150 }}
            allowClear
          >
            {subjects.map(subject => (
              <Option key={subject} value={subject}>{subject}</Option>
            ))}
          </Select>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingClass(null);
              form.resetFields();
              setModalVisible(true);
            }}
          >
            Add Class
          </Button>
        </Col>
      </Row>

      {/* Classes Table */}
      <Table
        columns={columns}
        dataSource={classes}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} classes`,
        }}
        scroll={{ x: 1000 }}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingClass ? 'Edit Class' : 'Add New Class'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingClass(null);
          form.resetFields();
        }}
        footer={null}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="Class Name"
            rules={[{ required: true, message: 'Please enter the class name' }]}
          >
            <Input placeholder="Enter class name" />
          </Form.Item>


          <Form.Item
            name="description"
            label="Description"
          >
            <TextArea
              placeholder="Enter class description"
              rows={3}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="duration_minutes"
                label="Duration (minutes)"
              >
                <InputNumber
                  placeholder="60"
                  min={15}
                  max={480}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="max_students"
                label="Max Students"
              >
                <InputNumber
                  placeholder="20"
                  min={1}
                  max={100}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="price_per_class"
                label="Price per Class"
              >
                <InputNumber
                  placeholder="25.00"
                  min={0}
                  step={0.01}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingClass ? 'Update' : 'Create'} Class
              </Button>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  setEditingClass(null);
                  form.resetFields();
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Schedule Management Modal */}
      <Modal
        title={`Manage Schedules - ${selectedClass?.name}`}
        open={scheduleModalVisible}
        onCancel={() => {
          setScheduleModalVisible(false);
          setSelectedClass(null);
          setSelectedClassSchedules([]);
          setSelectedClassStudents([]);
        }}
        footer={null}
        width={800}
      >
        <Tabs defaultActiveKey="schedules" size="large">
          <TabPane tab="Schedules" key="schedules">
            <div style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  scheduleForm.resetFields();
                  setAddScheduleModalVisible(true);
                }}
              >
                Add Schedule
              </Button>
            </div>

            <Form
              form={scheduleForm}
              layout="vertical"
              onFinish={handleScheduleSubmit}
              style={{ marginBottom: 16 }}
            >
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name="day_of_week"
                    label="Day of Week"
                    rules={[{ required: true, message: 'Please select day' }]}
                  >
                    <Select placeholder="Select day">
                      {daysOfWeek.map(day => (
                        <Option key={day.value} value={day.value}>{day.label}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="start_time"
                    label="Start Time"
                    rules={[{ required: true, message: 'Please select start time' }]}
                  >
                    <Input placeholder="09:00" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="end_time"
                    label="End Time"
                    rules={[{ required: true, message: 'Please select end time' }]}
                  >
                    <Input placeholder="10:30" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    Add Schedule
                  </Button>
                  <Button onClick={() => scheduleForm.resetFields()}>
                    Reset
                  </Button>
                </Space>
              </Form.Item>
            </Form>

            {selectedClassSchedules.length > 0 ? (
              <Table
                columns={scheduleColumns}
                dataSource={selectedClassSchedules}
                pagination={false}
                size="small"
                rowKey="id"
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Text type="secondary">No schedules found. Add a schedule to get started.</Text>
              </div>
            )}
          </TabPane>

          <TabPane tab="Enrolled Students" key="students">
            {selectedClassStudents.length > 0 ? (
              <List
                dataSource={selectedClassStudents}
                renderItem={(student) => (
                  <List.Item>
                    <List.Item.Meta
                      title={student.name}
                      description={
                        <Space direction="vertical" size={0}>
                          <Text type="secondary">Grade: {student.grade}</Text>
                          <Text type="secondary">Email: {student.email}</Text>
                          <Text type="secondary">
                            Enrolled: {new Date(student.enrolled_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </Text>
                        </Space>
                      }
                    />
                    <Tag color={student.is_active ? 'green' : 'red'}>
                      {student.is_active ? 'Active' : 'Inactive'}
                    </Tag>
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Text type="secondary">No students enrolled in this class yet.</Text>
              </div>
            )}
          </TabPane>
        </Tabs>
      </Modal>

      {/* Add Schedule Modal */}
      <Modal
        title="Add Schedule"
        open={addScheduleModalVisible}
        onCancel={() => {
          setAddScheduleModalVisible(false);
          scheduleForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={scheduleForm}
          layout="vertical"
          onFinish={handleScheduleSubmit}
        >
          <Form.Item
            name="day_of_week"
            label="Day of Week"
            rules={[{ required: true, message: 'Please select day' }]}
          >
            <Select placeholder="Select day">
              {daysOfWeek.map(day => (
                <Option key={day.value} value={day.value}>{day.label}</Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="start_time"
                label="Start Time"
                rules={[{ required: true, message: 'Please enter start time' }]}
              >
                <Input placeholder="09:00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="end_time"
                label="End Time"
                rules={[{ required: true, message: 'Please enter end time' }]}
              >
                <Input placeholder="10:30" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Add Schedule
              </Button>
              <Button
                onClick={() => {
                  setAddScheduleModalVisible(false);
                  scheduleForm.resetFields();
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

export default Classes;
