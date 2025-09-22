import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Typography, Table, Button, Space, Modal, Form, Input, Select,
  Popconfirm, message, Tag, Card, Statistic, Row, Col, Progress,
  Tabs, List, InputNumber, Divider, DatePicker
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  DollarOutlined, CreditCardOutlined, MoneyCollectOutlined, PieChartOutlined
} from '@ant-design/icons';
import axios from 'axios';
import type { ColumnsType } from 'antd/es/table';
import moment from 'moment';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

interface Payment {
  id: string;
  student_id: string;
  student_name: string;
  payment_method: 'wechat' | 'cash' | 'zelle' | 'paypal';
  amount: number;
  classes_purchased: number;
  classes_remaining: number;
  payment_reference?: string;
  notes?: string;
  created_at: string;
  allocations?: Array<{
    class_id: string;
    class_name: string;
    allocated_classes: number;
  }>;
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
  price_per_class: number;
}

const paymentMethodColors = {
  wechat: 'green',
  cash: 'blue',
  zelle: 'purple',
  paypal: 'orange'
};

const paymentMethodLabels = {
  wechat: 'WeChat',
  cash: 'Cash',
  zelle: 'Zelle',
  paypal: 'PayPal'
};

const Payments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [allocationModalVisible, setAllocationModalVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedStudentClasses, setSelectedStudentClasses] = useState<Class[]>([]);
  const [searchText, setSearchText] = useState('');
  const [methodFilter, setMethodFilter] = useState<string | undefined>();
  const [form] = Form.useForm();
  const [allocationForm] = Form.useForm();

  // Search caching
  const searchCache = useRef<Map<string, { data: Payment[], timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  const generateCacheKey = useCallback((search: string, method: string | undefined) => {
    return `${search || ''}_${method || 'all'}`;
  }, []);

  const getCachedResult = useCallback((key: string) => {
    const cached = searchCache.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, []);

  const setCachedResult = useCallback((key: string, data: Payment[]) => {
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

  const fetchPayments = async () => {
    try {
      setLoading(true);

      const cacheKey = generateCacheKey(searchText, methodFilter);
      const cachedData = getCachedResult(cacheKey);

      if (cachedData) {
        console.log('Using cached payments data');
        setPayments(cachedData);
        setLoading(false);
        return;
      }

      const params: any = {};
      if (searchText) params.search = searchText;
      if (methodFilter) params.method = methodFilter;

      const response = await axios.get('/api/payments', { params });
      const paymentsData = response.data.data?.payments || [];
      console.log('Fetched payments from API:', paymentsData);

      setPayments(paymentsData);
      setCachedResult(cacheKey, paymentsData);
    } catch (error: any) {
      console.error('Error fetching payments:', error);
      message.error(error.response?.data?.message || 'Failed to fetch payments');
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

  const fetchStudentClasses = async (studentId: string) => {
    try {
      const response = await axios.get(`/api/students/${studentId}/classes`);
      const enrolledClasses = response.data.data || [];
      setSelectedStudentClasses(enrolledClasses);
    } catch (error: any) {
      console.error('Error fetching student classes:', error);
      setSelectedStudentClasses([]);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchStudents();
    fetchClasses();
  }, [searchText, methodFilter]);

  const handleSubmit = async (values: any) => {
    try {
      // Prepare class allocations from form data
      const classAllocations = [];
      if (values.class_allocations) {
        for (const allocation of values.class_allocations) {
          if (allocation.class_id && allocation.allocated_classes > 0) {
            classAllocations.push({
              class_id: allocation.class_id,
              allocated_classes: allocation.allocated_classes
            });
          }
        }
      }

      const paymentData = {
        ...values,
        class_allocations: classAllocations.length > 0 ? classAllocations : undefined
      };

      if (editingPayment) {
        await axios.put(`/api/payments/${editingPayment.id}`, paymentData);
        message.success('Payment updated successfully');
      } else {
        await axios.post('/api/payments', paymentData);
        message.success('Payment created successfully');
      }
      setModalVisible(false);
      setEditingPayment(null);
      setSelectedStudentClasses([]);
      form.resetFields();
      clearCache(); // Clear cache when data changes
      fetchPayments();
    } catch (error: any) {
      console.error('Error saving payment:', error);
      message.error(error.response?.data?.message || 'Failed to save payment');
    }
  };

  const handleStudentChange = (studentId: string) => {
    if (studentId) {
      fetchStudentClasses(studentId);
    } else {
      setSelectedStudentClasses([]);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/payments/${id}`);
      message.success('Payment deleted successfully');
      clearCache(); // Clear cache when data changes
      fetchPayments();
    } catch (error: any) {
      console.error('Error deleting payment:', error);
      message.error(error.response?.data?.message || 'Failed to delete payment');
    }
  };

  const handleAllocate = async (values: any) => {
    if (!selectedPayment) return;

    try {
      await axios.post(`/api/payments/${selectedPayment.id}/allocate`, values);
      message.success('Payment allocated successfully');
      setAllocationModalVisible(false);
      setSelectedPayment(null);
      allocationForm.resetFields();
      fetchPayments();
    } catch (error: any) {
      console.error('Error allocating payment:', error);
      message.error(error.response?.data?.message || 'Failed to allocate payment');
    }
  };

  const showAllocationModal = (payment: Payment) => {
    setSelectedPayment(payment);
    setAllocationModalVisible(true);
  };

  const columns: ColumnsType<Payment> = [
    {
      title: 'Student',
      dataIndex: 'student_name',
      key: 'student_name',
      sorter: (a, b) => a.student_name.localeCompare(b.student_name),
      render: (name: string, record: Payment) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `$${Number(amount).toFixed(2)}`,
      sorter: (a, b) => a.amount - b.amount,
    },
    {
      title: 'Classes',
      dataIndex: 'classes_purchased',
      key: 'classes_purchased',
      render: (purchased: number, record: Payment) => (
        <Space direction="vertical" size={0}>
          <Text strong>{purchased} purchased</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.classes_remaining} remaining
          </Text>
        </Space>
      ),
    },
    {
      title: 'Payment Method',
      dataIndex: 'payment_method',
      key: 'payment_method',
      render: (method: string) => (
        <Tag color={paymentMethodColors[method as keyof typeof paymentMethodColors]}>
          {paymentMethodLabels[method as keyof typeof paymentMethodLabels]}
        </Tag>
      ),
      filters: Object.entries(paymentMethodLabels).map(([key, label]) => ({
        text: label,
        value: key,
      })),
      onFilter: (value, record) => record.payment_method === value,
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => moment(date).format('MMM DD, YYYY'),
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record: Payment) => (
        <Space>
          <Button
            icon={<PieChartOutlined />}
            onClick={() => showAllocationModal(record)}
            disabled={record.classes_remaining === 0}
          >
            Allocate
          </Button>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setEditingPayment(record);
              form.setFieldsValue(record);
              setModalVisible(true);
            }}
          />
          <Popconfirm
            title="Are you sure you want to delete this payment?"
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

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalClassesPurchased = payments.reduce((sum, p) => sum + p.classes_purchased, 0);
  const totalClassesRemaining = payments.reduce((sum, p) => sum + p.classes_remaining, 0);
  const avgPaymentAmount = payments.length > 0 ? totalRevenue / payments.length : 0;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Title level={2}>Payments Management</Title>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Revenue"
              value={totalRevenue}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#3f8600' }}
              formatter={(value) => `$${Number(value).toFixed(2)}`}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Classes Purchased"
              value={totalClassesPurchased}
              prefix={<CreditCardOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Classes Remaining"
              value={totalClassesRemaining}
              prefix={<MoneyCollectOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Avg Payment"
              value={avgPaymentAmount}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#cf1322' }}
              formatter={(value) => `$${Number(value).toFixed(2)}`}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Input
            placeholder="Search payments..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Select
            placeholder="Filter by payment method"
            style={{ width: '100%' }}
            allowClear
            value={methodFilter}
            onChange={setMethodFilter}
          >
            {Object.entries(paymentMethodLabels).map(([key, label]) => (
              <Option key={key} value={key}>{label}</Option>
            ))}
          </Select>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingPayment(null);
              setSelectedStudentClasses([]);
              form.resetFields();
              setModalVisible(true);
            }}
            style={{ width: '100%' }}
          >
            Add Payment
          </Button>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={payments}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} payments`,
        }}
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingPayment ? 'Edit Payment' : 'Add New Payment'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingPayment(null);
          setSelectedStudentClasses([]);
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
            name="student_id"
            label="Student"
            rules={[{ required: true, message: 'Please select a student' }]}
          >
            <Select
              placeholder={students.length === 0 ? "Loading students..." : "Select student"}
              disabled={students.length === 0}
              showSearch
              optionFilterProp="children"
              onChange={handleStudentChange}
            >
              {students.map(student => (
                <Option key={student.id} value={student.id}>
                  {student.name} - {student.grade || 'No Grade'}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="payment_method"
            label="Payment Method"
            rules={[{ required: true, message: 'Please select payment method' }]}
          >
            <Select placeholder="Select payment method">
              {Object.entries(paymentMethodLabels).map(([key, label]) => (
                <Option key={key} value={key}>{label}</Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="amount"
                label="Amount"
                rules={[{ required: true, message: 'Please enter amount' }]}
              >
                <InputNumber
                  placeholder="0.00"
                  min={0}
                  step={0.01}
                  style={{ width: '100%' }}
                  formatter={(value) => `$${value}`}
                  parser={(value) => value ? value.replace('$', '') as any : ''}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="classes_purchased"
                label="Classes Purchased"
                rules={[{ required: true, message: 'Please enter number of classes' }]}
              >
                <InputNumber
                  placeholder="0"
                  min={1}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="payment_reference"
            label="Payment Reference"
          >
            <Input placeholder="Transaction ID or reference number" />
          </Form.Item>

          {/* Class Allocation Section */}
          {selectedStudentClasses.length > 0 && (
            <div style={{ marginBottom: 16, padding: 16, border: '1px solid #f0f0f0', borderRadius: 8 }}>
              <Text strong style={{ marginBottom: 16, display: 'block' }}>
                Allocate Classes (Optional)
              </Text>
              <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
                Specify how many classes from this payment should be allocated to each enrolled class.
                Total allocated classes cannot exceed {form.getFieldValue('classes_purchased') || 0}.
              </Text>

              <Form.List name="class_allocations">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field, index) => (
                      <div key={field.key} style={{ marginBottom: 16, padding: 12, border: '1px solid #d9d9d9', borderRadius: 4 }}>
                        <Row gutter={16} align="middle">
                          <Col span={12}>
                            <Form.Item
                              {...field}
                              name={[field.name, 'class_id']}
                              rules={[{ required: true, message: 'Please select class' }]}
                              style={{ marginBottom: 8 }}
                            >
                              <Select placeholder="Select class">
                                {selectedStudentClasses.map(cls => (
                                  <Option key={cls.id} value={cls.id}>
                                    {cls.name} - {cls.subject}
                                  </Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              {...field}
                              name={[field.name, 'allocated_classes']}
                              rules={[{ required: true, message: 'Enter number of classes' }]}
                              style={{ marginBottom: 8 }}
                            >
                              <InputNumber
                                placeholder="Classes"
                                min={1}
                                style={{ width: '100%' }}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={4}>
                            <Button
                              type="link"
                              danger
                              onClick={() => remove(field.name)}
                              style={{ padding: 0 }}
                            >
                              Remove
                            </Button>
                          </Col>
                        </Row>
                      </div>
                    ))}
                    <Form.Item>
                      <Button
                        type="dashed"
                        onClick={() => add()}
                        block
                        icon={<PlusOutlined />}
                        disabled={fields.length >= selectedStudentClasses.length}
                      >
                        Add Class Allocation
                      </Button>
                    </Form.Item>
                  </>
                )}
              </Form.List>
            </div>
          )}

          <Form.Item
            name="notes"
            label="Notes"
          >
            <TextArea placeholder="Additional notes about the payment" rows={3} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingPayment ? 'Update Payment' : 'Create Payment'}
              </Button>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  setEditingPayment(null);
                  setSelectedStudentClasses([]);
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
        title={`Allocate Classes - ${selectedPayment?.student_name}`}
        open={allocationModalVisible}
        onCancel={() => {
          setAllocationModalVisible(false);
          setSelectedPayment(null);
          allocationForm.resetFields();
        }}
        footer={null}
        width={800}
      >
        <Form
          form={allocationForm}
          layout="vertical"
          onFinish={handleAllocate}
        >
          <div style={{ marginBottom: 16 }}>
            <Text strong>Available classes to allocate: {selectedPayment?.classes_remaining}</Text>
          </div>

          <Form.List name="allocations">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => (
                  <div key={field.key} style={{ marginBottom: 16, padding: 16, border: '1px solid #f0f0f0', borderRadius: 8 }}>
                    <Row gutter={16} align="middle">
                      <Col span={10}>
                        <Form.Item
                          {...field}
                          name={[field.name, 'class_id']}
                          rules={[{ required: true, message: 'Please select class' }]}
                        >
                          <Select placeholder="Select class">
                            {classes.map(cls => (
                              <Option key={cls.id} value={cls.id}>
                                {cls.name} - ${Number(cls.price_per_class).toFixed(2)}/class
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          {...field}
                          name={[field.name, 'allocated_classes']}
                          rules={[
                            { required: true, message: 'Enter number of classes' },
                            ({ getFieldValue }) => ({
                              validator(_, value) {
                                if (!value || value <= 0) {
                                  return Promise.reject(new Error('Must be greater than 0'));
                                }
                                const totalAllocated = fields.reduce((sum, f, i) => {
                                  if (i === index) return sum;
                                  return sum + (getFieldValue(['allocations', f.name, 'allocated_classes']) || 0);
                                }, 0);
                                if (totalAllocated + value > (selectedPayment?.classes_remaining || 0)) {
                                  return Promise.reject(new Error('Total allocation exceeds available classes'));
                                }
                                return Promise.resolve();
                              },
                            }),
                          ]}
                        >
                          <InputNumber
                            placeholder="Classes"
                            min={1}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Button
                          type="link"
                          danger
                          onClick={() => remove(field.name)}
                          style={{ padding: 0 }}
                        >
                          Remove
                        </Button>
                      </Col>
                    </Row>
                  </div>
                ))}
                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                    disabled={fields.length >= (selectedPayment?.classes_remaining || 0)}
                  >
                    Add Class Allocation
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <Divider />

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Allocate Classes
              </Button>
              <Button
                onClick={() => {
                  setAllocationModalVisible(false);
                  setSelectedPayment(null);
                  allocationForm.resetFields();
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

export default Payments;
