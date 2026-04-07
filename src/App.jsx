import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import LearningTree from './pages/LearningTree'
import MVP from './pages/MVP'
import MVPAdmin from './pages/MVPAdmin'
import MVPV2 from './pages/MVPV2'
import MVPV2Admin from './pages/MVPV2Admin'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/MVP" element={<MVP />} />
          <Route path="/mvp" element={<MVP />} />
          <Route path="/mvp-admin" element={<MVPAdmin />} />
          <Route path="/mvp-v2" element={<MVPV2 />} />
          <Route path="/mvp-v2-admin" element={<MVPV2Admin />} />
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
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
