import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MockLogin from './MockLogin'
import RolePicker from './RolePicker'
import TeacherDashboard from './teacher/TeacherDashboard'
import TeacherCourse from './teacher/TeacherCourse'
import NodeDetail from './teacher/NodeDetail'
import StudentDashboard from './student/StudentDashboard'
import StudentCourse from './student/StudentCourse'
import GraphAssignment from './student/GraphAssignment'
import NodeChat from './student/NodeChat'
import TestMode from './student/TestMode'

const MockRoutes = () => {
  return (
    <Routes>
      <Route index element={<MockLogin />} />
      <Route path="roles" element={<RolePicker />} />
      <Route path="teacher" element={<TeacherDashboard />} />
      <Route path="teacher/course/:courseId" element={<TeacherCourse />} />
      <Route path="teacher/course/:courseId/node/:nodeId" element={<NodeDetail />} />
      <Route path="student" element={<StudentDashboard />} />
      <Route path="student/course/:courseId" element={<StudentCourse />} />
      <Route path="student/course/:courseId/graph/:assignmentId" element={<GraphAssignment />} />
      <Route path="student/course/:courseId/graph/:assignmentId/node/:nodeId" element={<NodeChat />} />
      <Route path="student/course/:courseId/graph/:assignmentId/test" element={<TestMode />} />
      <Route path="*" element={<Navigate to="/mockup" replace />} />
    </Routes>
  )
}

export default MockRoutes
