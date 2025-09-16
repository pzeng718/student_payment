import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Layout, theme } from 'antd';

// Components
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Classes from './pages/Classes';
import Payments from './pages/Payments';
import Attendance from './pages/Attendance';
import Sidebar from './components/Sidebar';
import Header from './components/Header';

// Styles
import './App.css';

const { Content } = Layout;

const App: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <Router>
        <Layout style={{ minHeight: '100vh' }}>
          <Sidebar />
          <Layout style={{ marginLeft: 200 }}>
            <Header />
            <Content
              style={{
                margin: '24px 16px',
                padding: 24,
                background: colorBgContainer,
                borderRadius: borderRadiusLG,
                minHeight: 280,
              }}
            >
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/students" element={<Students />} />
                <Route path="/classes" element={<Classes />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/attendance" element={<Attendance />} />
              </Routes>
            </Content>
          </Layout>
        </Layout>
      </Router>
    </ConfigProvider>
  );
};

export default App;
