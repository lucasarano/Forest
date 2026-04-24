import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Learn from './pages/Learn'
import TeacherDashboard from './pages/TeacherDashboard'
import OpsDashboard from './pages/OpsDashboard'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import { AuthProvider, ProtectedRoute } from './lib/auth'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/learn"
            element={
              <ProtectedRoute role="student">
                <Learn />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher"
            element={
              <ProtectedRoute role="teacher">
                <TeacherDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/ops" element={<OpsDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
