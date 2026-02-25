import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import LearningTree from './pages/LearningTree'
import ProtectedRoute from './components/ProtectedRoute'
import MockRoutes from './mockup/MockRoutes'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tree/:treeId"
            element={
              <ProtectedRoute>
                <LearningTree />
              </ProtectedRoute>
            }
          />
          <Route path="/mockup/*" element={<MockRoutes />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
