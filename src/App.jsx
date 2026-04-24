import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Learn from './pages/Learn'
import TeacherDashboard from './pages/TeacherDashboard'
import OpsDashboard from './pages/OpsDashboard'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/ops" element={<OpsDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
