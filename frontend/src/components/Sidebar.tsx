import React from 'react';
import { Layout, Menu } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  UserOutlined,
  BookOutlined,
  DollarOutlined,
  CalendarOutlined,
  BarChartOutlined
} from '@ant-design/icons';

const { Sider } = Layout;

const Sidebar: React.FC = () => {
  const location = useLocation();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: <Link to="/dashboard">Dashboard</Link>,
    },
    {
      key: '/students',
      icon: <UserOutlined />,
      label: <Link to="/students">Students</Link>,
    },
    {
      key: '/classes',
      icon: <BookOutlined />,
      label: <Link to="/classes">Classes</Link>,
    },
    {
      key: '/payments',
      icon: <DollarOutlined />,
      label: <Link to="/payments">Payments</Link>,
    },
    {
      key: '/attendance',
      icon: <CalendarOutlined />,
      label: <Link to="/attendance">Attendance</Link>,
    }
  ];

  return (
    <Sider
      collapsible
      collapsedWidth={80}
      theme="dark"
    >
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                background: 'linear-gradient(135deg, #1890ff 0%, #40a9ff 100%)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '20px',
                fontWeight: 'bold',
                margin: '0 auto 8px',
                boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
              }}
            >
              📊
            </div>
            <div
              style={{
                color: '#fff',
                fontWeight: 600,
                fontSize: '14px',
                letterSpacing: '0.5px',
              }}
            >
              Student Tracker
            </div>
            <div
              style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '11px',
                marginTop: '4px',
              }}
            >
              Management System
            </div>
          </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
      />
    </Sider>
  );
};

export default Sidebar;
