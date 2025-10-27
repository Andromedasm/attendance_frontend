import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Home from './Home';
import Capture from './Capture';
import ReRegister from './ReRegister';
import Verify from './Verify';
import Liveness from './Liveness';
import Attendance from './Attendance';
import Manual from './Manual';
import './App.css';

const App: React.FC = () => {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/capture" element={<Capture />} />
                <Route path="/re_register" element={<ReRegister />} />
                <Route path="/verify" element={<Verify />} />
                <Route path="/liveness" element={<Liveness />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/manual" element={<Manual/>}/>
            </Routes>
        </Router>
    );
};

export default App;

