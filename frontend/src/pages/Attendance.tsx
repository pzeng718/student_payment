import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Typography, Table, Button, Space, Modal, Form, Select,
  Popconfirm, message, Tag, Card, Statistic, Row, Col, Progress,
  Tabs, List, DatePicker, Calendar, Badge, Divider, Input, TimePicker,
  Transfer, Checkbox, Tooltip
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  CalendarOutlined,
  UserOutlined, BookOutlined, TeamOutlined, ExclamationCircleOutlined,
  DollarOutlined
} from '@ant-design/icons';
import axios from 'axios';
import type { ColumnsType } from 'antd/es/table';
import type { TransferDirection } from 'antd/es/transfer';
import type { Key } from 'react';
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
  is_auto_created?: boolean;
  notes?: string;
}

interface AttendanceRecord {
  student_id: string;
  student_name: string;
  grade: string;
  enrollment_id: string;
  attendance_status: 'present' | 'absent' | 'late' | 'excused' | 'not_recorded';
  notes?: string;
  attendance_notes?: string;
  is_excluded?: boolean;
  exclusion_reason?: string;
}

interface ScheduledClass {
  id: string;
  schedule_id: string;
  class_id: string;
  class_name: string;
  subject: string;
  date: string;
  start_time: string;
  end_time: string;
  price_per_class: number;
  max_students: number;
  description: string;
  has_occurrence: boolean;
  is_scheduled: boolean;
}

interface StudentExclusion {
  student_id: string;
  reason?: string;
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
  late: 'orange',
  excused: 'blue',
  not_recorded: 'default'
};

const statusLabels = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
  not_recorded: 'Not Recorded'
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
  const [exclusionForm] = Form.useForm();
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [enrolledStudents, setEnrolledStudents] = useState<Student[]>([]);
  const [excludedStudents, setExcludedStudents] = useState<Key[]>([]);
  const [exclusionModalVisible, setExclusionModalVisible] = useState(false);
  const [editOccurrenceModalVisible, setEditOccurrenceModalVisible] = useState(false);
  const [editingOccurrence, setEditingOccurrence] = useState<ClassOccurrence | null>(null);
  const [editForm] = Form.useForm();
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledClass[]>([]);
  const [selectedView, setSelectedView] = useState<'month' | 'day'>('month');

  // Search caching
  const searchCache = useRef<Map<string, { data: ClassOccurrence[], timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  const generateCacheKey = useCallback((search: string, status: string | undefined) => {
    return `${search || ''}_${status || 'all'}`;
  }, []);

  const getCachedResult = useCallback((key: string): ClassOccurrence[] | null => {
    const cached = searchCache.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, []);

  const setCachedResult = useCallback((key: string, data: ClassOccurrence[]) => {
    searchCache.current.set(key, {
      data: [...data],
      timestamp: Date.now()
    });

    // Limit cache size to prevent memory issues
    if (searchCache.current.size > 20) {
      const firstKey = searchCache.current.keys().next().value;
      if (firstKey) {
        searchCache.current.delete(firstKey);
      }
    }
  }, []);

  const clearCache = useCallback(() => {
    searchCache.current.clear();
  }, []);

  // Fetch scheduled classes for calendar view
  const fetchScheduledClasses = async () => {
    try {
      const startDate = selectedDate.startOf('month').format('YYYY-MM-DD');
      const endDate = selectedDate.endOf('month').format('YYYY-MM-DD');

      const response = await axios.get('/api/attendance/scheduled-classes', {
        params: { start_date: startDate, end_date: endDate }
      });

      setScheduledClasses(response.data.data?.scheduled_classes || []);
    } catch (error: any) {
      console.error('Error fetching scheduled classes:', error);
    }
  };

  const fetchOccurrences = async () => {
    try {
      setLoading(true);

      const cacheKey = generateCacheKey(searchText, statusFilter);
      const cachedData = getCachedResult(cacheKey);

      if (cachedData) {
        console.log('Using cached occurrences data');
        setOccurrences(cachedData);
        setLoading(false);
        return;
      }

      const params: any = {
        date_from: selectedDate.startOf('month').format('YYYY-MM-DD'),
        date_to: selectedDate.endOf('month').format('YYYY-MM-DD')
      };
      if (searchText) params.search = searchText;

      const response = await axios.get('/api/attendance/occurrences', { params });
      const occurrencesData = response.data.data?.occurrences || [];
      console.log('Fetched occurrences from API:', occurrencesData);

      setOccurrences(occurrencesData);
      setCachedResult(cacheKey, occurrencesData);
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

  const fetchEnrolledStudents = async (classId: string) => {
    try {
      const response = await axios.get(`/api/classes/${classId}/enrollments`);
      const enrolledData = response.data.data?.enrollments || [];
      const studentsData = enrolledData.map((enrollment: any) => ({
        id: enrollment.student_id,
        name: enrollment.student_name,
        grade: enrollment.grade
      }));
      setEnrolledStudents(studentsData);
    } catch (error: any) {
      console.error('Error fetching enrolled students:', error);
      message.error('Failed to fetch enrolled students');
    }
  };

  const fetchAttendanceForOccurrence = async (occurrenceId: string) => {
    try {
      const response = await axios.get(`/api/attendance/occurrences/${occurrenceId}`);
      setAttendanceRecords(response.data.data?.attendance || []);
    } catch (error: any) {
      console.error('Error fetching attendance:', error);
      message.error(error.response?.data?.message || 'Failed to fetch attendance records');
    }
  };

  useEffect(() => {
    fetchOccurrences();
    fetchScheduledClasses();
    fetchStudents();
    fetchClasses();
  }, [selectedDate, searchText]);

  const handleCreateOccurrence = async (values: any) => {
    try {
      const payload = {
        ...values,
        occurrence_date: values.occurrence_date.format('YYYY-MM-DD'),
        start_time: values.start_time?.format('HH:mm') || null,
        end_time: values.end_time?.format('HH:mm') || null,
        excluded_students: excludedStudents.map(studentId => ({
          student_id: studentId as string,
          reason: values[`exclusion_reason_${studentId}`] || null
        }))
      };

      await axios.post('/api/attendance/occurrences', payload);
      message.success('Class occurrence created successfully with automatic attendance and payment deduction');
      setModalVisible(false);
      setExclusionModalVisible(false);
      form.resetFields();
      exclusionForm.resetFields();
      setExcludedStudents([]);
      setEnrolledStudents([]);
      setSelectedClassId('');
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

  const handleClassChange = async (classId: string) => {
    setSelectedClassId(classId);
    if (classId) {
      await fetchEnrolledStudents(classId);
      setExcludedStudents([]);
    } else {
      setEnrolledStudents([]);
    }
  };

  const handleExclusionChange = (targetKeys: Key[], direction: TransferDirection, moveKeys: Key[]) => {
    setExcludedStudents(targetKeys);
  };

  const handleUpdateAttendanceWithPayment = async (occurrenceId: string, studentId: string, status: string, updatePayment: boolean, notes?: string) => {
    try {
      await axios.put(`/api/attendance/occurrences/${occurrenceId}/attendance-with-payment`, {
        student_id: studentId,
        attendance_status: status,
        update_payment_balance: updatePayment,
        notes
      });
      message.success('Attendance updated successfully');
      if (selectedOccurrence) {
        await fetchAttendanceForOccurrence(selectedOccurrence.id);
      }
    } catch (error: any) {
      console.error('Error updating attendance:', error);
      message.error(error.response?.data?.message || 'Failed to update attendance');
    }
  };

  const handleAddExclusion = async (values: any) => {
    try {
      if (!selectedOccurrence) return;

      await axios.post(`/api/attendance/occurrences/${selectedOccurrence.id}/exclusions`, {
        student_id: values.student_id,
        reason: values.reason
      });
      message.success('Student excluded from occurrence');
      exclusionForm.resetFields();
      await fetchAttendanceForOccurrence(selectedOccurrence.id);
    } catch (error: any) {
      console.error('Error adding exclusion:', error);
      message.error(error.response?.data?.message || 'Failed to add exclusion');
    }
  };

  const handleRemoveExclusion = async (studentId: string) => {
    try {
      if (!selectedOccurrence) return;

      await axios.delete(`/api/attendance/occurrences/${selectedOccurrence.id}/exclusions/${studentId}`);
      message.success('Student exclusion removed');
      await fetchAttendanceForOccurrence(selectedOccurrence.id);
    } catch (error: any) {
      console.error('Error removing exclusion:', error);
      message.error(error.response?.data?.message || 'Failed to remove exclusion');
    }
  };

  const handleEditOccurrence = async (values: any) => {
    try {
      if (!editingOccurrence) return;

      const payload = {
        start_time: values.start_time?.format('HH:mm') || null,
        end_time: values.end_time?.format('HH:mm') || null,
        notes: values.notes,
        was_cancelled: values.was_cancelled || false
      };

      await axios.put(`/api/attendance/occurrences/${editingOccurrence.id}`, payload);
      message.success('Occurrence updated successfully');
      setEditOccurrenceModalVisible(false);
      setEditingOccurrence(null);
      editForm.resetFields();
      fetchOccurrences();
    } catch (error: any) {
      console.error('Error updating occurrence:', error);
      message.error(error.response?.data?.message || 'Failed to update occurrence');
    }
  };

  const showEditOccurrenceModal = (occurrence: ClassOccurrence) => {
    setEditingOccurrence(occurrence);
    editForm.setFieldsValue({
      start_time: occurrence.start_time ? dayjs(occurrence.start_time, 'HH:mm') : null,
      end_time: occurrence.end_time ? dayjs(occurrence.end_time, 'HH:mm') : null,
      notes: occurrence.notes || '',
      was_cancelled: occurrence.is_cancelled
    });
    setEditOccurrenceModalVisible(true);
  };

  const handleAutoCreateOccurrences = async () => {
    try {
      const response = await axios.post('/api/attendance/auto-create-occurrences');
      const { created, occurrences, errors } = response.data.data;

      if (created > 0) {
        message.success(`Successfully created ${created} class occurrences`);
        fetchOccurrences(); // Refresh the list
      } else {
        message.info('No new occurrences were created (may already exist for today)');
      }

      if (errors && errors.length > 0) {
        console.error('Auto-creation errors:', errors);
        message.warning(`${errors.length} occurrences failed to create. Check console for details.`);
      }
    } catch (error: any) {
      console.error('Error auto-creating occurrences:', error);
      message.error(error.response?.data?.message || 'Failed to auto-create occurrences');
    }
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
      render: (cancelled: boolean, record: ClassOccurrence) => (
        <Space direction="vertical" size={0}>
          <Tag color={cancelled ? 'red' : 'green'}>
            {cancelled ? 'Cancelled' : 'Scheduled'}
          </Tag>
          {record.is_auto_created && (
            <Tag color="blue">Auto-created</Tag>
          )}
        </Space>
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
          <Button
            icon={<EditOutlined />}
            onClick={() => showEditOccurrenceModal(record)}
          >
            Edit
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
          {record.is_excluded && (
            <Tag color="orange">
              <ExclamationCircleOutlined /> Excluded
              {record.exclusion_reason && `: ${record.exclusion_reason}`}
            </Tag>
          )}
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
        <Space direction="vertical" size={0}>
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
          <Tooltip title="Update with payment balance changes">
            <Checkbox
              onChange={(e) => handleUpdateAttendanceWithPayment(
                selectedOccurrence!.id,
                record.student_id,
                record.attendance_status,
                e.target.checked
              )}
            >
              Update Balance
            </Checkbox>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const totalOccurrences = occurrences.length;
  const cancelledOccurrences = occurrences.filter(o => o.is_cancelled).length;
  const avgAttendanceRate = occurrences.length > 0
    ? occurrences.reduce((sum, o) => {
        const percentage = o.attendance_percentage;
        return sum + (typeof percentage === 'number' && !isNaN(percentage) ? percentage : 0);
      }, 0) / occurrences.length
    : 0;

  const getListData = (value: Dayjs) => {
    const dateStr = value.format('YYYY-MM-DD');
    return occurrences.filter(occurrence =>
      occurrence.occurrence_date === dateStr
    );
  };

  const dateCellRender = (value: Dayjs) => {
    const listData = getListData(value);
    const dateStr = value.format('YYYY-MM-DD');
    const dayScheduledClasses = scheduledClasses.filter(sc => sc.date === dateStr);

    return (
      <div style={{ padding: '4px' }}>
        {/* Actual occurrences */}
        {listData.length > 0 && (
          <div style={{ marginBottom: '4px' }}>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px', fontWeight: 'bold' }}>
              📅 Classes
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {listData.map((item, index) => (
                <li key={`occurrence-${index}`} style={{ marginBottom: '2px' }}>
                  <Badge
                    status={item.is_cancelled ? 'error' : 'success'}
                    text={
                      <span style={{ fontSize: '10px', fontWeight: '500' }}>
                        {item.class_name}
                        {item.is_auto_created && (
                          <span style={{ marginLeft: '4px', color: '#1890ff' }}>🤖</span>
                        )}
                      </span>
                    }
                  />
                  <div style={{ fontSize: '9px', color: '#999', marginLeft: '14px' }}>
                    {item.start_time} - {item.attendance_percentage.toFixed(0)}% attendance
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Scheduled classes */}
        {dayScheduledClasses.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px', fontWeight: 'bold' }}>
              📋 Scheduled
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {dayScheduledClasses.map((item, index) => (
                <li key={`scheduled-${index}`} style={{ marginBottom: '2px' }}>
                  <Badge
                    status={item.has_occurrence ? 'default' : 'processing'}
                    text={
                      <span style={{ fontSize: '10px', fontWeight: '500' }}>
                        {item.class_name}
                        {item.has_occurrence && (
                          <span style={{ marginLeft: '4px', color: '#52c41a' }}>✅</span>
                        )}
                      </span>
                    }
                  />
                  <div style={{ fontSize: '9px', color: '#999', marginLeft: '14px' }}>
                    {item.start_time} - {item.end_time}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Empty state */}
        {listData.length === 0 && dayScheduledClasses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <span style={{ fontSize: '10px', color: '#ccc' }}>No classes</span>
          </div>
        )}
      </div>
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
        <TabPane tab="Day View" key="day">
          <Card>
            <div style={{ padding: '20px' }}>
              <Title level={4} style={{ textAlign: 'center', marginBottom: '20px' }}>
                📅 {selectedDate.format('dddd, MMMM DD, YYYY')}
              </Title>

              {(() => {
                const dateStr = selectedDate.format('YYYY-MM-DD');
                const dayOccurrences = occurrences.filter(occ => occ.occurrence_date === dateStr);
                const dayScheduledClasses = scheduledClasses.filter(sc => sc.date === dateStr);

                if (dayOccurrences.length === 0 && dayScheduledClasses.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <Text type="secondary">No classes scheduled for this day</Text>
                    </div>
                  );
                }

                return (
                  <Row gutter={[16, 16]}>
                    {/* Actual occurrences */}
                    {dayOccurrences.length > 0 && (
                      <Col span={24}>
                        <Title level={5} style={{ color: '#1890ff' }}>📅 Today's Classes</Title>
                        <List
                          dataSource={dayOccurrences}
                          renderItem={(occurrence) => (
                            <List.Item style={{ padding: '12px', border: '1px solid #f0f0f0', borderRadius: '6px', marginBottom: '8px' }}>
                              <List.Item.Meta
                                avatar={
                                  <div style={{
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '50%',
                                    backgroundColor: occurrence.is_cancelled ? '#ff4d4f' : '#52c41a',
                                    marginTop: '4px'
                                  }} />
                                }
                                title={
                                  <Space>
                                    <Text strong>{occurrence.class_name}</Text>
                                    {occurrence.is_auto_created && (
                                      <Tag color="blue">Auto</Tag>
                                    )}
                                  </Space>
                                }
                                description={
                                  <div>
                                    <Text type="secondary">
                                      {occurrence.start_time} - {occurrence.end_time}
                                    </Text>
                                    <div style={{ marginTop: '4px' }}>
                                      <Progress
                                        percent={occurrence.attendance_percentage}
                                        size="small"
                                        status={occurrence.is_cancelled ? 'exception' : 'success'}
                                        format={(percent) => `${percent?.toFixed(0)}% attendance`}
                                      />
                                    </div>
                                  </div>
                                }
                              />
                              <Space>
                                <Button
                                  size="small"
                                  onClick={() => showOccurrenceModal(occurrence)}
                                >
                                  View Details
                                </Button>
                                <Button
                                  size="small"
                                  icon={<EditOutlined />}
                                  onClick={() => showEditOccurrenceModal(occurrence)}
                                >
                                  Edit
                                </Button>
                              </Space>
                            </List.Item>
                          )}
                        />
                      </Col>
                    )}

                    {/* Scheduled classes */}
                    {dayScheduledClasses.length > 0 && (
                      <Col span={24}>
                        <Title level={5} style={{ color: '#fa8c16' }}>📋 Scheduled Classes</Title>
                        <List
                          dataSource={dayScheduledClasses}
                          renderItem={(scheduledClass) => (
                            <List.Item style={{
                              padding: '12px',
                              border: '1px solid #fff7e6',
                              borderRadius: '6px',
                              marginBottom: '8px',
                              backgroundColor: '#fff7e6'
                            }}>
                              <List.Item.Meta
                                avatar={
                                  <div style={{
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '50%',
                                    backgroundColor: scheduledClass.has_occurrence ? '#52c41a' : '#fa8c16',
                                    marginTop: '4px'
                                  }} />
                                }
                                title={
                                  <Space>
                                    <Text strong>{scheduledClass.class_name}</Text>
                                    {scheduledClass.has_occurrence && (
                                      <Tag color="green">Created</Tag>
                                    )}
                                  </Space>
                                }
                                description={
                                  <div>
                                    <Text type="secondary">
                                      {scheduledClass.subject} • {scheduledClass.start_time} - {scheduledClass.end_time}
                                    </Text>
                                    <div style={{ marginTop: '4px' }}>
                                      <Text type="secondary" style={{ fontSize: '12px' }}>
                                        {scheduledClass.description}
                                      </Text>
                                    </div>
                                  </div>
                                }
                              />
                              <div style={{ textAlign: 'right' }}>
                                <Text strong style={{ color: '#fa8c16' }}>
                                  ${scheduledClass.price_per_class}
                                </Text>
                              </div>
                            </List.Item>
                          )}
                        />
                      </Col>
                    )}
                  </Row>
                );
              })()}
            </div>
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
            <Col xs={24} sm={12} md={6}>
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
            <Col xs={24} sm={12} md={6}>
              <Button
                type="default"
                icon={<CalendarOutlined />}
                onClick={handleAutoCreateOccurrences}
                style={{ width: '100%' }}
              >
                Auto-Create Today
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
          setExcludedStudents([]);
          setEnrolledStudents([]);
          setSelectedClassId('');
        }}
        footer={null}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateOccurrence}
        >
          <Row gutter={16}>
            <Col span={12}>
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
                  onChange={handleClassChange}
                >
                  {classes.map(cls => (
                    <Option key={cls.id} value={cls.id}>{cls.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="occurrence_date"
                label="Date"
                rules={[{ required: true, message: 'Please select date' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="start_time"
                label="Start Time"
                rules={[{ required: true, message: 'Please select start time' }]}
              >
                <TimePicker
                  format="HH:mm"
                  style={{ width: '100%' }}
                  placeholder="Select start time"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="end_time"
                label="End Time"
                rules={[{ required: true, message: 'Please select end time' }]}
              >
                <TimePicker
                  format="HH:mm"
                  style={{ width: '100%' }}
                  placeholder="Select end time"
                />
              </Form.Item>
            </Col>
          </Row>

          {selectedClassId && enrolledStudents.length > 0 && (
            <Form.Item label="Exclude Students (Optional)">
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary">
                  Select students to exclude from this occurrence. Excluded students won't be marked as present and won't have their payment balance deducted.
                </Text>
              </div>
              <Transfer
                dataSource={enrolledStudents.map(student => ({
                  key: student.id,
                  title: `${student.name} (${student.grade})`,
                  description: student.grade
                }))}
                targetKeys={excludedStudents}
                onChange={handleExclusionChange}
                render={item => item.title}
                listStyle={{ width: '45%', height: 300 }}
                titles={['Enrolled Students', 'Excluded Students']}
                showSearch
                filterOption={(inputValue, option) =>
                  option.title.toLowerCase().includes(inputValue.toLowerCase())
                }
              />
              {excludedStudents.map(studentId => {
                const student = enrolledStudents.find(s => s.id === studentId);
                return (
                  <Form.Item
                    key={studentId}
                    name={`exclusion_reason_${studentId}`}
                    label={`Reason for excluding ${student?.name}`}
                    style={{ marginTop: 16 }}
                  >
                    <Input placeholder="e.g., Sick, Family emergency, etc." />
                  </Form.Item>
                );
              })}
            </Form.Item>
          )}

          <Form.Item
            name="notes"
            label="Notes"
          >
            <Input.TextArea
              placeholder="Additional notes about this occurrence"
              rows={3}
            />
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
                  setExcludedStudents([]);
                  setEnrolledStudents([]);
                  setSelectedClassId('');
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
        footer={[
          <Button key="add-exclusion" onClick={() => setExclusionModalVisible(true)}>
            Add Exclusion
          </Button>,
          <Button key="close" onClick={() => {
            setOccurrenceModalVisible(false);
            setSelectedOccurrence(null);
            setAttendanceRecords([]);
          }}>
            Close
          </Button>
        ]}
        width={1200}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>
            {dayjs(selectedOccurrence?.occurrence_date).format('MMM DD, YYYY')} •
            {selectedOccurrence?.start_time} - {selectedOccurrence?.end_time}
          </Text>
          <Divider />
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="Total Enrolled"
                value={selectedOccurrence?.total_enrolled || 0}
                prefix={<TeamOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Present"
                value={attendanceRecords.filter(r => r.attendance_status === 'present').length}
                valueStyle={{ color: '#52c41a' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Absent"
                value={attendanceRecords.filter(r => r.attendance_status === 'absent').length}
                valueStyle={{ color: '#cf1322' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Not Recorded"
                value={attendanceRecords.filter(r => r.attendance_status === 'not_recorded').length}
                valueStyle={{ color: '#8c8c8c' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Excluded"
                value={attendanceRecords.filter(r => r.is_excluded).length}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Col>
          </Row>
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

      <Modal
        title="Edit Class Occurrence"
        open={editOccurrenceModalVisible}
        onCancel={() => {
          setEditOccurrenceModalVisible(false);
          setEditingOccurrence(null);
          editForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditOccurrence}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="start_time"
                label="Start Time"
              >
                <TimePicker
                  format="HH:mm"
                  style={{ width: '100%' }}
                  placeholder="Select start time"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="end_time"
                label="End Time"
              >
                <TimePicker
                  format="HH:mm"
                  style={{ width: '100%' }}
                  placeholder="Select end time"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="notes"
            label="Notes"
          >
            <Input.TextArea
              placeholder="Additional notes about this occurrence"
              rows={3}
            />
          </Form.Item>

          <Form.Item
            name="was_cancelled"
            valuePropName="checked"
          >
            <Checkbox>Cancel this occurrence</Checkbox>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Update Occurrence
              </Button>
              <Button
                onClick={() => {
                  setEditOccurrenceModalVisible(false);
                  setEditingOccurrence(null);
                  editForm.resetFields();
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add Student Exclusion"
        open={exclusionModalVisible}
        onCancel={() => {
          setExclusionModalVisible(false);
          exclusionForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={exclusionForm}
          layout="vertical"
          onFinish={handleAddExclusion}
        >
          <Form.Item
            name="student_id"
            label="Student"
            rules={[{ required: true, message: 'Please select a student' }]}
          >
            <Select
              placeholder="Select student to exclude"
              showSearch
              optionFilterProp="children"
            >
              {attendanceRecords
                .filter(record => !record.is_excluded)
                .map(record => (
                  <Option key={record.student_id} value={record.student_id}>
                    {record.student_name} ({record.grade})
                  </Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="reason"
            label="Reason for Exclusion"
          >
            <Input.TextArea
              placeholder="e.g., Sick, Family emergency, etc."
              rows={3}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Add Exclusion
              </Button>
              <Button
                onClick={() => {
                  setExclusionModalVisible(false);
                  exclusionForm.resetFields();
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

export default Attendance;
