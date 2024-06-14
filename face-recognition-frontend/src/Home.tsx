import React from 'react';
import Sidebar from './Sidebar'; // 引用 Sidebar 组件
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css'; // 确保 Tailwind CSS 被正确引入

const Home: React.FC = () => {
    return (
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar/> {/* 使用 Sidebar 组件 */}
            <div className="flex-1 p-10 w-full min-w-0">
                <h2 className="text-3xl font-bold mb-6">InsightFace Attendance System</h2>
            </div>
        </div>
    );
};

export default Home;
