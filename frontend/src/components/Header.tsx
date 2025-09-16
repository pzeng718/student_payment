import React from 'react';
import { Layout, Typography, Avatar, Dropdown, Button } from 'antd';
import { UserOutlined, LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';

const { Header: AntHeader } = Layout;
const { Title } = Typography;

const Header: React.FC = () => {
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    switch (e.key) {
      case 'logout':
        // Handle logout
        console.log('Logout clicked');
        break;
      case 'profile':
        // Handle profile
        console.log('Profile clicked');
        break;
      case 'settings':
        // Handle settings
        console.log('Settings clicked');
        break;
    }
  };

  return (
        <AntHeader
          style={{
            background: 'linear-gradient(90deg, #fff 0%, #f8f9fa 100%)',
            padding: '0 24px',
            borderBottom: '2px solid #e9ecef',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                background: 'linear-gradient(135deg, #1890ff 0%, #40a9ff 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '18px',
                fontWeight: 'bold',
              }}
            >
              📊
            </div>
            <Title level={3} style={{ margin: 0, color: '#1890ff', fontWeight: 600 }}>
              Student Class Balance Tracker
            </Title>
          </div>

      <Dropdown
        menu={{ items: userMenuItems, onClick: handleMenuClick }}
        placement="bottomRight"
      >
        <Button type="text" style={{ display: 'flex', alignItems: 'center' }}>
          <Avatar icon={<UserOutlined />} style={{ marginRight: 8 }} />
          Admin
        </Button>
      </Dropdown>
    </AntHeader>
  );
};

export default Header;
