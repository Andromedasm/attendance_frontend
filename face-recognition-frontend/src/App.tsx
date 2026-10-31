import React from 'react';
// ❌ 不要再从 react-router-dom 引入 BrowserRouter
import { Route, Routes } from 'react-router-dom';
import Home from './Home';
import Capture from './Capture';
import ReRegister from './ReRegister';
import Verify from './Verify';
import Liveness from './Liveness';
import Attendance from './Attendance';
import Manual from './Manual';
import MobileAttendance from "./MobileAttendance";
import './App.css';

const App: React.FC = () => {
  return (
    // ✅ 只保留 <Routes> + <Route> 即可
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/capture" element={<Capture />} />
      <Route path="/re_register" element={<ReRegister />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/liveness" element={<Liveness />} />
      <Route path="/attendance" element={<Attendance />} />
      <Route path="/manual" element={<Manual />} />
      <Route path="/mobile_attendance" element={<MobileAttendance />} />
    </Routes>
  );
};

export default App;
